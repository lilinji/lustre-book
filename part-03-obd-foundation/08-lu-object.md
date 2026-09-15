# 第八章：现代对象栈模型：`lu_object`、`dt_device` 与 `md_device` —— 复合对象、虚拟执行栈与两阶段事务契约

> “在 C 语言构建的 Linux 内核世界里，实现一套真正的面向对象分层模型是极其危险而迷人的。随着 Lustre 跨入 2.x 时代，早期扁平的 `obd_ops` 已经无法承载多元数据分片（DNE）、条带布局镜像（FLR）与严格的 ACID 事务。Lustre 展开了一场惊心动魄的架构重构：基于 `lu_object` 的复合对象体系应运而生。它不仅优雅地模拟了面向对象继承与组合，更在 8KB 狭小的内核栈空间内创造了奇迹。”

在上一章 [OBD 分层模型与设备生命周期](07-obd-model.md) 中，我们理解了以 `obd_device` 为顶层容器的驱动堆叠。但如果深入到单个文件对象的读写、元数据创建与事务提交，`obd_ops` 过于粗糙的粒度便捉襟见肘。

本章我们将深入现代 Lustre 内核的心脏地带，拆解由 [`lu_object.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lu_object.h)、[`dt_object.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/dt_object.h) 与 [`md_object.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/md_object.h) 构筑的面向对象分层体系。

---

## 8.1 为什么废弃老旧单一的 `obd_ops`？

在 Lustre 1.x 时代，无论对端是网络客户端、磁盘阵列还是本地存储，所有的调用都塞在 `struct obd_ops` 这一张扁平的表里：
- 一个文件的创建可能需要同时修改本地目录树、分配条带布局、更新 OST 对象配额；
- 如果全部用 `obd_ops->o_create` 递归调用，接口参数变得极其臃肿，充斥着各种 `void *` 强转指针；
- 更致命的是：**缺乏真正的分布式两阶段事务协调**。如果元数据写入成功，但条带分配因配额不足失败，系统无法执行原子回滚。

为此，Sun/Oracle 时代的 Lustre 核心团队借鉴了现代微内核与编译器的分层抽象思想，设计了 **Lustre Object（简称 `lu_object`）** 架构。它将“设备”与“对象”彻底拆分为两大平行分层：
1. **元数据对象栈（MD Stack）**：处理目录项、属性、布局策略与 ACL；
2. **数据对象栈（DT Stack）**：处理纯粹的对象数据流、Extent 映射与本地文件系统事务（ACID）。

---

## 8.2 现代架构基石：`lu_object` 核心三剑客

```
+-------------------------------------------------------------------------------+
|                       lu_object 复合对象体系架构全景                          |
+-------------------------------------------------------------------------------+

                             struct lu_site
                   (包含 rhashtable 极速全局对象哈希)
                                   |
                                   v
                      struct lu_object_header
                      - loh_fid: 全局唯一 FID
                      - loh_ref: 原子引用计数
                      - loh_layers: 挂载的所有分层链表
                                   |
         +-------------------------+-------------------------+
         |                         |                         |
         v                         v                         v
+-----------------+       +-----------------+       +-----------------+
| struct mdd_obj  |       | struct lod_obj  |       | struct osd_obj  |
| (元数据业务层)  |       | (布局分发层)    |       | (底层磁盘驱动)  |
| - lu_object     |       | - lu_object     |       | - lu_object     |
+-----------------+       +-----------------+       +-----------------+
         |                         |                         |
         v                         v                         v
  mdd_device                lod_device                osd_device
  (lu_device)               (lu_device)               (lu_device)
```

### 8.2.1 复合对象（Compound Object）哲学

在传统的面向对象语言（如 C++ 或 Java）中，派生类通过继承直接扩展基类。但在内核 C 语言中，没有虚基表与运行时多态。
Lustre 采用了 **“单一头部，多层附着”的复合对象模型（Compound Object）**：

- **`struct lu_object_header`**（[`lustre/include/lu_object.h:583`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lu_object.h#L583)）：
  代表一个逻辑实体的唯一标识。它持有该对象的 128 位全局 FID（`loh_fid`）、引用计数、LRU 链表节点以及挂入全局哈希表（`lu_site`）的锚点。
- **`struct lu_object`**（[`lustre/include/lu_object.h:519`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lu_object.h#L519)）：
  代表该逻辑实体在**某一个特定软件分层**中的切面（Aspect）。每个切面持有指向自身驱动 `struct lu_device` 的指针和本层的操作方法表 `lu_object_operations`。
- **一次分配，层层包嵌**：
  在物理内存中，一个复合对象并不是碎片化分配的，而是由上层驱动一次性分配包含各层结构的连续内存空间，通过 `loh_layers` 串接在一起，极大地降低了内存碎片和分配延迟。

### 8.2.2 破解内核栈溢出奇迹：`lu_env` 与 `lu_context`

在 Linux 内核中，每个线程的栈空间非常狭窄（x86-64 默认为 16KB，旧内核甚至只有 8KB）。
而在 Lustre 中，一次文件操作需要穿透：
$$\text{VFS} \to \text{llite} \to \text{mdc} \to \text{ptlrpc} \to \text{mdt} \to \text{mdd} \to \text{lod} \to \text{osd-ldiskfs} \to \text{ext4/JBD2}$$
跨越近 10 层内核子系统！如果每一层函数都在栈上声明几个局部结构体，内核栈将迅速被踩穿（Kernel Stack Overflow），引发不可逆的整机宕机！

Lustre 创造性地设计了 **`struct lu_env` 与 `struct lu_context`（堆上虚拟执行栈）**（[`lustre/include/lu_object.h:1222`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lu_object.h#L1222)）：

```c
struct lu_env {
	/* "Local" context: 替代局部变量的堆上线程上下文 */
	struct lu_context  le_ctx;
	/* "Session" context: 用于跨请求生命周期的上下文 */
	struct lu_context *le_ses;
};
```

**工作机制**：
每个内核工作线程在初始化时，都在堆内存中预先分配了一块大容量的线程局部存储（TLS）。
当函数需要局部变量时，**严禁在 C 语言栈上直接声明大结构体**，而是通过键值索引从 `lu_env` 中获取预分配好的内存：

```c
/* 优雅的零栈开销写法 */
struct mdd_thread_info *info = lu_env_info(env, &mdd_thread_key);
```

通过这一绝技，Lustre 将整个复杂对象栈的内核调用栈深度严格压制在 3KB 以内，彻底化解了超长调用链与极小内核栈的物理死穴！

---

## 8.3 数据对象栈（DT）：`dt_device` 与两阶段事务契约

当操作穿透到数据落地层时，由 **Disk Target（DT）子系统** 接管。其核心是 [`struct dt_device`](https://github.com/lustre/lustre-release/blob/master/lustre/include/dt_object.h) 与 [`struct dt_object`](https://github.com/lustre/lustre-release/blob/master/lustre/include/dt_object.h)。

### 8.3.1 彻底根除“半死不活”：两阶段声明与执行

在传统文件系统中，如果一个写操作需要修改 3 个数据块和 1 个 inode 属性，往往是“边写边申请”。如果写到第 3 个块时磁盘空间满了，或者日志空间不足，系统通常处于半死不活的脏状态，极易导致数据损坏。

Lustre DT 体系强制推行严格的 **两阶段事务契约（Declare-Execute Protocol）**：

```
+-------------------------------------------------------------------------------+
|                       DT 两阶段事务 (Declare-Execute) 时序                    |
+-------------------------------------------------------------------------------+

[第一阶段: 预估与资源预留 (Declare Phase)]
th = dt_trans_create(env, dev);
  |
  +-> dt_declare_create(env, obj, attr, th);   // 声明: 我打算创建一个对象
  +-> dt_declare_insert(env, dir, name, th);   // 声明: 我打算在目录插一条记录
  +-> dt_declare_write(env, obj, buf, off, th);// 声明: 我打算写入 4KB 数据
  |
  [底层 OSD 计算底层 JBD2/ZFS 日志 Credits, 锁定磁盘配额]
  |
  v
dt_trans_start(env, dev, th); // 统一启动事务! 所有资源在此刻必须完全得到保证!

[第二阶段: 物理落地执行 (Execution Phase)]
  |
  +-> dt_create(env, obj, attr, th);           // 物理创建
  +-> dt_insert(env, dir, name, th);           // 物理插入目录项
  +-> dt_write(env, obj, buf, off, th);        // 物理写入数据
  |
  v
dt_trans_stop(env, dev, th);  // 提交并关闭事务
```

- **第一阶段（Declare）**：上层驱动向底层 OSD 逐一“申报”本次事务可能触碰的所有资源。OSD 驱动计算所需的日志 Credits、配额并预留空间。如果空间不足，在此阶段立即安全报错退出，**底层磁盘状态分毫不动**；
- **第二阶段（Execute）**：只有通过了 Declare 阶段，`dt_trans_start()` 才会真正开启底层文件系统事务。此时的物理写入被保证绝对成功，彻底杜绝了写入中途崩溃导致的原子性撕裂！

### 8.3.2 事务落盘异步回调：`dt_txn_commit_cb`

在分布式系统中，服务端必须精准知道某个本地事务何时才真正被 `sync` 刷入物理介质，以决定何时推进 `pb_last_committed` 并通知客户端释放重放队列。

Lustre DT 提供了基于回调的通知机制（[`lustre/include/dt_object.h:75`](https://github.com/lustre/lustre-release/blob/master/lustre/include/dt_object.h#L75)）：

```c
struct dt_txn_commit_cb {
	struct list_head	dcb_linkage;
	dt_cb_t			dcb_func;	/* 物理落盘完成后的回调函数 */
	void			*dcb_data;
	...
};
```

开发者可以向正在执行的事务句柄 `th` 注册一个 commit callback。当底层的 Ext4/JBD2 或 ZFS 事务组（TXG）真正完成磁盘物理落盘时，硬件中断与工作队列自动触发该回调，向全集群广播事务持久化喜讯。

---

## 8.4 元数据对象栈（MD）：`md_device` 与分层委托拓扑

在元数据服务器（MDT）端，负责驱动调度的是 **Metadata（MD）对象栈**：

```
+-------------------------------------------------------------------------------+
|                       MDT 服务端元数据分层堆栈                                |
+-------------------------------------------------------------------------------+

+---------------------------------------------------------------+
| mdt_device: 网络 RPC 解析与解包层 (将 Portal RPC 翻译为 MD 调用)|
+-------------------------------+-------------------------------+
                                |
                                v
+---------------------------------------------------------------+
| mdd_device: 核心元数据语义层 (POSIX 权限校验、硬链接、时间戳更新)|
+-------------------------------+-------------------------------+
                                |
                                v
+---------------------------------------------------------------+
| lod_device: 布局与对象调度器 (Logical Object Device)          |
|  - 决定文件分几个条带? 放在哪些 OST 上?                       |
|  - 目录属于哪个分片? (DNE 路由)                               |
+---------------+-------------------------------+---------------+
                |                               |
                v (本地元数据)                   v (远端 OST 代理)
+-------------------------------+ +-------------------------------+
| osd-ldiskfs / osd-zfs 驱动    | | osp_device (OSD 代理驱动)     |
| (负责在本地磁盘写入 inode/EA) | | (通过网络 RPC 向远端 OST 下发)|
+-------------------------------+ +-------------------------------+
```

### 8.4.1 布局对象调度器（LOD）：逻辑到物理的裂变中枢

在整个元数据栈中，最神奇的模块是 **`lod`（Logical Object Device）**：
- 当用户在客户端创建一个文件时，客户端只关心这个文件的名字；
- 但在服务端，一个大文件不仅包含位于 MDT 上的元数据 Inode，还包含位于数十个 OST 上的物理数据切片（Data Objects）；
- `lod` 在内存中构建了一个虚拟的复合对象：它的上切面面对 `mdd`，表现为一个普通的元数据 Inode；它的下切面面对多个 `osp`（发往 OST 的网络代理驱动）和底层的本地 `osd`；
- 当 `mdd` 调用 `lod_object_create()` 时，`lod` 像一个棱镜一样，将一次创建操作**一分为二**：一方面指示本地 `osd` 记录文件的条带布局扩展属性（`trusted.lov`），另一方面通过 `osp` 异步向远端 OST 发送对象分配指令！

---

## 8.5 实战源码追踪：一个 `mkdir` 如何穿透 `lu_object` 栈？

为了彻底理解这套精密的面向对象体系，我们追踪一个最经典的 POSIX 调用：`mkdir /mnt/lustre/testdir` 在服务端的完整代码穿透路径：

```
+-------------------------------------------------------------------------------+
|                   mkdir 在 lu_object 分层栈中的代码调用全景                   |
+-------------------------------------------------------------------------------+

1. mdt 层 (网络接入与解包):
   mdt_reint_create() [lustre/mdt/mdt_reint.c]
   - 解析客户端发来的带有 IT_CREAT 意向的 RPC 报文
   - 获取目标父目录的 lu_object，调用 mdo_create()
         |
         v
2. mdd 层 (元数据权限与语义决策):
   mdd_create() [lustre/mdd/mdd_dir.c]
   - 检查父目录写权限与配额
   - 启动两阶段事务: dt_trans_create(env, mdd->mdd_child)
   - 声明资源: mdd_declare_create() -> 预留目录项与 inode
         |
         v
3. lod 层 (布局决策):
   lod_declare_dir_create() [lustre/lod/lod_dir.c]
   - 判定目录属于本地还是远端 (DNE 分布式命名空间策略)
   - 若配置了默认条带策略，为该目录绑定条带模板
         |
         v
4. osd 本地文件系统层 (物理落盘):
   osd_declare_create() / osd_create() [lustre/osd-ldiskfs/osd_handler.c]
   - 向 Linux JBD2 申请日志 handles
   - 分配物理 inode 编号，在父目录的 ext4 目录树中插入 htree 索引节点
   - 提交事务: dt_trans_stop(env, dev, th)
```

在这个完整的调用链路上，上层模块只依赖于抽象的 `mdo_*`（Metadata Operations）和 `dto_*`（Data Target Operations）接口指针。
如果某天需要将底层存储阵列从 Ext4 更换为 ZFS，或者接入全闪对象驱动，**只有最底层的 `osd` 模块实现发生替换，上层的 `mdt`、`mdd`、`lod` 逻辑层代码 100% 保持不动**！

---

## 8.6 真实生产事故复盘：两阶段事务声明遗漏导致 MDT 发生 Journal Abort 宕机

### 8.6.1 故障现象与现场特征
某气象超算中心在进行大规模高分辨率气象预报模拟时，MDS 主节点突然触发内核崩溃并触发 Pacemaker 双机切换。
故障前系统监控显示：MDT 盘写入吞吐正常，但系统日志 `dmesg` 连续出现两条致命警告，随后触发内核 BUG：
```text
JBD2: Spotted internal inconsistency: credits 4, blocks 5 (ext4_reserve_inode_write)
EXT4-fs error (device dm-2): ext4_put_super: Journal aborted
Kernel BUG at fs/jbd2/transaction.c:380!
[<0>] jbd2_journal_start_reserved+0x72/0x120
[<0>] osd_trans_exec_op+0x9a/0x140 [osd_ldiskfs]
[<0>] mdd_create_exec+0x128/0x290 [mdd]
```

### 8.6.2 排查过程与排错弯路
1. **最初怀疑**：底层 SAN 存储光纤通道静默翻转，导致 ext4/ldiskfs 元数据物理损坏。
2. **离线文件系统检查**：挂载停止服务后，运行 `e2fsck -f /dev/dm-2`，结果显示元数据树完全干净，无任何不一致坏块。
3. **深入两阶段事务调用链分析**：
   通过反汇编与代码走查内核调用链发现：
   用户在海量创建带扩展属性（Extended Attributes）的复杂目录时，上层 `mdd_create_sanity_check` 在预扣信用时，只调用了 `dt_declare_create()` 声明了目录 Inode 与 Directory Entry 变更所需的日志信用（Credits = 4）。
   但在实际执行（Execute）阶段，由于安全审计增强插件（SELinux/POSIX ACL）向该 Inode 动态注入了额外的安全标签 xattr，导致底层 `osd-ldiskfs` 驱动在同一个事务句柄内需要额外写入一个 xattr block（总块数变成了 5 块）。
   底层的 JBD2（Journal Block Device）发现当前事务实际占用的物理日志块数超出了 `declare` 阶段批准的保留信用，直接判定为日志破坏风险，果断执行了 **Journal Abort 并触发系统内核 Panic**！

### 8.6.3 根因定性与修复方案
- **根本原因**：上层元数据模块在 `declare` 阶段遗漏了动态 Security ACL 的信用预声明，违背了两阶段事务“执行必须严格属于声明的子集”的契约底线。
- **热修复与内核 Patch**：
  在 `mdd_dir_create()` 的声明流程中，强制补齐 ACL 与 xattr 的上限预声明：
  ```c
  /* 补齐扩展属性与安全标签的预声明信用 */
  rc = dt_declare_xattr_set(env, dt, &buf, XATTR_NAME_ACL_ACCESS, 0, th);
  ```
  该案例深刻证明了：在 `lu_object` / `dt_device` 分层架构中，**两阶段事务不仅是一种设计模式，更是保护底层文件系统免受内核崩溃的生死契约**。

---

## 8.7 lu_object 与事务编程 Checklist

在进行 Lustre 存储后端扩展、编写 OSD 驱动或排查复杂事务悬挂时，必须核对以下清单：

- [ ] **事务声明绝对覆盖原则（Declare Before Execute）**：
  任何可能引起持久化状态变更的操作，必须在其对应的 `declare_*()` 阶段计算出最坏情况下的日志信用（Credits）。严禁在 `execute` 阶段发起未声明的块修改。
- [ ] **避免在 lu_env 栈上分配大型局部变量**：
  内核线程上下文空间宝贵，`lu_env` 提供了长达几千字节的线程私有内存池。严禁在函数内定义 `char path[PATH_MAX]`，必须使用 `lu_env_info(env)` 借用预分配的 TLS 内存。
- [ ] **复合切片（lu_object_slice）引用一致性**：
  当调用 `lu_object_find()` 获取对象后，必须在退出前显式配对调用 `lu_object_put()`。若发现对象长期停留在 `lu_site` 中无法淘汰，检查是否有切片遗漏了析构函数。
- [ ] **两阶段事务超时防范**：
  事务从 `dt_trans_start()` 到 `dt_trans_stop()` 的时间必须严格控制在微秒级。严禁在事务持有时执行跨网络的 RPC 阻塞等待或耗时锁申请，防止 JBD2 事务提交被级联挂起。

---

## 8.8 核心源码对照表

| 核心抽象 / 模块 | 源码文件 | 关键结构体 / 虚函数表 | 架构职责与生产定位 |
| :--- | :--- | :--- | :--- |
| **复合对象基石** | [`lu_object.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lu_object.h) | `struct lu_object_header`, `lu_object` | 跨分层复合对象内存拓扑、FID 绑定与 RCU 寻址 |
| **虚拟执行栈** | [`lu_object.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lu_object.h) | `struct lu_env`, `lu_context` | 堆上 TLS 执行上下文，彻底化解 8KB 内核栈溢出 |
| **两阶段事务契约** | [`dt_object.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/dt_object.h) | `struct dt_device_operations`, `thandle` | 强制推行 `declare` 与 `execute` 两阶段事务提交 |
| **元数据分层核心** | [`md_object.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/md_object.h) | `struct md_device`, `md_object_operations` | 元数据分层抽象与 POSIX 语义委托骨架 |
| **布局与调度中枢** | [`lod_object.c`](https://github.com/lustre/lustre-release/blob/master/lustre/lod/lod_object.c) | `struct lod_device`, `lod_object` | 将单个 Inode 裂变为多 OST 数据条带的调度棱镜 |
| **全局对象缓存** | [`lu_object.c`](https://github.com/lustre/lustre-release/blob/master/lustre/obdclass/lu_object.c) | `struct lu_site`, `lu_object_find()` | 基于 Rhashtable 的全局数十亿对象零等待检索池 |

---

## 8.7 本章小结

在本章中，我们见证了 Lustre 面向对象内核重构的巅峰之作：
1. **复合对象（Compound Object）模型**：通过单一 `lu_object_header` 将不同抽象层的切面（Aspect）串接为统一实体，实现了优雅的多态；
2. **`lu_env` 虚拟堆栈机制**：以极具创意的堆上上下文机制，在几千行跨模块调用的深渊上空，为有限的 Linux 内核栈筑起了坚不可摧的安全堤坝；
3. **两阶段事务契约（Declare-Execute）**：将传统“边走边看”的不可靠磁盘操作，重塑为“预先保证、一次提交”的绝对原子过程。

然而，在成千上万个复合对象（`lu_object`）之中，它们是如何被全局唯一标识并准确路由到世界各地的节点的？为什么 Lustre 坚决抛弃了 Linux 传统的 32/64 位 inode 编号？
在下一章 [第九章：FID 体系与分布式命名空间路由](09-fid-concept.md) 中，我们将揭开支撑 Lustre 百亿级文件规模的核心神经 —— **128 位全局文件标识符（FID）** 与 **分布式序列分配器（Seq Allocator）**！
