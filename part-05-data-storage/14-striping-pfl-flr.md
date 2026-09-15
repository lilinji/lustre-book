# 第十四章：文件条带化（Striping）与现代布局演进 —— 经典分片、PFL 复合阶梯、DoM 小文件极速化与 FLR 镜像

> “在单机存储中，一个文件是一个连续的扇区集合；而在 Lustre 的宇宙里，一个文件在逻辑上是一个整体，而在物理上却是由分散在数十台服务器、数百块磁盘上的对象碎片协同奏响的交响乐。从早期的静态条带，到能够根据文件大小动态伸缩的渐进式布局（PFL），再到将小文件直接吞进元数据全闪盘的 DoM，Lustre 的数据布局演进史就是一部向存储物理极限发起冲击的战争史。”

在上一章 [OST 与 OSD 存储核心](13-ost-osd.md) 中，我们理解了单台数据存储节点内部的 OFD 调度与底层磁盘映射。本章我们将升维到全集群数据路由的核心大脑 —— **文件条带化（Striping）与现代复合布局**。

我们将彻底解开：
- 经典条带化（Plain Striping）的数学模型及其面对大小文件时的“两难困局”；
- 能够随文件体积自然生长的 **渐进式复合布局（PFL, Progressive File Layout）**；
- 彻底消灭小文件跨节点网络往返的 **Data-on-MDT（DoM）** 黑科技；
- 赋予文件系统原生跨机架容灾与热读镜像能力的 **文件级复制（FLR, File-Level Redundancy）**；
- 生产环境中由于条带失配导致的“木桶短板”灾难排查与 **`lfs migrate` 在线重构处方**。

---

## 14.1 经典条带化数学模型与“两难困局”

### 14.1.1 经典网络 RAID-0 映射模型

在 Lustre 诞生之初，其核心卖点便是将上百台 OST 聚合成一个虚拟的高性能并行盘阵。
一个文件由三大经典元数据参数定义（记录在 Inode 的 `trusted.lov` 扩展属性中）：
- **`stripe_size`**：单片条带的连续字节数（默认 1MB，必须为 64KB 的整数倍）；
- **`stripe_count`**：该文件横跨的物理 OST 数量；
- **`stripe_offset`**：第一个数据块存放的起始 OST 编号。

```text
+-------------------------------------------------------------------------------+
|                       经典条带化物理切分与分布全景 (stripe_count=4)          |
+-------------------------------------------------------------------------------+

逻辑文件视图: /mnt/lustre/big_dataset.bin (总大小: 16 MB)
+-----------+-----------+-----------+-----------+-----------+-----------+ ...
| 0MB ~ 1MB | 1MB ~ 2MB | 2MB ~ 3MB | 3MB ~ 4MB | 4MB ~ 5MB | 5MB ~ 6MB | ...
+-----------+-----------+-----------+-----------+-----------+-----------+ ...
      |           |           |           |           |           |
      v           v           v           v           v           v
  OST 0000    OST 0001    OST 0002    OST 0003    OST 0000    OST 0001
[Chunk 0]   [Chunk 1]   [Chunk 2]   [Chunk 3]   [Chunk 4]   [Chunk 5]
```

**数学寻址公式**：
当客户端要读取文件内偏移量为 $Offset$ 的数据时，客户端 LMV/LOV 驱动通过极速算术直接推导物理目标：
$$\text{StripeIndex} = \left( \frac{\text{Offset}}{\text{stripe}_\text{size}} \right) \pmod{\text{stripe}_\text{count}}$$
$$\text{TargetOST} = (\text{stripe}_\text{offset} + \text{StripeIndex}) \pmod{\text{TotalOSTs}}$$
$$\text{ObjectOffset} = \left( \lfloor \frac{\text{Offset}}{\text{stripe}_\text{size} \times \text{stripe}_\text{count}} \rfloor \times \text{stripe}_\text{size} \right) + (\text{Offset} \pmod{\text{stripe}_\text{size}})$$

客户端**无需经过任何中心节点查询**，直接向计算出的 `TargetOST` 发起 RDMA 读取。数十台客户端同时并发读取该文件时，所有 OST 的物理网络和硬盘被同时打满，吞吐呈现完美的线性叠加！

### 14.1.2 经典条带的“死穴”

然而，静态条带在大规模混合负载下暴露出了致命缺陷：
1. **小文件宽条带灾难**：如果管理员为了追求性能，将默认条带设置为 `stripe_count=8`。当用户在集群解压一个包含 1000 万个 4KB 文本的源码包时，每个 4KB 小文件都会在 8 台 OST 上各创建一个物理空对象！OST 预分配 Inode 瞬间被耗尽，元数据锁网络流量暴增数百倍；
2. **大文件窄条带瓶颈**：如果默认设置为 `stripe_count=1`，当某个机器学习作业生成一个 50TB 的训练权重文件时，这 50TB 数据将全部堆积在单块物理磁盘上！该 OST 的 IO 队列被挤爆，其他几百台 OST 却在旁边“围观闲死”。

---

## 14.2 渐进式复合布局（PFL）革命

为了彻底终结“大文件需要多条带，小文件需要单条带”的矛盾，Lustre 在 2.10 版本引入了里程碑式的 **渐进式复合布局（PFL, Progressive File Layout）**。

### 14.2.1 阶梯生长模型：`struct lov_comp_md_v1`

PFL 允许一个文件拥有复合的、基于区间（Extent）分级的多个布局组件（Components），查看源码 [`include/uapi/linux/lustre/lustre_user.h:1164`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_user.h#L1164)：

```text
+-------------------------------------------------------------------------------+
|                       PFL 渐进式复合布局物理架构                              |
+-------------------------------------------------------------------------------+

逻辑文件空间:
[0 ----------------- 256MB)  [256MB ------------- 16GB)  [16GB ---------------- EOF)
=================================================================================
Component 0:                 Component 1:                Component 2:
- Extent: [0, 256MB)         - Extent: [256MB, 16GB)     - Extent: [16GB, EOF)
- stripe_count = 1           - stripe_count = 4          - stripe_count = 32
- stripe_size = 1MB          - stripe_size = 1MB         - stripe_size = 4MB
=================================================================================
   小文件: 仅占 1 台 OST!      中型文件: 4 台 OST 并发!     超大文件: 打满 32 台 OST!
```

### 14.2.2 核心黑科技：惰性延迟分配（Delayed Allocation）

在 PFL 架构下，当一个新文件被 `touch` 创建时：
- MDS 只在元数据中写入了 PFL 布局模板，**此时底层一个 OST 数据对象都不会分配**！
- 当用户写入了第 1 个字节时，只有 Component 0 对应的第 1 台 OST 会物理分配对象（`LCME_FL_INIT`）；
- 只有当文件写入量真正突破 256MB 时，系统才会动态触发 Component 1，向另外 4 台 OST 批量申请对象；
- 如果这个文件最终只有 10KB，它在物理上**永远只占用 1 个 OST，零任何冗余消耗！**

### 14.2.3 生产环境黄金 PFL 模板推荐

```bash
# 为顶级目录配置开箱即用的黄金 PFL 策略
lfs setstripe -E 256M -c 1 -S 1M \
              -E 16G  -c 4 -S 1M \
              -E EOF  -c 16 -S 2M /mnt/lustre/workspace
```

---

## 14.3 小文件性能神器：Data-on-MDT（DoM）

在超算和 AI 训练中，除了大文件之外，还充斥着海量的代码脚本、配置文件和微型图片（< 1MB）。
在传统架构中，即使是一个 4KB 的文件，客户端也必须经历两段物理通信：
1. 向 MDT 请求元数据与打开文件；
2. 跨网络向远端 OST 发起网络读取。

Lustre 2.11 推出了 **Data-on-MDT（DoM）** 技术：**直接把小文件数据塞进 MDT 的全闪 NVMe 盘中！**

```text
+-------------------------------------------------------------------------------+
|                       DoM 消除网络往返执行时序对比                            |
+-------------------------------------------------------------------------------+

[传统读 4KB 小文件 (至少 2 次物理网络往返)]:
Client ---------------- (1) IT_OPEN 元数据请求 -----------------> MDT
Client <--------------- (2) 返回元数据与 OST 列表 ---------------- MDT
Client ---------------- (3) Bulk Read 请求 ---------------------> OST
Client <--------------- (4) 返回 4KB 数据 ------------------------ OST

[DoM 模式读 4KB 小文件 (严格仅 1 次网络往返!)]:
Client ---------------- (1) IT_OPEN 元数据请求 -----------------> MDT
Client <--------------- (2) 在同一个 RPC 回包中直接内嵌返回 4KB 数据! MDT
=> OST 零参与、零网络往返、全闪 SSD 极速直达!
```

在 PFL 复合结构中，DoM 表现为一个特殊的第 0 号组件：
- Component 0: `[0, 1MB)`，其模式标记为 `LOV_PATTERN_MDT`，数据存储在本地 MDT 的 `osd-ldiskfs/osd-zfs` 中；
- 超过 1MB 的部分，无缝顺延溢出到传统的 OST 阵列上。

```bash
# 创建启用 DoM 的目录 (1MB 以内直存 MDT 全闪，1MB 以上存 OST)
lfs setstripe -E 1M -L mdt -E EOF -c 2 /mnt/lustre/dom_dir
```

---

## 14.4 文件级多副本镜像（FLR, File-Level Redundancy）

在工业级存储中，传统的容灾通常依赖物理硬件（如昂贵的双控磁盘阵列或双活网关）。
Lustre 2.11 引入的 **FLR（File-Level Redundancy）** 赋予了系统原生的软件定义多副本能力。

### 14.4.1 镜像拓扑与状态机

一个启用了 FLR 的文件，在 `lov_comp_md_v1` 中拥有多个平行的镜像（Mirrors）。每个 Mirror 自身可以是一个独立的 PFL 布局，甚至可以分别落在不同的 OST 物理池（Pool）中（例如 Mirror 0 在本地 NVMe 池，Mirror 1 在远端备份机械盘池）：

```text
+-------------------------------------------------------------------------------+
|                       FLR 文件级镜像双写与状态机                              |
+-------------------------------------------------------------------------------+

                       用户文件: /mnt/lustre/critical_model.pt
                                       |
         +-----------------------------+-----------------------------+
         |                                                           |
         v                                                           v
  Mirror 0 (优先读写主本: Preferred)                          Mirror 1 (容灾副本)
  - 位于 OST Pool "nvme_pool"                                - 位于 OST Pool "hdd_pool"
  - 状态: LCME_FL_INIT                                       - 状态: LCME_FL_STALE (写后变脏)
```

### 14.4.2 镜像生命周期与异步自愈

1. **多副本读负载均衡（Read Load-Balancing）**：
   当上千个计算节点同时读取同一个热门模型文件时，客户端 LOV 会随机或根据就近网络拓扑打散到各个 Mirror 上读取，**读取带宽直接成倍翻番！**
2. **写后自动置脏（Write Invalidation）**：
   当应用修改该文件时，系统将数据写入 Preferred 主镜像，同时在元数据中原子将其他 Mirror 标记为 `LCME_FL_STALE`（脏本）；
3. **后台无感异步重同步（Resync）**：
   用户态守护进程 `lhsm` 或后台同步命令利用 Changelog 捕获的 `CL_FLRW` 事件，自动在后台拉起数据块同步：
   ```bash
   lfs mirror resync /mnt/lustre/critical_model.pt
   ```
   同步完毕后，清除 `STALE` 标记，副本重新对齐。

---

## 14.5 生产实战：条带配置失当引发的“木桶短板”与在线重构

### 14.5.1 现场故障复盘：一个大文件拖垮万卡集群

某自动驾驶科技公司，数百个节点在同时训练时，整体 GPU 利用率突然从 95% 暴跌至 10%。
`iostat` 监控显示：全集群仅有 **OST0014 一块磁盘的读吞吐打满在 100% 饱和状态**，其他数百块磁盘近乎空闲。

### 14.5.2 根因定位与排查链路

工程师对训练数据集文件执行条带诊断：
```bash
lfs getstripe -v /mnt/lustre/datasets/train_10tb.tar
```
输出显示了一幕经典的配置悲剧：
```text
/mnt/lustre/datasets/train_10tb.tar
lmm_stripe_count:  1
lmm_stripe_size:   1048576
lmm_stripe_offset: 14
```
**病灶还原**：
- 用户在解压这个 10TB 的超巨型 Tar 包时，直接放在了默认单条带（`c=1`）的目录下；
- 整个 10TB 的数据被硬生生塞进了 OST0014 单机上；
- 所有的训练节点在并发读取该数据集时，数千个进程向同一个 OST0014 疯狂发起并发读取；
- **一台机器的网卡与磁盘瓶颈，活生生拖死了价值数亿元的算力集群！**

### 14.5.3 生产级在线重条带化（Online Restriping）

针对此类严重倾斜的文件，Lustre 提供了在线热迁移重构利器 `lfs migrate`，**上层应用无需停止，在线打散数据！**

```bash
# 1. 紧急在线重构: 将该 10TB 单条带文件打散到 64 台 OST 上
# -c 64: 跨 64 个 OST
# -S 4M: 调大条带大小至 4MB，提升连续大块顺序读性能
lfs migrate -c 64 -S 4M /mnt/lustre/datasets/train_10tb.tar

# 2. 或者升级为现代 PFL 复合布局
lfs migrate -E 1G -c 1 -E 64G -c 8 -E EOF -c 64 /mnt/lustre/datasets/train_10tb.tar

# 3. 监控迁移进度
lfs getstripe /mnt/lustre/datasets/train_10tb.tar
```

在执行 `lfs migrate` 期间，数据被安全透明地重新分发到 64 台目标 OST，完成之后瞬时切换布局，全集群带宽立即恢复满血状态！

---

## 14.6 文件条带与复合布局调优 Checklist

在智算与超算生产集群中，针对文件条带化与复合布局（PFL/DoM/FLR），必须严格把关以下规则：

- [ ] **严禁全局默认全条带（Stripe Count = -1）**：
  检查根目录与用户家目录的默认条带配置。若默认设为全条带，所有小文件（如几十 KB 的代码、脚本）都会在每个 OST 上创建一个空对象，造成严重的 Inode 碎片浪涌。
- [ ] **PFL 渐进式阶梯布局标准化部署**：
  为大型共享目录推荐配置通用生产 PFL 模板：
  ```bash
  lfs setstripe -E 1M -L mdt -E 1G -c 1 -E 100G -c 8 -E EOF -c 32 /mnt/lustre/shared_data
  ```
  实现 1MB 以内小文件常驻 MDT（DoM），1GB 以内单盘存储，百 GB 以上自动扩充至 32 盘并发。
- [ ] **DoM 大小上限（Data-on-MDT Limit）严控**：
  DoM 虽快，但会占用昂贵的 MDT 高速存储空间。生产建议 `dom_size <= 1MB` 或 `2MB`，严禁设置过大导致 MDT 物理块提前耗尽。
- [ ] **FLR 镜像延迟重同步守护（Mirror Resync）**：
  启用非延迟镜像写（Delayed Mirroring）时，确认后台同步守护进程 `lhsm` 或 Lustre 异步重同步任务正常运行，定期运行 `lfs mirror verify` 检查副本哈希一致性。
- [ ] **大型单文件在线打散（lfs migrate）**：
  建立定期扫描任务，对体积大于 1TB 且条带数小于 4 的历史大文件执行在线 `lfs migrate -c 32` 打散，防止作业读取时压爆单台 OST 网卡。

---

## 14.7 核心源码对照表

| 核心抽象 / 模块 | 源码文件 | 关键结构体 / 函数 | 架构功能与生产定位 |
| :--- | :--- | :--- | :--- |
| **复合布局规范** | [`lustre_user.h`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_user.h) | `struct lov_comp_md_v1`, `lov_comp_md_entry_v1` | PFL、DoM、FLR 统一的二进制复合描述头 |
| **客户端条带分发** | [`lov_io.c`](https://github.com/lustre/lustre-release/blob/master/lustre/lov/lov_io.c) | `lov_io_slice_init()`, `lov_io_sub_init()` | 将用户 VFS IO 空间切分为多 OST 独立的子 IO |
| **布局解包引擎** | [`lov_pack.c`](https://github.com/lustre/lustre-release/blob/master/lustre/lov/lov_pack.c) | `lov_comp_md_unpack()`, `lov_comp_md_size()` | 解析并组装 PFL 复合 Extent 与多镜像 Mirror 链 |
| **服务端条带分配** | [`lod_qos.c`](https://github.com/lustre/lustre-release/blob/master/lustre/lod/lod_qos.c) | `lod_qos_prep_create()` | 基于剩余容量与 IO 负载的 OST 智能加权轮询算法 |
| **DoM 本地路由** | [`lod_sub_object.c`](https://github.com/lustre/lustre-release/blob/master/lustre/lod/lod_sub_object.c) | `lod_sub_declare_create()` | 识别 `LOV_PATTERN_MDT` 将小文件直接路由至本地 MDT |

---

## 14.7 本章小结

在本章中，我们解开了 Lustre 数据平面最具革命性的演进篇章：
1. **经典条带化模型** 奠定了分布式 RAID-0 极速并行访问的数学地基，但受制于静态配置的两难局限；
2. **渐进式复合布局（PFL）** 以阶梯式的分段设计和惰性分配，实现了“小文件单盘省资源，大文件百盘满并发”的完美自适应；
3. **Data-on-MDT（DoM）** 砍断了小文件访问的第二次网络握手，将小文件读取时延压缩至单机级别；
4. **文件级镜像（FLR）** 在纯软件层面提供了透明的高可用冗余与多副本并行读加速。

然而，无论文件在磁盘上的物理布局如何精妙，当客户端应用程序疯狂调用 `write()` 产生大量数据时，**客户端的 PageCache 内存何时下刷？客户端会不会因为盲目缓存过多数据而导致服务端发生内存溢出（OOM）？**
在下一章 [第十五章：分布式 IO 流水线与缓存 Grant 机制](15-io-grant.md) 中，我们将探索 Lustre 最精巧的分布式流控与信用额度引擎 —— **Grant 空间配额协议与客户端 IO 聚合流水线**！
