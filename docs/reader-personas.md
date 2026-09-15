# 《Lustre 分布式文件系统》读者画像契约 (Reader Personas)

本书不仅是一本代码剖析手册，更是一份面向高端系统研发与生产一线 SRE 的架构工程契约。为了保证全书始终保持高信息密度与工程精确度，全书所有章节均对齐以下读者画像。

---

## 1. 核心目标读者画像矩阵

### 画像 A：存储内核与分布式系统研发工程师 (Core Developer)
- **背景经验**：熟悉 C/C++ 编程，理解 Linux VFS、块设备驱动、页缓存（Page Cache）、网络套接字以及基本分布式共识算法（Paxos/Raft）。
- **痛点与诉求**：
  - 面对 Lustre 几百万行内核源码无从下手，无法理清 OBD、`lu_object`、`cl_object` 的调用时序与切片机制；
  - 想要深入理解分布式锁（LDLM）如何将范围冲突与元数据意向合并到 1-RTT 内；
  - 希望借鉴 Lustre 的大规模 RDMA 零拷贝、序列生成器（FID）与两阶段分布式事务设计自研新一代存储底座。
- **本书赋能目标**：
  - 能在 10 分钟内准确定位任何文件 IO 操作在 Linux VFS -> llite -> OSC -> OFD -> OSD 驱动栈中的真实函数与结构体；
  - 具备独立编写 Lustre 内核扩展模块与性能补丁的实战功力。

### 画像 B：超算 HPC 与 AI 智算中心 SRE 架构师 (Infrastructure Architect)
- **背景经验**：负责维护上万张 GPU、PB 级全闪/混闪 Lustre 存储集群，熟悉 Slurm、InfiniBand/RoCE 网络、Pacemaker HA 与 Linux 系统调优。
- **痛点与诉求**：
  - AI 大模型千卡训练写入 Checkpoint 时频繁遭遇 I/O Hang 与雪崩重试风暴；
  - 节点宕机触发自适应超时（AT）与分布式锁重放（Lock Replay）时出现 AB-BA 环形死锁；
  - 面对元数据膨胀、DNE 跨节点目录热点与 LNet 动态路由丢包缺乏精准排错兵法。
- **本书赋能目标**：
  - 掌握全套内核级观测手段（`lprocfs`、`jobstats`、`bpftrace` 探针、`crash` 转储分析）；
  - 能在生产重大灾难现场迅速定性根因，执行 4 步 SOP 热修复与容灾止血。

---

## 2. 前置知识边界与豁免范围 (Prerequisites Boundary)

为避免文章沦为浅层科普，本书做出如下知识边界契约：

- **免解释的基础知识（直接引述）**：
  - Linux 文件系统三要素：`inode`、`dentry`、`superblock`；
  - 经典网络模型：TCP/IP 三次握手、滑动窗口、MTU、Socket 编程；
  - 内核基础并发原语：自旋锁（`spinlock_t`）、读写信号量（`rw_semaphore`）、互斥体（`mutex`）、原子操作（`atomic_t`）。
- **本书重点攻坚的深水区机制（必须从物理与第一性原理推导）**：
  - 分布式意向锁（Intent Lock）与 3 类异步锁通知（AST: Blocking/Completion/Glimpse）；
  - NUMA 拓扑感知的 CPT（CFS Partition Table）无锁环形队列与线程亲和性绑定；
  - 128 位全局无缝定位的 FID 体系与序列批发算法；
  - 客户端 Writeback 信用流控体系（Grant 机制）与动态缩减（Grant Shrink）；
  - GPU Direct Storage（GDS）PCIe P2P DMA 显存直连绕过 CPU 页缓存管线。

---

## 3. 终态能力达成矩阵 (Exit Criteria)

读完整部 8 卷 24 章后，读者在以下四个维度必须达成决定性飞跃：

| 能力维度 | 进阶前状态 | 读完整本专著后的终态能力 |
| :--- | :--- | :--- |
| **代码洞察** | 把 Lustre 当成不可捉摸的黑盒 | 闭眼可绘出完整分层对象栈，清晰知晓每个结构体字段的内存生命周期 |
| **性能调优** | 盲目照抄网上的 `lctl` 调优参数 | 结合 InfiniBand BDP 窗口、DRAM 吞吐与 Flash 介质延迟，严谨推算最优配置 |
| **故障穿透** | 遇到死锁只会粗暴重启节点或重装 | 能够通过 `debugfs`、`lctl debug_kernel` 和 vmcore 堆栈精准逆向死锁环 |
| **系统设计** | 仅会做单机或初级主从存储 | 掌握经受住全球 Top500 顶级超算 20 年严酷考验的高性能分布式系统哲学 |
