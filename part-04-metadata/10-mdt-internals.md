# 第十章：MDS 与 MDT 核心架构 —— 元数据流水线、意向驱动与 Nodemap 安全防线

> “在分布式存储领域，数据 IO 往往由网络带宽和磁盘吞吐决定，而决定整个文件系统生死存亡与用户体验上限的，永远是元数据子系统（Metadata Subsystem）。一个数十亿文件的集群，如果打开文件、创建目录甚至敲一个 `ls` 命令都要卡顿数秒，再庞大的存储容量也是废铁。Lustre 的 MDT 架构在并发控制、只读与修改管道分离、复合意向锁处理以及多租户安全映射上，展现了无与伦比的工程纵深。”

在第三部分中，我们拆解了 [OBD 模型](../part-03-obd-foundation/07-obd-model.md)、[现代对象栈](../part-03-obd-foundation/08-lu-object.md) 与 [128 位 FID 寻址体系](../part-03-obd-foundation/09-fid-concept.md)。从本章开始，我们将正式进入 **第四部分：元数据子系统深入剖析（Metadata Subsystem）**。

本章我们将直面元数据服务器的心脏：
- 澄清 MDS（服务器实体）与 MDT（逻辑目标对象）的架构映射；
- 剖析只读与修改型（Reint）请求的双轨流水线处理；
- 深入源码解析意向锁调度策略中枢 [`mdt_intent_policy()`](https://github.com/lustre/lustre-release/blob/master/lustre/mdt/mdt_handler.c#L5485)；
- 拆解支撑超算多租户合规的 **Nodemap 身份映射与权限压制引擎**；
- 面对千万级碎文件并发风暴的 **生产级调优处方**。

---

## 10.1 概念明晰：MDS 与 MDT 的物理与逻辑关系

在初学 Lustre 时，很多工程师常将 MDS 与 MDT 混为一谈：

```text
+-------------------------------------------------------------------------------+
|                       MDS (硬件/节点) vs MDT (逻辑存储目标)                   |
+-------------------------------------------------------------------------------+

[物理机架 / 裸金属服务器]              [逻辑服务与底层文件系统]
+-------------------------------+       +-------------------------------+
|    MDS 01 (元数据主服务器)    | ====> | MDT 0000 (根目录及基础命名空间)
|  - 双路 64 核 CPU, 512GB 内存 |       | - 挂载全闪 NVMe 阵列 /dev/nvme0n1
|  - 200Gb/s InfiniBand 网卡    |       +-------------------------------+
|  - 运行 mdt.ko 内核模块       | ====> | MDT 0001 (子目录分布式命名空间)
+-------------------------------+       | - 挂载全闪 NVMe 阵列 /dev/nvme1n1
                                        +-------------------------------+
```

- **MDS（Metadata Server，元数据服务器）**：
  物理硬件节点或虚拟机，负责提供高主频 CPU、大容量低延迟 ECC 内存和高速网卡，承载元数据内核服务线程池；
- **MDT（Metadata Target，元数据目标）**：
  由 MDS 导出的逻辑对象存储设备，每一个 MDT 对应一块独立的物理存储介质（如基于 ldiskfs 或 ZFS 格式化的 NVMe 卷）。在单一文件系统中，MDT0000 永远承载全局根目录 `/`，其他 MDT 则承载分布式子目录分片。

---

## 10.2 元数据双轨流水线：只读与修改型（Reint）处理

在 MDT 内部，所有的请求被严格划分为两条性质完全相反的处理流水线：**只读流水线（Read-Only Pipeline）** 与 **修改型流水线（Reintegration Pipeline，简称 Reint）**。

```text
+-------------------------------------------------------------------------------+
|                       MDT 请求处理双轨流水线全景                              |
+-------------------------------------------------------------------------------+

                      来自客户端的 Portal RPC (Portal 12)
                                       |
                                       v
                             tgt_request_handle()
                                       |
                   +-------------------+-------------------+
                   | (判断 RPC 报文中的顶级操作码)         |
                   v                                       v
      [只读操作: MDS_GETATTR,                 [修改型操作: MDS_REINT]
       MDS_STATFS, MDS_READPAGE]                           |
                   |                                       v
                   v                              mdt_reint_internal()
          mdt_getattr_name()                               |
                   |                    +------------------+------------------+
                   v                    | (根据 rr_opcode 分发到具体的事务执行器)
       直接读本地 PageCache / Dcache    v                                     v
       无需开启底层磁盘事务日志!     mdt_reint_create()               mdt_reint_unlink()
                   |                 - 启动两阶段事务                  - 检查硬链接数
                   |                 - 申请新 FID / 分配 inode         - 标记孤儿对象
                   |                 - 写入 Ext4 htree / ZFS           - 启动分布式下刷
                   |                    |                                     |
                   +--------------------+-------------------------------------+
                                        |
                                        v
                                 回包并携带事务号
```

### 10.2.1 为什么称为“Reintegration（重整合）”？

很多内核开发者会好奇：为什么在代码中修改元数据不叫 `mdt_modify` 或 `mdt_write`，而偏偏叫 **`reint`（Reintegration，重整合）**？

这源自分布式文件系统（特别是早期的 Coda 文件系统）经典哲学：
客户端在本地缓存中可能已经执行了乐观操作，当它把修改推向权威服务器时，这个过程本质上是将**客户端视角的状态“重新整合（Reintegrate）”进服务器的全局主状态机中**。

查看 [`lustre/include/uapi/linux/lustre/lustre_idl.h`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_idl.h)，Reint 定义了 8 种核心操作码：

```c
enum mds_reint_op {
	REINT_SETATTR	= 1,	/* 修改属性 (chmod, chown, utimes) */
	REINT_CREATE	= 2,	/* 创建普通文件、特殊节点、管道、FIFO */
	REINT_LINK	= 3,	/* 创建硬链接 (hard link) */
	REINT_UNLINK	= 4,	/* 删除文件或目录 (unlink, rmdir) */
	REINT_RENAME	= 5,	/* 文件/目录重命名 (rename) */
	REINT_OPEN	= 6,	/* 意向打开并创建文件 (open with O_CREAT) */
	REINT_SETXATTR	= 7,	/* 设置扩展属性 (setxattr) */
	REINT_MIGRATE	= 9,	/* DNE 跨 MDT 目录在线迁移 */
};
```

所有进入 `mdt_reint()` 的请求，都必须通过上文提到的 [DT 两阶段事务契约](../part-03-obd-foundation/08-lu-object.md#83-数据对象栈dtdt_device-与两阶段事务契约) 进行严格的资源预留（Declare），并在本地日志持久化落盘后分配全局单调递增的 `pb_transno`。

---

## 10.3 复合意向锁驱动的完整时序实战

在 [第六章](../part-02-rpc-and-locks/06-ldlm-locks.md) 中，我们理解了 1-RTT 意向锁（Intent Lock）的理论。现在我们直面其在 MDT 端的神经反射中枢：[`lustre/mdt/mdt_handler.c:5485`](https://github.com/lustre/lustre-release/blob/master/lustre/mdt/mdt_handler.c#L5485) 的 **`mdt_intent_policy()`**。

```c
/* lustre/mdt/mdt_handler.c */
static int mdt_intent_policy(const struct lu_env *env,
			     struct ldlm_namespace *ns,
			     struct ldlm_lock **lockp, void *reqarg,
			     enum ldlm_mode mode, __u64 flags, void *data)
{
	struct mdt_thread_info *info = mdt_th_info(env);
	struct ldlm_intent *it = reqarg;
	
	switch (it->it_op) {
	case IT_OPEN:
	case IT_CREAT | IT_OPEN:
		return mdt_intent_open(it->it_op, env, ns, lockp, reqarg...);
	case IT_GETATTR:
		return mdt_intent_getattr(it->it_op, env, ns, lockp, reqarg...);
	case IT_LAYOUT:
		return mdt_intent_layout(it->it_op, env, ns, lockp, reqarg...);
	case IT_GETXATTR:
		return mdt_intent_getxattr(it->it_op, env, ns, lockp, reqarg...);
	...
	}
}
```

### 10.3.1 `IT_OPEN` 穿透实战：从鉴权到条带打包

当客户端发起一个带有 `IT_OPEN` 意向的 `LDLM_ENQUEUE` 时，`mdt_intent_open()` 在单个函数调用栈内完成了原本需要数次系统调用的全套动作：

```text
+-------------------------------------------------------------------------------+
|                       mdt_intent_open 执行时序链路                            |
+-------------------------------------------------------------------------------+

1. 解析路径名:
   mdt_lookup_name() -> 定位父目录 inode，检索目标子文件的 FID
         |
         v
2. 权限与身份鉴定:
   mdt_auth_open() -> 校验 Nodemap 映射、ACL 规则与 POSIX 模式 (r/w/x)
         |
         v
3. 锁授予与意向处理:
   - 若文件不存在且带有 O_CREAT:
     就地调用 mdo_create() 分配新 FID 并插入目录项!
   - 为该客户端授予 MDS_INODELOCK_OPEN 与 MDS_INODELOCK_UPDATE 锁
         |
         v
4. 捎带打包核心载荷 (Piggybacking Payload):
   - 打包文件的条带布局 (LOV EA: 包含所有对应 OST 的列表与 stripe_size)
   - 打包文件的最新属性 (struct mdt_body: 大小、atime、mtime、nlink)
   - 打包打开句柄与锁 Handle
         |
         v
5. 原路返回 1 次网络 RPC 应答!
```

客户端在收到这个应答包的瞬间，它的 Linux 内核本地不仅拿到了分布式锁，本地 VFS 的 `struct dentry`、`struct inode`、文件条带映射与打开文件表项（`struct file`）被**同时一次性全部初始化完毕**！

---

## 10.4 企业级安全与多租户隔离：Nodemap 身份映射引擎

在高校、科研实验室以及多租户云平台上，Lustre 面临着一个极其严峻的安全物理现实：
**计算节点的 Root 权限通常是失控的**（例如物理机直接交付给算法工程师，或者容器内拥有 `uid=0`）。如果客户端能以 Root 身份向 MDT 发送 RPC，恶意用户可以随意修改或删除全集群任何人的数据！

为此，Lustre 在内核中构筑了 **Nodemap 身份映射引擎**（[`lustre/nodemap/`](https://github.com/lustre/lustre-release/blob/master/lustre/nodemap/)）。

```text
+-------------------------------------------------------------------------------+
|                       Nodemap 多租户安全映射与隔离拓扑                        |
+-------------------------------------------------------------------------------+

    租户 A 算力集群                                         租户 B 算力集群
  [192.168.10.0/24@tcp]                                   [192.168.20.0/24@tcp]
           |                                                       |
           v                                                       v
+-------------------------------+                       +-------------------------------+
|     Nodemap: "ai_training"    |                       |     Nodemap: "biomed_lab"     |
| - squash_uid: 65534 (nobody)  |                       | - squash_uid: 65534 (nobody)  |
| - admin: 0 (禁止 Root 提权!)   |                       | - idmap: 1000:2000 (UID映射)  |
| - readonly: 0 (允许读写)      |                       | - readonly: 1 (只读沙箱视图!) |
+---------------+---------------+                       +---------------+---------------+
                |                                                       |
                +---------------------------+---------------------------+
                                            |
                                            v
                               MDT 服务端安全鉴权层
                    严格按照映射后的 UID/GID 校验 POSIX 与 ACL 权限!
```

### 10.4.1 Nodemap 核心管控三原则

1. **Root Squash（Root 权限压制）**：
   如果客户端 Nodemap 设置了 `admin=0`，来自该客户端的 `uid=0` 在进入 MDT 栈之前，被物理强制替换为 `squash_uid`（默认为 65534 即 `nobody`）。无论用户在计算节点上怎么 `sudo`，向存储写数据时立刻被降维为无权游民。
2. **Dynamic ID Mapping（动态 UID/GID 映射）**：
   不同租户的集群内部 UID 往往彼此冲突（例如大家都用 `uid=1000`）。管理员无需修改客户端系统，只需在服务端配置映射规则：
   ```bash
   # 将来自该 NID 范围的 UID 1000 映射为底层的真实物理 UID 5001
   lctl nodemap_add_idmap --name ai_training --idtype uid --idmap 1000:5001
   ```
3. **只读沙箱（Read-Only View）**：
   通过配置 `readonly=1`，来自该 NID 网段的客户端只能执行查询和读取，任何修改型 RPC（Reint）直接在入口层被拦截并抛出 `-EROFS`。

---

## 10.5 生产实战：千万级碎文件元数据雪崩与 MDT 极致调优

### 10.5.1 现场故障复盘：单目录百万文件导致 MDT 假死

某自动驾驶模型训练团队，将 5,000,000 张相机采集图片直接写入了同一个目录 `/mnt/lustre/camera_data/` 下。随后，数百个训练作业并发对该目录执行 `ls -U` 和 `open()`。
MDT CPU 利用率瞬间打满到 100%，系统负载狂飙至 800 以上，整个存储集群的元数据服务彻底停摆。

### 10.5.2 根因定位与排查链条

通过 `perf top` 和 Lustre proc 节点，运维团队发现了病灶：
1. **Ext4 Htree 锁严重争抢**：
   单个目录下存在数百万条记录，底层 ldiskfs 的目录索引树深达 4 层以上。每一个创建和查询操作都需要持有该父目录 inode 的互斥信号量；
2. **客户端修改型 RPC 窗口打满**：
   客户端默认对单 Target 允许几十个并发修改 RPC，导致成千上万个线程在服务端同一个目录锁上疯狂 Spinlock 锁死；
3. **JBD2 日志刷盘墙**：
   数百万碎文件创建伴随着成兆字节的元数据修改，底层 SSD 的同步 Journal 写入队列严重拥塞。

### 10.5.3 生产级调优军规

针对海量小文件与高并发元数据场景，必须采用体系化调优策略：

```bash
# 1. 压制单客户端最大并发修改型 RPC 深度 (防止单节点压跨目录锁)
# 默认为 8，针对极端高并发目录降为 4，强制客户端在本地排队
lctl set_param mdc.*.max_mod_rpcs_per_client=4

# 2. 启用 Commit-on-Sharing (CoS 共享时提交)
# 当多个客户端修改相同目录或文件时，自动合并底层事务落盘，将 IOPS 提升数倍!
lctl set_param mdt.*.commit_on_sharing=1

# 3. 调大元数据读取内联缓存与目录预取
lctl set_param mdt.*.dir_read_ahead=1

# 4. 彻底解决根因: 开启 DNE2 分布式目录条带化 (详见第十一章)
# 将单目录透明分片到 4 台不同的 MDT 上，并发承载力瞬间提升 4 倍!
lfs mkdir -i 0 -c 4 /mnt/lustre/distributed_dir
```

---

## 10.6 真实生产事故复盘：百万小文件解压引发 MDT 内存 OOM 与线程雪崩

### 10.6.1 故障现象与现场特征
某生物信息学超级计算中心，一个用户在登录节点执行 Shell 脚本，解压包含 1,500 万个小文本文件的 `tar.gz` 压缩包到共享目录。
十分钟后，MDS 主机内存（原配 128GB）使用率飙升至 99%，Linux OOM Killer 被唤醒，果断杀死了核心管理进程；同时其他正在运行的数千个生信分析作业全线卡死报错：
```text
LustreError: 31201:0:(mdc_reint.c:210:mdc_reint()) @@@ MDT0000 is not responding!
mkdir: cannot create directory 'sample_batch_09': Connection timed out
```

### 10.6.2 排查过程与排错弯路
1. **最初怀疑**：MDT 后端存储磁盘阵列掉盘或性能瓶颈。
2. **性能监控溯源**：检查 MDT 物理 NVMe 写入延迟仅 0.3ms，IO 并没有饱和，但 `mdt_reint` 队列排队数突破 100,000，MDT 的内存全部被 `kmalloc-1024` 与 `ldlm_lock_slab` 吃空！
3. **深入分析**：
   单机脚本在同一个父目录下以单线程连续调用 `mkdir` 和 `touch`：
   - 每次创建小文件，MDC 都必须向上申请该目录的 IBITS 意向修改锁；
   - 尽管使用了 Commit-on-Sharing，但由于单个目录下目录项（Dentry）膨胀至数百万，底层的 ext4/ldiskfs HTree 索引树发生大规模剧烈分裂（Split）；
   - MDT 上每个打开的 File Descriptor 和正在处理的事务句柄累积在内存中，而未释放的元数据锁为了保持缓存，在 `ldlm_pool` 缩减机制生效前瞬间击穿了物理内存上限，触发 OOM 宕机。

### 10.6.3 根因定性与修复方案
- **根本原因**：未开启单目录条带化（DNE2），将上千万文件强塞进单台 MDT 的单个父目录，单机内存与单核 B-Tree 锁争用打满。
- **治理与调优对策**：
  1. 紧急执行目录打散，限制单目录内文件数不超过 10 万个；
  2. 启用 DNE2 跨 MDT 目录条带化：
     ```bash
     lfs mkdir -i 0 -c 8 /mnt/lustre/bio_datasets/
     ```
  3. 配置 MDT 内存锁的主动淘汰水位线，强制提早驱逐未用锁：
     ```bash
     lctl set_param ldlm.namespaces.MDT0000.max_unused=50000
     ```
  优化后，解压吞吐提升 6 倍，MDT 内存稳定运行在 45% 安全线以内。

---

## 10.7 MDT 核心调优与元数据避坑 Checklist

- [ ] **开启共享时提交（Commit-on-Sharing, CoS）**：
  核验 `lctl get_param mdt.*.commit_on_sharing` 必须为 1。该选项能使多个客户端对同一目录并发写时的事务批处理落盘，提升小文件元数据吞吐 3~5 倍。
- [ ] **MDT 服务线程池规模设置（threads_max）**：
  对于 NVMe 全闪 MDT，将 `mdt.MDS.mdt.threads_max` 设置为 512 或 1024，并配合 `threads_min=128`，防止元数据突发洪峰时频繁创建线程导致延迟毛刺。
- [ ] **Nodemap 身份映射与 Root 压制**：
  多租户集群必须在 MGS 上配置 Nodemap，对普通计算节点强制启用 `root_squash`，将计算节点的 `uid=0` 强行降级为 `nobody (65534)`，防止用户恶意篡改系统关键文件。
- [ ] **目录预读取（dir_read_ahead）激活**：
  确认客户端与服务端开启 `dir_read_ahead=1`，大幅降低 `ls -U` 或批量遍历超大目录时的往返网络开销。
- [ ] **MDT 盘可用空间与 Inode 比例监控**：
  定期运行 `lfs df -i` 监控各 MDT 的 Inode 消耗进度。若 Inode 耗尽而容量仍剩，将导致无法创建新文件。

---

## 10.8 核心源码对照表

| 核心抽象 / 模块 | 源码文件 | 核心函数 / 数据结构 | 架构功能与生产定位 |
| :--- | :--- | :--- | :--- |
| **元数据处理中枢** | [`mdt_handler.c`](https://github.com/lustre/lustre-release/blob/master/lustre/mdt/mdt_handler.c) | `mdt_getattr()`, `mdt_reint()` | 只读与修改型操作双轨流水线入口 |
| **意向决策引擎** | [`mdt_handler.c`](https://github.com/lustre/lustre-release/blob/master/lustre/mdt/mdt_handler.c) | `mdt_intent_policy()`, `mdt_intent_open()` | 1-RTT 意向锁调度、权限校验与条带打包 |
| **修改型事务流** | [`mdt_reint.c`](https://github.com/lustre/lustre-release/blob/master/lustre/mdt/mdt_reint.c) | `mdt_reint_create()`, `mdt_reint_unlink()` | 8 种修改操作的事务声明与底层分发 |
| **Nodemap 鉴权** | [`nodemap_handler.c`](https://github.com/lustre/lustre-release/blob/master/lustre/nodemap/nodemap_handler.c) | `nodemap_add()`, `nodemap_map_id()` | 基于 NID 的多租户划分与 UID/GID 强行映射 |
| **元数据线程模型** | [`mdt_internal.h`](https://github.com/lustre/lustre-release/blob/master/lustre/mdt/mdt_internal.h) | `struct mdt_thread_info` | 绑定于 `lu_env` 的元数据执行线程上下文 |

---

## 10.7 本章小结

在本章中，我们解剖了 Lustre 元数据服务器的核心引擎：
1. **只读与修改型（Reint）双轨分流**：保证了高并发查询操作不会被繁重的底层磁盘日志事务所阻塞；
2. **意向锁调度策略（`mdt_intent_policy`）**：在内核中将加锁、查找、创建、鉴权与条带打包高度内聚，造就了极致的 1-RTT 性能；
3. **Nodemap 体系**：在不触碰客户端代码的前提下，在服务端入口处筑起了坚不可摧的多租户合规与 Root 压制防线。

然而，单台 MDT 无论如何调优，其能够容纳的 CPU 核心、内存通道与磁盘 IOPS 终究受制于单机物理极限。当集群文件数量突破数十亿时，单 MDT 必成瓶颈。
在下一章 [第十一章：DNE（Distributed Namespace Engine）多元数据水平扩展](11-dne-architecture.md) 中，我们将探索 Lustre 最宏伟的水平扩展工程 —— **DNE 架构、目录哈希条带化与跨节点分布式两阶段提交**！
