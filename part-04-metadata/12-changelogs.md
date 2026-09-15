# 第十二章：元数据变更日志（Changelogs）与数据保护 —— LLOG 环形存储、实时事件订阅与 HSM 协同

> “当一个分布式文件系统容纳了 50 亿个文件时，最简单的 `find /mnt/lustre -mtime -1` 遍历脚本都将变成一场持续数天、引发数千万次磁盘随机 IO 的灾难性风暴。面对海量数据的备份、冷热分层归档（HSM）与合规安全审计，盲目全量扫描的时代早已终结。Lustre 的 Changelogs（元数据变更日志）引擎，将文件系统变成了一个高吞吐、低延迟的分布式变更数据捕获（CDC）事件流。”

在前面的章节中，我们深入剖析了 [MDS/MDT 核心架构](10-mdt-internals.md) 与 [DNE 多元数据水平扩展](11-dne-architecture.md)。现在我们将镜头对准元数据子系统的收官之作 —— **Changelogs 变更日志与数据保护**。

本章我们将系统剖析：
- 为什么现代超大规模存储必须使用 Change Data Capture（CDC）取代传统全量扫描？
- 包含超算 JobID 审计与文件因果链的二进制记录 [`struct changelog_rec`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_user.h#L2100)；
- 底层可靠追加的内核日志引擎 **LLOG（Lustre Log）**；
- 多消费者（Consumers）注册、流式监听（`--follow`）与游标推进机制；
- 生产环境中由于“僵尸消费者”引发 MDT 物理磁盘被 LLOG 撑爆的 **紧急抢救军规**。

---

## 12.1 为什么需要 Changelog？传统扫描的“百亿文件灾难”

在传统小型文件系统中，数据备份软件（如 Tar、Bacula）或分层迁移脚本通常依赖文件系统遍历（Namespace Crawling）：
通过 `readdir()` 递归扫描全盘每一个目录，对每一个文件调用 `stat()` 检查修改时间（`mtime`）。

在 Lustre 百亿级文件的超算集群中，这一做法直接宣判系统死刑：

```text
+-------------------------------------------------------------------------------+
|                       传统扫描 vs Changelogs 事件捕获对比                     |
+-------------------------------------------------------------------------------+
| 维度          | 传统全盘扫描 (find / crawl)     | Lustre Changelogs (CDC 机制) |
+---------------+---------------------------------+-----------------------------+
| 元数据 IO 影响| 产生数十亿次磁盘读取，MDT 彻底卡死| 零额外扫描 IO：修改时顺手追加落盘|
| 变更感知延迟  | 小时级甚至天级 (取决于扫描周期) | 毫秒级：事件产生瞬间立即可读|
| 准确性        | 易漏掉“短命”临时文件或多次覆盖  | 绝对精准：忠实记录每一次历史变更|
| 业务感知度    | 仅能获知当前静态结果            | 捕获上下文：包含进程 UID、JobID |
+-------------------------------------------------------------------------------+
```

### 12.1.1 核心驱动场景

1. **分层存储与 HSM（Hierarchical Storage Management）**：
   热数据在 Lustre 全闪/高并发 NVMe 阵列上，冷数据需要自动归档到 S3 对象存储或磁带库（如 HPSS）。HSM 守护进程（Copytool）监听 Changelog 中的 `CL_CLOSE` 事件，自动将修改完成的文件转储到冷存储；
2. **跨数据中心实时异步镜像（Disaster Recovery, DR）**：
   远端容灾节点实时订阅本地 MDT 的 Changelog 流，依据变更序列毫秒级重放目录树变更，构建异地元数据热备；
3. **安全合规与操作审计**：
   精准记录哪个用户、在哪个计算节点、运行哪个 SLURM 作业（JobID）、在何年何月何秒删除了哪个关键模型文件。

---

## 12.2 二进制结构全解：`struct changelog_rec`

所有产生于 MDT 内部的元数据变更，最终都被压缩为一个紧凑的二进制结构体：[`struct changelog_rec`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_user.h#L2100)。

```text
+-------------------------------------------------------------------------------+
|                       struct changelog_rec 物理排布与扩展链                    |
+-------------------------------------------------------------------------------+
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|       cr_namelen (2B)         |       cr_flags (2B)           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       cr_type (4B: CL_CREATE, CL_UNLINK...)   |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
+                       cr_index (8B: 全局自增序列号)            +
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
+                       cr_prev (8B: 该对象的前序变更号)        +
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
+                       cr_time (8B: 64 位纳秒时间戳)           +
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       cr_tfid (16B: 目标对象 FID)             |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       cr_pfid (16B: 父目录 FID)               |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  [可选项] struct changelog_ext_rename (原父目录与原 FID)      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  [可选项] struct changelog_ext_jobid (SLURM / PBS 作业 JobID) |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  [可选项] 变长文件名 (NUL 结尾字符数组)                       |
+---------------------------------------------------------------+
```

### 12.2.1 关键字段深度剖析

查看源码 [`include/uapi/linux/lustre/lustre_user.h`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_user.h#L1901-L2125)：

1. **`cr_type`（事件类型）**：
   涵盖文件生命周期的所有关键跃迁：
   - `CL_CREATE` / `CL_MKDIR`：文件/目录创建；
   - `CL_UNLINK` / `CL_RMDIR`：文件/目录删除；
   - `CL_RENAME`：重命名（若携带 `CLF_RENAME` 标记，后接 `changelog_ext_rename` 扩展块，完整记录源和目标）；
   - `CL_CLOSE`：文件被关闭且数据发生变动（通知 HSM 归档的核心触发点）；
   - `CL_FLRW` / `CL_RESYNC`：FLR 条带镜像首次写入与同步事件；
   - `CL_LAYOUT`：条带化配置或 PFL 复合布局变更。
2. **`cr_index` 与 `cr_prev`：单文件因果时钟链**：
   - `cr_index` 是 MDT 上全局单调递增的 64 位日志序列号；
   - **`cr_prev` 是极其震撼的工程设计**：它记录了**该特定文件（`cr_tfid`）上一次发生变更时的 `cr_index` 编号**！外部增量同步程序无需扫描全局日志，只需沿着 `cr_prev` 指针像链表一样反向溯源，就能瞬间重构该文件在整个生命周期内的全部修改轨迹！
3. **`cr_jobid`（超算作业追踪）**：
   如果启用了作业追踪（`CHANGELOG_FLAG_JOBID`），记录尾部直接内嵌触发该修改的作业标识字符串（例如 `slurm.102488`）。

---

## 12.3 底层持久化中枢：LLOG（Lustre Log）机制

Changelog 产生极其频繁，如果为每条变更在磁盘上创建一个小文件，文件系统会迅速崩溃。
Lustre 自研了底层的专属内核日志系统 —— **LLOG（Lustre Log）**。

```text
+-------------------------------------------------------------------------------+
|                       LLOG 目录目录树与分块轮转机制                           |
+-------------------------------------------------------------------------------+

MDT 本地文件系统隐藏命名空间:
/CATALOGS (日志目录索引，记录当前有哪些活跃的 LLOG 块)
   |
   +-- changelog_catalog (Changelog 专属总目录)
          |
          |-- llog_file_001 (预分配固定大小的物理日志大文件，如 10MB)
          |   [Header 位图: 11111111111111111111111111111111] (已满)
          |   [Record 1][Record 2][Record 3] ... [Record N]
          |
          |-- llog_file_002 (当前正在追加写入的物理日志块)
          |   [Header 位图: 11111111110000000000000000000000] (使用中)
          |   [Record N+1][Record N+2] ...
```

- **追加写入与零碎片**：LLOG 在底层表现为几个预先分配的大块连续对象。每次变更发生时，MDT 在两阶段事务（DT）中直接以零内存拷贝的方式追加到当前的 LLOG 块末尾；
- **位图记录管理**：每个 LLOG 头部维护一张严格的位图（Bitmap）。每个 bit 代表该槽位记录是否存在；
- **物理块自愈轮转**：当一个 LLOG 文件写满，系统自动启动新文件，并更新目录日志 `changelog_catalog`。

---

## 12.4 生产者与消费者模型：注册、订阅与确认

Changelog 采用严格的 **多租户发布-订阅（Pub-Sub）** 拓扑模型：

```text
+-------------------------------------------------------------------------------+
|                       Changelog 消费者订阅与游标推进全景                      |
+-------------------------------------------------------------------------------+

                               MDT Changelog 管道
 [Record 1001] -> [Record 1002] -> [Record 1003] -> [Record 1004] -> [Record 1005]
        ^                                 ^                                 ^
        |                                 |                                 |
+-------+-------+                 +-------+-------+                         |
| Consumer cl1  |                 | Consumer cl2  |                         |
| (HSM 归档引擎)|                 | (异地容灾备份)|                         |
| 游标: 1001    |                 | 游标: 1003    |                         |
+---------------+                 +---------------+                         |
                                                                    (最新写入位置)
```

### 12.4.1 核心运维命令流

#### 1. 注册新的消费者（Consumer Registration）
任何外部应用想要消费变更，**必须预先在 MDT 上注册并取得唯一代号**（如 `cl1`, `cl2`）：
```bash
# 在 MDT0 上注册一个消费者
lctl --device lustre-MDT0000 changelog_register
# 系统输出返回分配的 ID:
# lustre-MDT0000: Registered changelog user: cl1
```

#### 2. 读取与实时流式监听（Streaming Read）
```bash
# 1. 批量读取当前积压的所有记录
lfs changelog lustre-MDT0000

# 2. 以类似 tail -f 的流式长连接方式实时监听新事件 (适合守护进程)
lfs changelog lustre-MDT0000 --follow
```
典型的一条 Changelog 输出示例：
```text
1024 01CREAT 2026-09-15T10:00:01.1245 0x0 t=[0x200000401:0x12:0x0] p=[0x200000007:0x1:0x0] model.pt job=slurm.88123
```

#### 3. 确认消费与物理销毁（Purging）
这是保证 MDT 磁盘不被撑爆的核心动作！
当消费者确认已经处理完某批事件后，必须主动向 MDT 提交清理确认：
```bash
# 通知 MDT: 消费者 cl1 已经成功处理完毕第 1024 号记录之前的全部事件
lfs changelog_clear lustre-MDT0000 cl1 1024
```
**MDT 的垃圾回收铁律**：
MDT 检查全系统所有已注册的 Consumer，计算出：
$$\text{MinPurgeIndex} = \min(\text{cl1}_\text{idx}, \text{cl2}_\text{idx}, \dots, \text{clN}_\text{idx})$$
**只有当所有消费者都已经越过某个 LLOG 块时，MDT 才会真正在物理磁盘上释放该数据块！**

---

## 12.5 生产实战：僵尸消费者引发 MDT 磁盘爆满事故处理

### 12.5.1 生产灾难复盘：100% 磁盘写死的午夜惊魂

某超算中心夜间突然收到全集群紧急告警：所有节点对 Lustre 的任何写入均报错 `No space left on device (-ENOSPC)`。
但管理员执行 `lfs df -h` 发现，所有 OST 数据盘的剩余空间高达 60%（尚有数 PB 空闲），而 **MDT0000 的元数据盘使用率赫然显示 100%！**

### 12.5.2 根因追踪链条

工程师登录 MDS 节点，深入分析 MDT 本地存储空间占用：
```bash
# 1. 检查当前 MDT 上注册的 Changelog 消费者及其水位游标
lctl get_param mdd.lustre-MDT0000.changelog_users

# 控制台输出了触目惊心的一幕:
# current index: 854129984
# ID    rec   status
# cl1   854120000 (active)
# cl2   1240102   (idle / offline!)
```

**病灶昭然若揭**：
- 半年前某位离职工程师曾经搭建过一个测试版备份工具，并在 MDT0 上注册了消费者 **`cl2`**；
- 后来该测试工具被直接 `kill -9` 废弃，但**从未在 MDT 上注销该 ID**！
- MDT 兢兢业业地遵守着安全原则：因为 `cl2` 停留在半年前的 `1240102` 记录点，**MDT 在这半年内不敢删除任何一个 LLOG 日志块**；
- 数以亿计的变更记录将 MDT 的物理 NVMe 磁盘彻底挤爆！

### 12.5.3 紧急抢救军规处方

遇到此类险情，必须执行外科手术式的注销与清理：

```bash
# 步骤 1: 立即注销僵尸消费者 cl2
## 12.5 真实生产事故复盘：僵尸消费者（Zombie Consumer）撑爆 MDT 磁盘引发全集群宕机

### 12.5.1 事故现场：无声无息耗尽的元数据盘

某大型油气勘探机构，MDT 本地配备了 2TB 的高性能 NVMe 镜像卷，Inode 使用率仅为 15%。
但在一个周一清晨，集群突然全线报错：`MDT0000: No space left on device (-ENOSPC)`，所有用户连创建一个 0 字节空文件都被拒绝！
管理员非常诧异：`lfs df -i` 显示 Inode 还剩 85%，为什么会报空间不足？

### 12.5.2 根因定位与排查链路
1. **排查 MDT 物理块使用率**：
   在 MDS 宿主机运行原生命令：
   ```bash
   df -h /mnt/mdt0
   # /dev/nvme0n1  1.9T  1.9T  20M  100% /mnt/mdt0
   ```text
   物理块居然完全耗尽！
2. **定位空间占用元凶**：
   使用 `debugfs` 检查内部隐式文件，发现 `CATALOGS` 和 `changelog_catalog` 关联的底包 LLOG 文件累计膨胀至 1.6TB，包含了超过 4 亿条历史变更记录！
3. **深入消费者游标分析**：
   运行命令查看当前已注册的消费者状态：
   ```bash
   lctl get_param mdd.lustre-MDT0000.changelog_users
   # current index: 482910412
   # ID    rec
   # cl1   482909800
   # cl2   1240105
   ```text
   **惊人真相**：
   两个月前，一位离职实习生测试数据备份工具时，运行了 `lctl --device lustre-MDT0000 changelog_register` 注册了一个消费者 `cl2`。测试完后，该脚本被 `Ctrl+C` 强杀，但**未调用 deregister 注销**！
   `cl1`（Robinhood 归档引擎）游标紧跟最新进度，但由于 `cl2` 的消费游标永久定格在 1,240,105，Lustre 的 LLOG 垃圾回收器为了向后兼容该僵尸用户，**绝对不敢释放这 4 亿条日志对应的任何一个物理块**！两个月里每秒几百条变更日志不断追加，最终活活将 2TB MDT 物理盘撑爆！

### 12.5.3 紧急处置与避坑脚本

```bash
# 步骤 1: 紧急注销僵尸消费者 cl2
lctl --device lustre-MDT0000 changelog_deregister cl2

# 步骤 2: 强制将活跃消费者 cl1 追平到当前最新水位 (或安全清除积压)
CURRENT_IDX=$(lctl get_param -n mdd.lustre-MDT0000.changelog_users | grep "current index" | awk '{print $3}')
lfs changelog_clear lustre-MDT0000 cl1 $CURRENT_IDX

# 步骤 3: 观察 MDT 本地磁盘空间释放 (LLOG 异步回收通常在几秒内释放数十GB空间)
df -h /mnt/mdt0
```text

---

## 12.6 Changelogs 运维与事件消费 Checklist

在生产环境中启用 Changelogs 进行备份、同步或 HSM 数据生命周期管理时，必须设置以下防线：

- [ ] **僵尸消费者（Zombie Consumer）全天候巡检**：
  配置 Crontab 或 Prometheus 告警，监控 `mdd.*.changelog_users` 中最小的 `rec` 与 `current index` 的差值（Lag）。若积压超过 1,000 万条，立即触发告警。
- [ ] **消费端游标清退（changelog_clear）批处理**：
  消费者每处理完一批事件（如 50,000 条），必须主动调用 `lfs changelog_clear` 释放日志块，严禁只读不清退。
- [ ] **变更日志事件掩码（Mask）最小化过滤**：
  若仅需要监听文件创建与删除（如归档同步），切勿开启全部掩码。使用 `lctl changelog_mask` 显式屏蔽 `ATIME`、`SATTR` 等高频但无意义的事件，减少日志体积 70% 以上。
- [ ] **MDT 预留空间安全水位（Reserved Space）**：
  在格式化 MDT 时，为根目录保留 5% 的保留块（Reserved Blocks），防止 Changelogs 撑满磁盘导致 root 用户也无法登录执行注销清理。

---

## 12.7 核心源码对照表

| 核心抽象 / 模块 | 源码位置 | 关键结构体 / 函数 | 架构功能与生产定位 |
| :--- | :--- | :--- | :--- |
| **变更记录定义** | [`lustre_user.h`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_user.h) | `struct changelog_rec`, `changelog_ext_rename` | 变更日志二进制排布、扩展块与单文件 `cr_prev` 链 |
| **事件枚举规范** | [`lustre_user.h`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_user.h) | `enum changelog_rec_type` | 涵盖 CREATE、UNLINK、RENAME、CLOSE 等变更类型 |
| **日志生成中枢** | [`mdd_changelog.c`](https://github.com/lustre/lustre-release/blob/master/lustre/mdd/mdd_changelog.c) | `mdd_changelog_write()`, `mdd_changelog_ns()` | 在元数据修改事务中同步封装并追加日志 |
| **底层 LLOG 引擎** | [`llog.c`](https://github.com/lustre/lustre-release/blob/master/lustre/obdclass/llog.c) | `llog_write()`, `llog_destroy()` | 内核无锁追加日志大文件与位图垃圾回收 |
| **消费者状态管理** | [`mdd_log.c`](https://github.com/lustre/lustre-release/blob/master/lustre/mdd/mdd_log.c) | `mdd_changelog_user_register()`, `mdd_changelog_clear()` | 管理 `changelog_users` 游标推进与废弃块物理删除 |

---

## 12.7 本章小结与第四部分全面回顾

在本章中，我们解密了 Lustre 在大规模数据管理与审计领域的利器 —— Changelogs：
1. **CDC 变更数据捕获模型** 彻底取代了灾难性的全盘扫描，实现了毫秒级事件流感知；
2. **`struct changelog_rec` 的单文件因果链（`cr_prev`）与 JobID 审计**，为分布式历史溯源提供了精准的因果信物；
3. **LLOG 物理存储与发布-订阅模型** 在保证高吞吐追加的同时，提供了严密的多租户消费游标控制机制。

---

### 第四部分（Metadata Subsystem）里程碑回顾

至此，**第四部分：元数据子系统深入剖析（Metadata Subsystem）** 已经圆满落成：
- **第十章（MDT 核心架构）**：剖析了双轨流水线、1-RTT 意向锁调度与 Nodemap 安全隔离防线；
- **第十一章（DNE 架构）**：揭示了突破单机物理瓶颈的条带化目录、客户端免锁 FNV-1a/CRUSH2 路由与跨节点更新日志；
- **第十二章（Changelogs 机制）**：展示了支撑 HSM 分层存储与超算事件审计的 LLOG 流式消费体系。

元数据是存储的“灵魂”，而物理存储数据的承载者则是浩瀚的“肉身” —— **数据存储与分布式 IO 子系统（Data Storage & IO Subsystem）**。
在接下来的 **第五部分：数据存储与分布式 IO 机制** 中，我们将深入剖析 **OST/OSD 体系、文件条带化（Striping）、分层复合布局（PFL）、多副本镜像（FLR）以及由 Grant 机制统治的页面缓存流水线**！
