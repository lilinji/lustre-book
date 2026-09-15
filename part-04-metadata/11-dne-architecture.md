# 第十一章：DNE（Distributed Namespace Engine）多元数据水平扩展 —— 远端目录、条带化分片与跨节点分布式事务

> “在分布式存储的演进史中，数据平面的横向扩展（Scale-out）相对简单，增加几十台 OST 服务器即可将存储容量从 PB 扩展到 EB。然而，元数据命名空间是一棵充满因果约束的强一致性树状结构，将其打碎并无缝分散到多个互不相干的独立服务器上，是存储架构界最硬核的挑战。Lustre 的 DNE（Distributed Namespace Engine）架构，彻底粉碎了单元数据服务器的物理天花板。”

在上一章 [MDS 与 MDT 核心架构](10-mdt-internals.md) 中，我们解构了单个 MDT 内部的双轨流水线与意向锁机制。然而，即便是最顶级的双路 128 核高频服务器搭配全闪 NVMe 阵列，单台 MDT 在面对上百亿文件和百万级并发小文件写入时，其内存容量、锁哈希桶以及 Ext4/ZFS 底层索引深度依然会遭遇物理窒息。

本章我们将深入剖析 Lustre 攻克元数据横向扩展的终极武器 —— **DNE（Distributed Namespace Engine）**：
- DNE 演进三部曲：从 **DNE1（远端目录）** 到 **DNE2（条带化目录）**；
- 客户端驱动 [`lmv`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lustre_lmv.h) 如何利用 **FNV-1a / CRUSH2 哈希算法** 实现文件名到 MDT 的微秒级免锁直接寻址；
- 跨 MDT 操作（如跨节点 `rename`）如何通过 **更新日志（Update Log）** 实现分布式两阶段原子提交；
- 巨型目录不停机在线平滑迁移（`lfs migrate`）的 **双布局迁移状态机**。

---

## 11.1 单 MDT 的物理极限与 DNE 演进三部曲

### 11.1.1 为什么单 MDT 必死？

在传统的存储集群中，元数据集中在 MDT0 上：
1. **内存墙（Memory Wall）**：
   每个打开的文件或缓存目录项在内存中至少占用 1KB 结构体。10 亿个文件需要至少 1TB 的物理 RAM 仅用来做元数据缓存；
2. **底层单机文件系统索引极限**：
   ldiskfs（Ext4）的目录基于 Htree 索引，当单个目录文件数突破 1000 万时，树深度达到 4 层以上，每次 `lookup` 或 `create` 引发的磁盘随机读与互斥锁竞争会导致性能断崖式暴跌；
3. **CPU 锁饱和**：
   即使为 MDS 配备 128 个 CPU 核心，所有线程在操作同一个父目录时，都会在 Linux VFS 的 `dentry->d_lock` 和 inode 信号量上打满自旋锁，CPU 90% 的算力被白白浪费在空转等待上。

### 11.1.2 DNE 演进路径

```text
+-------------------------------------------------------------------------------+
|                       DNE 架构演进阶段对比                                    |
+-------------------------------------------------------------------------------+

[DNE 1: 远端子目录 (Remote Directories)]
         MDT 0 (根目录 /)
         |-- /home  (整个子树物理位于 MDT 1)
         |-- /work  (整个子树物理位于 MDT 2)
         \-- /data  (整个子树物理位于 MDT 3)
=> 优点: 实现了大目录间的隔离分流
=> 致命缺点: 如果 /data/images 单个目录下有 1 亿个文件，MDT 3 依然被挤爆!

[DNE 2: 条带化目录 (Striped Directories / Sharded Directory)]
         MDT 0: 逻辑父目录 /data/images (Master Stripe)
         |-- Shard 0 (物理存放在 MDT 0, 承载 hash(name)%4 == 0 的文件)
         |-- Shard 1 (物理存放在 MDT 1, 承载 hash(name)%4 == 1 的文件)
         |-- Shard 2 (物理存放在 MDT 2, 承载 hash(name)%4 == 2 的文件)
         \-- Shard 3 (物理存放在 MDT 3, 承载 hash(name)%4 == 3 的文件)
=> 终极飞跃: 单个超大目录被物理切分为 N 个分片，并发性能随 MDT 数量线性增加!
```

---

## 11.2 目录条带化核心算法与哈希策略

在 DNE2 中，一个被条带化的巨型目录被抽象为一个 **分片对象（Sharded Object）**：
- **Master Stripe（主分片）**：在 MDT 上持有真实的目录 Inode，记录目录的默认权限、属主以及目录条带布局（LMV EA）；
- **Slave Stripes（从分片）**：分布在各个指定的 MDT 上，每个分片在底层磁盘上就是一个普通的 Ext4/ZFS 子目录，用于分散存储真实的文件目录项（dentry）。

### 11.2.1 哈希算法：客户端 LMV 零开销寻址

当客户端调用 `open("/mnt/lustre/images/car_001.jpg")` 时，客户端如何知道 `car_001.jpg` 应该去哪台 MDT 创建或查找？
如果在客户端去轮询所有的 MDT，网络开销将是灾难性的。

Lustre 客户端的 **LMV（Logical Metadata Volume）驱动** 在本地运行确定性的哈希函数，查看源码 [`lustre/include/lustre_lmv.h:350`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lustre_lmv.h#L350)：

```c
/* lustre/include/lustre_lmv.h */
switch (hash_type & LMV_HASH_TYPE_MASK) {
case LMV_HASH_TYPE_FNV_1A_64:
	stripe_index = lmv_hash_fnv1a(stripe_count, name, namelen);
	break;
case LMV_HASH_TYPE_CRUSH:
	stripe_index = lmv_hash_crush(stripe_count, name, namelen, false);
	break;
case LMV_HASH_TYPE_CRUSH2:
	stripe_index = lmv_hash_crush(stripe_count, name, namelen, true);
	break;
...
}
```

```text
+-------------------------------------------------------------------------------+
|                       LMV 客户端本地哈希直接路由机制                          |
+-------------------------------------------------------------------------------+

文件名: "car_001.jpg"
           |
           v
[客户端本地执行 FNV-1a 或 CRUSH2 哈希算法]
hash = lustre_hash_fnv_1a_64("car_001.jpg", 11);
stripe_index = hash % stripe_count; // 假设 stripe_count = 4, 结果 = 2
           |
           v
[查询 LMV 布局表: stripe_index 2 对应 MDT 2]
           |
           v
[客户端直接跳过 MDT0/1/3，通过 Portal 12 向 MDT 2 发起 IT_OPEN RPC!]
耗时: 本地 CPU 计算仅 20 纳秒，网络往返精准直达，无任何额外转发开销!
```

### 11.2.2 惊艳的 CRUSH2 算法：临时文件后缀免疫

在真实业务中，海量工具（如 `vim`、`rsync`、`dcp`）在写入文件时，往往会先创建一个临时文件，写完后再执行原子重命名：
`test.dat.tmp.1234` $\to$ `rename` $\to$ `test.dat`。

如果使用常规的 FNV-1a 哈希，`test.dat.tmp.1234` 和 `test.dat` 的哈希值截然不同，极大概率会被散列到两台不同的 MDT 上！这意味着一个普通的写入保存动作，在底层被强行升级为极其昂贵、脆弱的 **跨 MDT 跨节点原子重命名事务**！

Lustre 创造了 **`LMV_HASH_TYPE_CRUSH2` 算法**（[`lustre/include/lu_object.h:1289`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lu_object.h#L1289)）：
```c
/**
 * lu_name_is_temp_file() - 智能剥离临时后缀算法
 * 针对以点开头或特定结尾的临时文件名，CRUSH2 会自动剥离其动态后缀，
 * 仅对文件的核心主干名称计算哈希值！
 */
```
无论编辑器生成了怎样的临时后缀，临时文件与最终文件在第一天就**保证散列到同一台物理 MDT 的同一个分片上**，将潜在的跨节点重命名降维为纯粹的单机局部事务！

---

## 11.3 跨 MDT 强一致性与分布式事务机制

当用户执行跨目录的 `rename("/mdt1_dir/fileA", "/mdt2_dir/fileB")` 时，涉及两个完全独立节点上的物理文件系统修改。
在分布式系统中，经典方案是两阶段提交（2PC），但 2PC 在高并发下的阻塞锁会导致严重的吞吐衰竭。

Lustre 采用了一套基于 **分布式更新日志（Update Log）** 与 **失步自愈恢复（Out-of-Sync Recovery）** 的工程架构：

```text
+-------------------------------------------------------------------------------+
|                       跨 MDT 事务与更新日志协同机制                          |
+-------------------------------------------------------------------------------+

Client                                  MDT 1 (源节点)                  MDT 2 (目标节点)
  |                                           |                               |
  |--- (1) 发送跨节点重命名 RPC -------------->|                               |
  |                                   [开启本地事务 th]                       |
  |                                   [在父目录解绑 fileA]                     |
  |                                   [向 Update Log 写入跨节点待办记录]       |
  |                                           |                               |
  |                                           |--- (2) 通过 OSP 下发更新指令 ->|
  |                                           |        (包含原事务 transno)   | [开启本地事务]
  |                                           |                               | [在目标目录插入 fileB]
  |                                           |                               | [更新 LMA 反向指针]
  |                                           |<-- (3) 确认完成 (Ack) --------|
  |                                   [在本地提交事务]                         |
  |<-- (4) 重命名成功应答 --------------------|                               |
```

### 11.3.1 崩溃自愈：失步恢复（Out-of-Sync Recovery）

如果 MDT 1 刚向 MDT 2 发出了指令，MDT 1 物理断电或者网络中断，系统会不会出现“源文件已删，目标文件未建”的丢数据惨剧？

1. **分布式更新日志持久化**：
   MDT 1 在执行操作前，必须将该跨节点更新操作先写入本地磁盘特殊的 LLOG 容器（`FID_SEQ_UPDATE_LOG`）中；
2. **OSP 自动追平机制**：
   MDT 1 重启后，其内部针对 MDT 2 的代理驱动（`osp_device`）会扫描未完成的 Update Log 队列，自动向 MDT 2 重新同步未确认的操作；
3. **版本屏障（VBR 验证）**：
   MDT 2 在执行补偿重放时校验对象的版本指纹。如果网络瞬断导致操作重复到达，MDT 2 依靠幂等性直接确认，彻底规避了分布式脑裂与孤儿对象产生。

---

## 11.4 目录在线平滑扩容与热迁移（Dir Migration）

### 11.4.1 生产痛点：目录建小了怎么办？

在实际生产中，用户最初可能觉得某个目录只会存 10 万个文件，于是创建了一个单分片目录（仅在 MDT0 上）。
半年后，该目录文件暴增到 3000 万，MDT0 发生严重读写倾斜告警。
如果必须停止所有上层业务、复制文件、重建目录，在 7x24 小时运行的 AI 训练和气象超算中是不可接受的。

Lustre 提供了革命性的 **在线热迁移机制（Online Directory Migration）**。

### 11.4.2 双布局迁移状态机（Migrating Layout）

查看 [`lustre/include/lustre_lmv.h:340`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lustre_lmv.h#L340)，LMV 支持在目录迁移期间维持一个特殊的中间状态：

```c
/* lustre/include/lustre_lmv.h */
} else if (lmv_hash_is_migrating(hash_type)) {
	/* 目录正处于在线热迁移状态! */
	if (new_layout) {
		stripe_count = migrate_offset; // 新增写入流使用新布局分片
	} else {
		hash_type = migrate_hash;      // 存量读取流使用旧布局分片
	}
}
```

```text
+-------------------------------------------------------------------------------+
|                       DNE 目录在线热迁移 (Migration) 状态机                   |
+-------------------------------------------------------------------------------+

[初始状态: 单分片目录 (仅在 MDT 0 上)]
=================================================================================
管理员发起在线扩容: lfs migrate -m 0,1,2,3 /mnt/lustre/bigdir
=================================================================================
  |
  +-> 1. 目录被原子打上 LMV_HASH_FLAG_MIGRATION 标记 (进入双布局状态!)
  |
  +-> 2. 读写分流:
  |      - 新创建的文件: 强制按 4 个 MDT 的新布局进行 FNV-1a 散列!
  |      - 存量老文件: 依然能从旧分片正常读取并更新!
  |
  +-> 3. 后台迁移守护进程:
  |      逐一遍历老分片中的文件，透明迁移到新分片对应的 MDT 上。
  |
  +-> 4. 存量全部迁移完毕:
         原子清除 MIGRATION 标记，目录正式转为全新 4 分片架构!
=================================================================================
全过程无需卸载文件系统、上层正在跑的 Python/C++ 读写程序零报错、零中断!
```

---

## 11.5 生产实战：巨型目录倾斜排查与 DNE 最佳实践

### 11.5.1 现场故障复盘：元数据“一核有难，众核围观”

某自动驾驶科技公司，部署了 4 台 MDT（MDT0000 ~ MDT0003）。
但在生产运行中，监控发现 MDT0000 的 NVMe 磁盘已使用 97% 并频发报警，而 MDT0001 ~ MDT0003 的磁盘使用率只有不到 5%！
整个集群的吞吐被活生生卡死在 MDT0000 上。

### 11.5.2 诊断排查命令链

运维团队利用 Lustre 强大的诊断命令迅速摸清了真相：

```bash
# 1. 检查根目录及核心业务目录的条带化配置
lfs getdirstripe -v /mnt/lustre/dataset
## 11.5 真实生产事故复盘：跨 MDT 目录条带热点倾斜与跨节点分布式事务挂死

### 11.5.1 事故现场：MDT0 撑死与 MDT1~7 闲置

某智算中心部署了 8 台 MDS 节点（DNE 架构），计划承载 5,000 万规模的计算机视觉图片数据集。
然而，在数据灌入仅 3 天后，管理员收到紧急告警：`MDT0000 Inode 使用率达 99.8%`，而其余 `MDT0001 ~ MDT0007` 的 Inode 使用率不足 2%！
与此同时，部分用户在执行跨目录批量文件 `mv` 重命名操作时，客户端进程长时间陷入 D 状态无法返回。

### 11.5.2 排查过程与根因定位
1. **目录条带配置排查**：
   运行 `lfs getdirstripe` 查看业务根目录：
   ```bash
   lfs getdirstripe -v /mnt/lustre/dataset
   # lmv_stripe_count: 1 lmv_stripe_offset: 0 lmv_hash_type: none
   ```text
   **破案一**：用户直接在根目录下创建了普通目录，默认单分片，所有元数据全部分配在主 MDT 0 上，DNE 多元数据集群退化为单机系统。
2. **跨节点事务死锁排查**：
   通过 `lctl get_param mdt.MDT*.update_log` 查看更新日志，发现多台客户端在并发执行从 `/mnt/lustre/dir_a`（位于 MDT 1）移动文件到 `/mnt/lustre/dir_b`（位于 MDT 2）的操作。
   由于源文件与目标目录位于不同的物理 MDT 上，`rename` 触发了跨节点分布式两阶段事务。此时客户端持有了 MDT 1 上的原目录 IBITS 锁，在向 MDT 2 申请新目录 IBITS 锁时发生了逆序死锁竞争，导致 `mdt_dist_txn` 事务队列挂死。

### 11.5.3 生产热修复与 DNE 架构黄金法则
针对该事故，团队执行了在线热迁移平摊并制定了严密架构准则：

```bash
# 1. 紧急对倾斜的目录执行全量在线热迁移，自动打散到 8 台 MDT 上
lfs migrate -m 0,1,2,3,4,5,6,7 /mnt/lustre/dataset

# 2. 为未来新建目录设置默认分片继承规则
lfs setdirstripe -D -c 8 /mnt/lustre/dataset
```text

---

## 11.6 DNE 架构配置与水平扩展 Checklist

在部署和维护 DNE 多元数据服务器集群时，必须逐一核对以下配置：

- [ ] **默认目录条带化策略合理性（Striping Balance）**：
  严禁将所有目录盲目设为全分片（如 `c=16`）。小目录（文件数 < 1,000）保持 `c=1` 避免多次网络 RPC；百万级以上的大型数据集根目录，显式设置分片数等于 MDT 物理数量（如 `c=4` 或 `c=8`）。
- [ ] **哈希散列算法选择（FNV-1a vs CRUSH2）**：
  纯高频创建与查找的大目录优先选择 `fnv_1a_64`；若目录中充斥大量训练过程中的临时文件（以 `.tmp`、`.crdownload` 结尾后改名），必须选择 `crush2` 散列，免疫临时文件 rename 导致的跨分片物理搬迁。
- [ ] **跨 MDT 事务超时时间（dist_txn_timeout）调优**：
  核查 `/proc/fs/lustre/mdt/MDT*/dist_txn_timeout`。在大规模跨节点重命名和链接场景下，将其从默认值微调至 30~60 秒，为网络瞬态延迟与锁协调留出充足安全裕量。
- [ ] **在线热迁移并发流控（lfs migrate）**：
  在生产活跃期执行 `lfs migrate` 时，切忌无限制并发，建议通过脚本按批次、低线程限速迁移，防止占用过多 MDT 日志锁引起正常业务延迟抖动。
- [ ] **MDT 间网络全互联健康度核查**：
  DNE 强依赖所有 MDT 之间的高速 LNet 直连。确认所有 MDT 的 NID 均已加入对端 Peer 白名单，并且 MTU 保持一致。

---

## 11.7 核心源码对照表

| 核心抽象 / 模块 | 源码文件 | 关键函数 / 数据结构 | 架构功能与生产定位 |
| :--- | :--- | :--- | :--- |
| **客户端条带调度** | [`lmv_obd.c`](https://github.com/lustre/lustre-release/blob/master/lustre/lmv/lmv_obd.c) | `lmv_locate_mds()`, `lmv_name_to_stripe_index()` | 客户端根据文件名哈希免锁定位目标 MDT |
| **哈希算法集合** | [`lustre_lmv.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lustre_lmv.h) | `lmv_hash_fnv1a()`, `lmv_hash_crush()` | FNV-1a、CRUSH 与临时文件免疫的 CRUSH2 散列 |
| **服务端条带分配** | [`lod_dir.c`](https://github.com/lustre/lustre-release/blob/master/lustre/lod/lod_dir.c) | `lod_dir_striping_create()` | 在 MDT 本地创建 Master 目录并协同创建 Slave 分片 |
| **跨节点更新日志** | [`mdt_updates.c`](https://github.com/lustre/lustre-release/blob/master/lustre/mdt/mdt_updates.c) | `mdt_dist_txn_start()`, `mdt_update_log_add()` | 跨 MDT 事务与分布式 Update Log 原子提交中枢 |
| **在线热迁移** | [`mdt_reint.c`](https://github.com/lustre/lustre-release/blob/master/lustre/mdt/mdt_reint.c) | `mdt_reint_migrate()` | 处理 `lfs migrate` 请求与双布局状态机切换 |

---

## 11.7 本章小结

在本章中，我们见证了 Lustre 元数据横向扩展架构的宏伟设计：
1. **DNE2 条带化目录** 将单个不可分割的巨型目录，化整为零打碎在多个物理 MDT 之上，彻底粉碎了单机性能墙；
2. **客户端 LMV 免锁直接路由** 借助 FNV-1a 和专为工程优化的 CRUSH2 算法，在数十纳秒内直接命中物理目标，消除了任何集中路由代理的开销；
3. **分布式更新日志与失步自愈恢复** 解决了跨节点事务的原子性与高可用；
4. **双布局热迁移机制** 让数十亿文件的物理拓扑重塑可以在生产业务零停顿的状态下无感完成！

但是，在如此庞大、并发激烈的元数据洪流中，外部系统（如数据备份工具、归档分层 HSM 系统、安全合规审计引擎）如何才能精确感知文件系统里每时每刻发生的变化？
在下一章 [第十二章：元数据变更日志（Changelogs）与数据保护](12-changelogs.md) 中，我们将深入剖析 Lustre 赖以支撑企业级安全合规与异构数据分层的核心基石 —— **Changelogs 引擎与 LLOG 环形日志机制**！
