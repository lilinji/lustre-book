# 第十三章：OST 与 OSD 存储核心 —— OSS 节点架构、OFD 驱动与 ldiskfs/ZFS 双引擎抉择

> “在分布式文件系统的世界里，元数据决定了‘找得到’，而对象存储端（OST/OSD）则决定了‘吃得下’。当成千上万个计算节点同时以每秒数十 GB 的吞吐发起大块数据写入时，数据存储节点必须在裸物理磁盘、硬件总线、内核文件系统与 RDMA 网卡之间，构筑一条零内存反弹、零多余拷贝的钢铁通道。”

在第四部分中，我们完成了元数据子系统（MDT、DNE、Changelogs）的深度拆解。现在，我们将正式跨入 Lustre 承载海量物理数据的核心领域 —— **第五部分：数据存储与分布式 IO 机制（Data Storage & IO Subsystem）**。

本章我们将直面数据节点的物理现实：
- 剖析 OSS（服务器）与 OST（逻辑目标）的拓扑关系；
- 拆解 OST 服务端核心调度驱动 **OFD（OST Filter Device）** 与数据对象预创建（Pre-creation）机制；
- 深度对比两大物理后端驱动：极致裸性能的 **`osd-ldiskfs`** vs 强校验高可靠的 **`osd-zfs`**；
- 解析直接穿透物理块的 **`osd_iobuf` 与 Linux 原生 `bio` 组装流水线**；
- 面对后端坏块只读挂载时的 **生产级抢救军规**。

---

## 13.1 数据存储节点全景：OSS 与 OST

与元数据端 MDS/MDT 类似，数据存储端同样区分物理容器与逻辑目标：

```text
+-------------------------------------------------------------------------------+
|                       OSS (物理硬件) vs OST (逻辑存储目标)                    |
+-------------------------------------------------------------------------------+

[物理硬件: OSS 存储服务器]             [逻辑存储目标: OST]
+-------------------------------+       +---------------------------------------+
|  OSS 01 (Object Storage Svr)  | ====> | OST 0000 (/dev/mapper/mpatha - 100TB) |
|  - 双路 AMD EPYC 64 核 CPU    |       +---------------------------------------+
|  - 256GB ECC 内存             | ====> | OST 0001 (/dev/mapper/mpathb - 100TB) |
|  - 2x 200Gb/s HDR InfiniBand  |       +---------------------------------------+
|  - 挂接高密 JBOD 磁盘柜/NVMe  | ====> | OST 0002 (/dev/mapper/mpathc - 100TB) |
+-------------------------------+       +---------------------------------------+
```

- **OSS（Object Storage Server，对象存储服务器）**：物理硬件节点，通常配备大吞吐 PCIe 总线、双网卡与多路径（Multipath）SAS/NVMe 控制器；
- **OST（Object Storage Target，对象存储目标）**：导出的逻辑块存储单元，对应后端一个独立的物理文件系统（LUN）。一个 OSS 通常挂接 2 到 8 个 OST，从而将单节点的物理聚合带宽打满至数百 Gbps。

---

## 13.2 服务端调度中枢：OFD（OST Filter Device）驱动

在现代 Lustre 架构中，负责在 OST 端口（`OST_IO_PORTAL`）上监听网络请求、协调锁冲突并派发磁盘 IO 的核心模块是 **OFD（[`lustre/ofd/`](https://github.com/lustre/lustre-release/blob/master/lustre/ofd/)）**。

```text
+-------------------------------------------------------------------------------+
|                       OFD 服务端调度流水线架构                                |
+-------------------------------------------------------------------------------+

来自客户端 OSC 的网络 IO 请求 (Portal 10)
                 |
                 v
+-----------------------------------------------+
| ofd_handle() [lustre/ofd/ofd_obd.c]           |  网络报文接入、解包、NRS 调度排队
+-----------------------+-----------------------+
                        |
        +---------------+---------------+
        | (读写 IO 请求)                | (加锁请求 / 对象创建)
        v                               v
+-------------------------------+ +-------------------------------+
| ofd_io.c                      | | ofd_dlm.c / ofd_objects.c     |
| - ofd_preprw_read/write()     | | - ofd_object_create()         |
| - 准备内存页面 & 触发 RDMA    | | - 协同 LDLM EXTENT 范围锁     |
| - ofd_commitrw_write() 刷盘   | | - 管理对象预创建水线          |
+---------------+---------------+ +---------------+---------------+
                |                                 |
                +----------------+----------------+
                                 |
                                 v
+---------------------------------------------------------------+
| 下层 OSD 驱动层 (osd-ldiskfs / osd-zfs)                       |
| 真实调用物理磁盘驱动、提交 JBD2 / ZFS TXG 事务落盘            |
+---------------------------------------------------------------+
```

### 13.2.1 绝妙的设计：数据对象预创建（Pre-creation）机制

如果每次用户在客户端写新文件时，OST 都必须在磁盘上执行一次物理 `create`，磁盘的元数据索引将被写操作频繁打断。

Lustre 设计了 **对象预创建（Pre-creation）机制**（[`lustre/ofd/ofd_objects.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ofd/ofd_objects.c)）：
- 每个 OST 在空闲后台，会自动在后端文件系统预先创建出成千上万个空对象（例如始终维持 20,000 个未使用的预分配 Inode）；
- 当 MDS 上的 `lod` 需要为新文件分配条带切片时，直接向 OST 批量索取已经就绪的 FID 编号；
- **整个写入过程完全省略了在关键 IO 路径上的磁盘对象分配开销！**

---

## 13.3 OSD 双引擎抉择：`osd-ldiskfs` vs `osd-zfs`

在底层存储驱动实现上，Lustre 提供了两大工业级引擎：基于 Ext4 深度魔改的 **`osd-ldiskfs`** 与基于现代高级文件系统的 **`osd-zfs`**。

```text
+-------------------------------------------------------------------------------+
|                       osd-ldiskfs vs osd-zfs 架构全景对比                     |
+-------------------------------------------------------------------------------+
| 特性维度      | osd-ldiskfs (深度优化的 Ext4)  | osd-zfs (企业级 ZFS/OpenZFS) |
+---------------+---------------------------------+-----------------------------+
| 存储模型      | 直接逻辑块映射 (Direct Extents) | 写时复制 (Copy-on-Write)    |
| 数据完整性    | 依赖硬件 RAID 控制器 / Checksum | 原生 256 位端到端校验和     |
| 静默坏块自愈  | 无法感知底层静默扇区翻转        | 具备 Scrub 自动校验与镜像修复|
| 随机小写入    | 极佳 (就地修改 In-Place Update) | 易产生碎片 (COW 写入惩罚)   |
| 极限顺序吞吐  | 极高 (贴近裸盘硬件物理极限)     | 略低 (受校验和与事务组限制) |
| 缓存与分层    | 依赖 Linux 内核标准 PageCache   | 自带多级缓存 ARC + L2ARC SSD|
| 硬件依赖      | 必须配备昂贵的硬件 RAID 卡      | 支持廉价 JBOD 裸盘直接管理  |
+-------------------------------------------------------------------------------+
```

### 13.3.1 `osd-ldiskfs`：为极限 HPC 吞吐而生的性能野兽

在 TOP500 超算中，`osd-ldiskfs` 占据统治地位。
查看源码 [`lustre/osd-ldiskfs/osd_io.c`](https://github.com/lustre/lustre-release/blob/master/lustre/osd-ldiskfs/osd_io.c)：
- **就地修改（In-Place Write）**：当客户端向大文件覆写数据时，`osd-ldiskfs` 直接覆盖现有磁盘扇区，绝不产生多余的块重新分配；
- **零系统 PageCache 干扰**：默认开启直接 IO 模式（`osd_use_page_cache() == false`），数据通过网卡 RDMA 抓取到内存后，直接绕过 Linux 虚拟内存子系统，组装为底层 `struct bio` 砸向 NVMe 控制器，CPU 开销接近于零。

### 13.3.2 `osd-zfs`：为防静默数据损坏构筑的坚固堡垒

在生命科学、天文观测和企业级归档场景中，数据损坏是绝对不可接受的。
`osd-zfs`（[`lustre/osd-zfs/`](https://github.com/lustre/lustre-release/blob/master/lustre/osd-zfs/)）的杀手锏在于 **全链路端到端数据自愈**：
- 每一个数据块在写入磁盘时都会计算 Fletcher4 或 SHA-256 校验和并保存在父节点中；
- 每次读取数据时，ZFS 自动校验。若发现位翻转（Bit Rot），ZFS 立即利用 RAID-Z 奇偶校验块或镜像在毫秒内自动修复损坏数据，整个过程对上层 Lustre 完全透明！

---

## 13.4 物理磁盘布局与 IO 穿透：直接块映射流水线

当一个 4MB 的批量写入到达 OST 时，`osd-ldiskfs` 是如何在几微秒内将其推下磁盘的？

```text
+-------------------------------------------------------------------------------+
|                       osd-ldiskfs 直接块映射与 BIO 组装流水线                |
+-------------------------------------------------------------------------------+

来自 LNet 的 4MB RDMA 内存页面
                 |
                 v
1. 初始化 IOBuf:
   osd_bio_init() [lustre/osd-ldiskfs/osd_io.c]
   - 分配专用的 osd_bio_private 结构
   - 绑定回调 dio_complete_routine
                 |
                 v
2. 连续物理扇区映射 (Map Extents):
   osd_map_extent()
   - 调用 ldiskfs_map_blocks()
   - 如果是追加写入，利用 48 位 Extent 树一次性预留连续物理簇 (Clusters)
                 |
                 v
3. 极限聚合组装 Linux Bio:
   bio_add_page(bio, page, len, offset)
   - 检查相邻页面的物理扇区是否连续
   - 连续则合并为超大 BIO (单 BIO 最大支持 1MB ~ 4MB)
                 |
                 v
4. 下发底层块设备驱动:
   submit_bio(bio)
   - 绕过内核通用 PageCache，直击硬件 NVMe/SAS 控制器队列!
                 |
                 v
5. 硬件完成中断:
   dio_complete_routine() -> 触发 ofd_commitrw_write() 完成回包!
```

通过这一套极度紧凑的直接块映射流水线，Lustre 服务端避免了内核通用文件系统反复进入 `get_user_pages()` 和内存换页的泥潭，真正做到了让物理硬件的速度成为系统的唯一瓶颈。

---

## 13.5 生产实战：后端坏块、只读挂载与紧急抢修

### 13.5.1 生产灾难现场：OST 瞬间只读雪崩

某大型深度学习算力中心正在进行大模型检查点（Checkpoint）保存，某台 OSS 突然在 `dmesg` 中剧烈报警：
```text
[ 5241.114201] EXT4-fs error (device dm-2): ext4_lookup:1584: inode #245102: rec_len is smaller than minimal for - bad entry in directory
[ 5241.114240] Aborting journal on device dm-2.
[ 5241.114300] EXT4-fs (device dm-2): Remounting filesystem read-only
```
随后，全集群数千个正在向 OST0002 写入的计算任务全部卡在 `D` 状态，客户端大量抛出 `-EROFS`（Read-only file system）报错，训练任务中断。

### 13.5.2 根因定位与抢救链路

**事故成因**：
## 13.5 真实生产事故复盘：OST 物理坏道触发 ldiskfs 只读降级与抢修兵法

### 13.5.1 事故现场与现场特征
底层硬件 RAID 卡的某块磁盘发生了坏道，在同步 JBD2 日志时写入失败，触发了 Ext4 内核保护机制：自动将文件系统强行降级为只读（Read-Only）以保护剩余数据不被二次破坏。
业务表现为：部分计算节点在写入对应文件条带时抛出 `-EROFS` 错误，整个训练或仿真作业由于单点 IO 失败而全面中断。

### 13.5.2 外科手术式抢修军规

```bash
# 步骤 1: 立即在客户端或 MGS 上临时禁用故障 OST (避免新文件被分配到该节点)
lctl --device lustre-OST0002-osc-ffff8801 deactivate

# 步骤 2: 在 OSS 节点上停止该 OST 服务并强制卸载
systemctl stop lustre-ost@OST0002
umount -f /mnt/ost0002

# 步骤 3: 运行 Lustre 魔改版 e2fsck 进行强力离线修复
# 注意: 严禁使用系统默认 e2fsck，必须使用 Lustre 专用 e2fsprogs 套件中的工具!
e2fsck -fy -C 0 /dev/mapper/mpathb

# 步骤 4: 挂载并执行 LFSCK 检查 LMA 与 FID 反向一致性
mount -t lustre /dev/mapper/mpathb /mnt/ost0002
lctl lfsck_start -M lustre-OST0002 -t layout

# 步骤 5: 确认无误后，重新激活该 OST 恢复接收生产 IO
lctl --device lustre-OST0002-osc-ffff8801 activate
```

---

## 13.6 OST 与 OSD 存储调优 Checklist

在调优与运维数据存储目标端（OST）与底层持久化引擎时，必须核对以下项目：

- [ ] **预创建对象水位线（Precreation Batch）调优**：
  监控 `/proc/fs/lustre/ofd/OST*/precreate_batch`。在高并发小文件创建场景下，将其从默认 32 扩充至 512 ~ 2048，保证客户端分配对象 ID 时永远命中预分配池，避免阻塞 IO 关键路径。
- [ ] **文件系统选型契约（ldiskfs vs ZFS）**：
  - 极端性能与低延迟场景（NVMe SSD、AI Checkpoint 冲顶）：选择 `ldiskfs`，享有最高 IOPS 与最低 CPU 内存开销；
  - 严苛数据安全与大容量高密 JBOD 存储：选择 `ZFS`，开启 RAIDZ2 与 Fletcher4 256 位强校验，免疫物理静默数据破坏（Silent Data Corruption）。
- [ ] **块设备 I/O 调度器与最大扇区对齐**：
  将底层块设备的调度器设为 `none` 或 `mq-deadline`，将 `/sys/block/sdX/queue/max_sectors_kb` 调整为与 Lustre RPC 大小一致的 4096（4MB），使单次 RPC 在物理层作为单条巨型 BIO 直下 NVMe/SAS 盘。
- [ ] **OST 空间高水位均衡监控**：
  设置自动化巡检脚本，监控所有 OST 的使用率。当最高 OST 与最低 OST 使用率相差超过 20% 时，触发 `lfs_migrate` 进行容量再平衡，防止热点 OST 被写满提前触发写保护。

---

## 13.7 核心源码对照表

| 核心抽象 / 模块 | 源码文件 | 核心函数 / 结构体 | 架构功能与生产定位 |
| :--- | :--- | :--- | :--- |
| **OST 调度中枢** | [`ofd_obd.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ofd/ofd_obd.c) | `ofd_handle()`, `struct ofd_device` | OST 入口请求过滤、NRS 调度与生命周期管线 |
| **数据读写管道** | [`ofd_io.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ofd/ofd_io.c) | `ofd_preprw_read()`, `ofd_commitrw_write()` | 大块 RDMA 内存准备与底层事务持久化提交 |
| **对象预创建** | [`ofd_objects.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ofd/ofd_objects.c) | `ofd_precreate_batch()` | 维持数万空闲 Inode 蓄水池，消除写路径创建延迟 |
| **ldiskfs 存储驱动** | [`osd_io.c`](https://github.com/lustre/lustre-release/blob/master/lustre/osd-ldiskfs/osd_io.c) | `osd_bio_init()`, `submit_bio()` | 直接块映射、BIO 聚合组装与绕过 PageCache 的 DIO |
| **ZFS 存储驱动** | [`osd_io.c`](https://github.com/lustre/lustre-release/blob/master/lustre/osd-zfs/osd_io.c) | `osd_read()`, `osd_write()` | 端到端 256 位校验和、COW 事务与 ARC 智能缓存 |

---

## 13.7 本章小结

在本章中，我们解构了 Lustre 物理数据存储的最底层中枢：
1. **OFD 驱动与预创建机制** 将昂贵的对象分配开销从关键 IO 路径中彻底剥离，为几万并发写入创造了绝对平滑的接入层；
2. **`osd-ldiskfs` 与 `osd-zfs` 双引擎** 分别代表了“极限裸性能”与“企业级自愈强校验”的最高工程典范；
3. **`osd_iobuf` 与原生 BIO 穿透机制** 让存储服务器能够以最低的 CPU 损耗直接压榨物理 NVMe 阵列的吞吐极限。

然而，单个 OST 的容量与带宽始终是有上限的。一个几百 TB 的巨型训练数据集，是如何被精确切割并均匀散落到数十甚至数百个 OST 之上的？
在下一章 [第十四章：文件条带化（Striping）与现代布局演进（PFL / FLR / DoM）](14-striping-pfl-flr.md) 中，我们将探索 Lustre 最具代表性的核心黑科技 —— **文件条带化、渐进式复合布局（PFL）、元数据内联数据（DoM）以及多副本镜像（FLR）**！
