# 第四章：Portal RPC 机制深度拆解 —— 流水线引擎、线程绑定与大块 RDMA

> “如果说 LNet 铺设了分布式集群的高速公路，那么 Portal RPC（简称 PTLRPC）就是在这条公路上飞驰的高铁调度系统。它不仅要承载成千上万并发客户端的海量请求，更要将控制平面（元数据、锁协商）与数据平面（GB/s 级的页面 IO）精确解耦，在极端异构与并发洪峰下保持纳秒级响应与零内存拷贝。”

在上一章 [Wire Protocol 线路协议](../part-01-foundation/03-wire-protocol.md) 中，我们拆解了二进制报文的封装规范与 Capsule 抽象。本章我们将深入 Lustre 最核心的通信中枢 —— **Portal RPC**。

我们将从源码级剖析：客户端异步守护线程 [`ptlrpcd`](https://github.com/lustre/lustre-release/blob/master/lustre/ptlrpc/ptlrpcd.c) 的伙伴结对调度算法、服务端多 CPT 亲和的 [`ptlrpc_service`](https://github.com/lustre/lustre-release/blob/master/lustre/ptlrpc/service.c) 流水线模型、`ptlrpc_request` 的七阶段状态机，以及支撑几十 GB/s 读写吞吐的 **Bulk Transfer RDMA** 传输引擎。

---

## 4.1 体系架构：为什么需要 Portal RPC？控制与数据解耦

在传统的 RPC 系统（如 Sun RPC 或普通 RESTful/gRPC）中，一个请求通常将参数和载荷数据揉在一个 TCP 流中发送。
当向服务端写入一个 4MB 的文件块时，整个 RPC 必须等待 4MB 数据在网络上推完才能返回。如果多个客户端并发写入，网卡队列与线程上下文切换将迅速卡死。

Lustre 采用了源自超算 Portals 体系的设计哲学：**控制流（Control Plane）与数据流（Data Plane）彻底分离**。

```text
+-------------------------------------------------------------------------------+
|                       Portal RPC 控制与数据解耦架构全景                       |
+-------------------------------------------------------------------------------+

      Client                                                Server (OST / MDT)
        |                                                           |
 [用户发起 4MB 写入]                                                |
        |                                                           |
 (1) 准备 Bulk Desc (注册 4MB 页面)                                 |
        |                                                           |
 (2) 发送极小的 RPC 请求 (仅包含元数据与 Match Bits, ~1KB)           |
        |================= Portal 10 (OST_IO) =====================>|
        |                                                  [解析 RPC 请求]
        |                                                  [分配磁盘空间/预留缓存]
        |                                                           |
        |                                            (3) 服务端主动发起 RDMA Read
        |<================ Bulk GET (RDMA 单边拉取) ================| (4MB 零拷贝入库)
        |                                                           |
        |                                                  [物理 IO / WAL 落盘]
        |                                                           |
 (4) 接收极小的 RPC 应答 (~512B)                                    |
        |<================ Portal 10 (RPC Reply) ===================|
        |                                                           |
 [用户写入完成返回]
```

### 4.1.1 Portal 端口隔离与服务解耦

Portal RPC 将不同的业务操作隔绝在完全独立的 LNet Portal 编号上，从而杜绝“海量数据 IO 阻塞元数据或心跳”的级联死锁：

| Portal 常量 | 编号 | 核心职责与业务流 | 线程池模型 |
| :--- | :--- | :--- | :--- |
| `MDS_REQUEST_PORTAL` | 12 | 元数据操作请求（`lookup`, `create`, `unlink`） | MDT 专用服务线程池 |
| `OST_IO_PORTAL` | 10 | 数据对象 IO 控制请求（`read`, `write`, `punch`） | OST IO 专用服务线程池 |
| `LDLM_CB_REQUEST_PORTAL` | 14 | 分布式锁异步阻断回调（Blocking AST / Revocation） | 锁撤销专用线程，避免锁级联阻塞 |
| `MGS_PORTAL` | 16 | 集中式管理服务（配置拉取、心跳与日志订阅） | MGS 线程池 |

每个 Portal 拥有独立的内存缓冲区链表（`rqbd`）与线程调度队列，一条总线卡死绝不会波及其他业务。

---

## 4.2 客户端异步引擎：`ptlrpcd` 线程池与伙伴结对机制

在 Linux 内核客户端，VFS 调用不能长期同步阻塞。Lustre 客户端必须具备高并发、非阻塞发起成百上千个 RPC 的能力。
承载这一使命的引擎是 [`lustre/ptlrpc/ptlrpcd.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ptlrpc/ptlrpcd.c)。

### 4.2.1 每 CPT 线程池与拓扑隔离

为了消除跨 CPU 核心与 NUMA 节点的内存缓存反弹，`ptlrpcd` 在模块加载时，会根据系统 CPT（CPU 虚拟处理单元）的分布，在每个 CPT 上生成一组专用的内核线程：

```c
/* lustre/ptlrpc/ptlrpcd.c */
struct ptlrpcd {
	int			pd_size;
	int			pd_index;
	int			pd_cpt;		/* 当前线程池所属的 NUMA CPT */
	int			pd_cursor;	/* 负载均衡游标 */
	int			pd_nthreads;	/* 本 CPT 内的线程总数 */
	int			pd_groupsize;	/* 伙伴线程组大小（默认为 2） */
	struct ptlrpcd_ctl	pd_threads[];
};
```

客户端发起 RPC 时，通过 `ptlrpc_queue_wait()` 将请求放入当前线程的 `ptlrpc_request_set` 集合中。如果调用方选择异步发送，则通过 `ptlrpcd_add_req()` 将其交付给本 CPT 负载最低的 `ptlrpcd` 线程。

### 4.2.2 伙伴线程组（Partner Group Policy）：破解 RPC 嵌套自死锁

在内核分布式文件系统中，有一个极其致命的隐蔽陷阱：**RPC 完成回调中的嵌套 RPC 死锁**。

```text
[场景]：
1. 客户端发起了读操作 RPC-A。
2. ptlrpcd 线程收到了 RPC-A 的应答，并就地执行其 interpret_callback。
3. 在 interpret_callback 中，由于服务端发现缓存失效，要求客户端刷新属性，
   因此该回调内部试图调用 ptlrpc_queue_wait 发起一个同步 RPC-B！
4. 此时，当前 ptlrpcd 线程被挂起阻塞在 RPC-B 上；
5. 悲剧发生：RPC-B 的底层应答报文同样需要该 ptlrpcd 线程去轮询处理！
   当前线程被挂起，无法处理自己发起的 RPC-B 的应答 -> 系统死锁！
```

Lustre 设计了极为精妙的 **伙伴线程组机制（Partner Group Policy）**：
每个 `ptlrpcd` 线程都不是孤立的，它至少拥有一个伙伴线程（Partner Thread，默认 `ptlrpcd_partner_group_size = 2`）。

```text
+-------------------------------------------------------------------------------+
|                       ptlrpcd 伙伴线程组 (Partner Group) 防死锁机制           |
+-------------------------------------------------------------------------------+

       NUMA CPT 0
   +-------------------------------------------------------------------------+
   |                             Partner Group                               |
   |   +-----------------------------+     +-----------------------------+   |
   |   |      ptlrpcd 线程 0         |     |      ptlrpcd 线程 1         |   |
   |   |                             |     |                             |   |
   |   | 正在执行 RPC-A 的完成回调   |     | 接管本 Group 的事件循环     |   |
   |   |   |                         |     |   |                         |   |
   |   |   +-> 发起嵌套 RPC-B        |     |   +-> 轮询并接收 RPC-B 应答 |   |
   |   |       [陷入等待阻塞]        |     |       [唤醒线程 0 继续推进] |   |
   |   +-----------------------------+     +-----------------------------+   |
   +-------------------------------------------------------------------------+
```

当线程 0 在执行回调需要发起新请求时，它会将监控权移交给伙伴线程 1。伙伴线程继续监听网络事件并接管应答，彻底斩断了“等待自己唤醒自己”的环形依赖链。

---

## 4.3 请求生命周期：七阶段状态机（`enum rq_phase`）

每一个在网络中飞行的请求，在代码中都由一个庞大的结构体 [`struct ptlrpc_request`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lustre_net.h#L988) 承载。
它的生命周期由严密的内核状态机调度驱动：

```text
+-------------------------------------------------------------------------------+
|                       ptlrpc_request 七阶段状态机流转图                       |
+-------------------------------------------------------------------------------+

          [ 用户态 / VFS 调用发起 ]
                     |
                     v
           +--------------------+
           |    RQ_PHASE_NEW    |  分配内存、绑定 XID、封装 Capsule 结构
           +---------+----------+
                     |
                     v
           +--------------------+
           |    RQ_PHASE_RPC    |  挂入 LNet 待发队列，下发网络硬件
           +---------+----------+
                     |
         +-----------+-----------+
         |                       | (若包含大块数据传输)
         v                       v
 [等待 RPC 应答]         +--------------------+
         |               |   RQ_PHASE_BULK    |  RDMA 内存描述符就绪，等待 RDMA 传输
         |               +---------+----------+
         |                         |
         +-----------+-------------+
                     |
                     v
           +--------------------+
           | RQ_PHASE_INTERPRET |  收到应答，触发异步 interpret 回调函数
           +---------+----------+
                     |
                     v
           +--------------------+
           | RQ_PHASE_COMPLETE  |  成功完成，释放网络资源
           +--------------------+
                     |
     (发生异常超时 / 连接断开)
                     |
                     v
           +--------------------+
           | RQ_PHASE_UNREG_RPC |  强制从 LNet 取消注册 RPC 缓冲区
           +---------+----------+
                     |
                     v
           +--------------------+
           |RQ_PHASE_UNREG_BULK |  强制注销并解绑 DMA / RDMA 内存映射
           +--------------------+
```

### 4.3.1 核心状态迁移含义

查看 [`lustre/include/lustre_net.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lustre_net.h#L739)：

1. **`RQ_PHASE_NEW` (0xebc0de00)**：
   请求刚被创建。分配唯一的全局事务 XID，计算超时时间 `rq_timeout`，完成报文头 `ptlrpc_body` 与参数打包。
2. **`RQ_PHASE_RPC` (0xebc0de01)**：
   请求已通过 `LNetPut()` 提交给物理网络驱动。此时客户端将请求加入等待应答的哈希表，并设置自适应超时定时器。
3. **`RQ_PHASE_BULK` (0xebc0de02)**：
   如果是数据读写请求，控制 RPC 已经到达服务端，此时客户端处于等待服务端主动发起 RDMA GET/PUT 的阶段。
4. **`RQ_PHASE_INTERPRET` (0xebc0de03)**：
   客户端接收到了服务端的回包。如果注册了异步解释器 `ptlrpc_interpterer_t`，就在此阶段执行上层业务回调。
5. **`RQ_PHASE_COMPLETE` (0xebc0de04)**：
   所有逻辑完成。若操作具备修改属性，请求将转入 `imp_replay_list` 等待事务持久化，否则彻底销毁。
6. **`RQ_PHASE_UNREG_*` (0xebc0de05 ~ 06)**：
   发生超时或者收到中断信号（如用户按了 `Ctrl+C`），系统不能简单 `kfree` 请求内存，因为底层的 InfiniBand HCA 芯片可能随时向这块内存 DMA 写入！必须先进入 UNREG 状态，通过 LNet 强行断开物理通道，收到 LNET_EVENT_UNLINK 后方可安全释放。

---

## 4.4 服务端请求处理流水线：`ptlrpc_service` 与 `ptlrpc_service_part`

服务端的高性能吞吐，仰赖于多层缓冲池与事件分离架构。
每个服务（如 `ost_io`）由一个 [`struct ptlrpc_service`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lustre_net.h) 代表，并在底层按 CPT 划分为多个独立的 [`struct ptlrpc_service_part`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lustre_net.h#L1694)。

```text
+-------------------------------------------------------------------------------+
|                     ptlrpc_service_part 内部物理流水线                        |
+-------------------------------------------------------------------------------+

  LNet 网络硬件驱动层
         |
         | (通过预先投递的空闲缓冲区接收 RPC)
         v
  +---------------------------------------------+
  |  scp_rqbd_posted (空闲请求缓冲区描述符链表) |
  +----------------------+----------------------+
                         |
                 [硬件 DMA 填满缓冲区]
                         |
                         v
  +---------------------------------------------+
  |  scp_req_incoming (新到达请求未解包队列)    |
  +----------------------+----------------------+
                         |
                 [唤醒服务工作线程]
                         |
                         v
  +---------------------------------------------+
  |  Network Request Scheduler (NRS 网络调度器) | <--- 支持 FIFO / CRRN / TBF
  +----------------------+----------------------+
                         |
                 [按优先级/公平算法出队]
                         |
                         v
  +---------------------------------------------+
  |  Service Worker Threads (执行实际业务逻辑)  |
  +----------------------+----------------------+
                         |
                 [处理完毕，生成应答]
                         |
                         v
  +---------------------------------------------+
  |  ptlrpc_send_reply() (异步发送回包给客户端) |
  +---------------------------------------------+
```

### 4.4.1 预分配无锁接收：RQBD 机制

在数万客户端同时发起请求时，如果在网络中断上下文去动态调用 `alloc_pages()` 分配接收内存，系统瞬间就会因内存锁竞争而瘫痪。

Lustre 服务端采用 **RQBD（Request Buffer Descriptor）预先投递机制**：
- 服务端在启动时，由 `ptlrpc_service_part` 一次性向 LNet 注册挂载大量固定大小的物理内存块（`scp_rqbd_posted`）。
- 网卡收到报文后，直接通过硬件 DMA 写入这些已准备就绪的连续页面。
- 当一个 RQBD 中的空间被即将到来的请求填满，该描述符立即被移入 `scp_hist_rqbds` 进行历史追踪，同时触发异步分配逻辑补充新的 RQBD 到 LNet。整个报文接收路径**零内存分配、零上下文阻塞**。

### 4.4.2 网络请求调度器（NRS, Network Request Scheduler）

进入服务端的请求并不是简单的“先来后到（FIFO）”执行。Lustre 内置了可插拔的 NRS 调度器体系：
1. **FIFO 策略**：默认策略，按物理接收时间严格排序。
2. **CRRN 策略（Client Round-Robin New）**：基于客户端 NID 的加权轮询调度，杜绝单个疯狂发起压力的恶意客户端挤占整个存储集群的吞吐。
3. **TBF 策略（Token Bucket Filter）**：令牌桶流控，支持根据用户的 UID、GID 或作业 JobID 对元数据与 IO 速率实施硬限流（QoS）。

---

## 4.5 大块数据传输引擎：Bulk Transfer RDMA

当客户端需要读取或写入成兆字节的数据时，Portal RPC 不会把数据打碎塞入 RPC 报文头中，而是通过 [`struct ptlrpc_bulk_desc`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lustre_net.h#L1422) 启动大块数据传输（Bulk Transfer）。

```c
/* lustre/include/lustre_net.h */
struct ptlrpc_bulk_desc {
	atomic_t		bd_refs;
	unsigned long		bd_is_rdma:1,	/* 启用硬件 RDMA 模式 */
				bd_is_srv:1;	/* 当前描述符位于服务端还是客户端 */
	enum ptlrpc_bulk_op_type bd_type;	/* PTLRPC_BULK_GET_* 或 PUT_* */
	__u32			bd_portal;	/* 数据传输的目标 Portal 编号 */
	struct ptlrpc_request	*bd_req;	/* 关联的控制 RPC 请求 */
	int			bd_iov_count;	/* 页面数组长度 */
	int			bd_nob;		/* 本次传输的总字节数 (Number of Bytes) */
	__u64			bd_last_mbits;	/* LNet 硬件匹配标识符 */
	struct bio_vec		*bd_vec;	/* Linux 内核标准分散/聚集 IO 页面向量 */
};
```

### 4.5.1 为什么由服务端主动拉取（Bulk GET）与推送（Bulk PUT）？

这是高性能存储系统设计中极其深刻的安全与流控权衡：

```text
[若由客户端主动推数据（Push）]：
客户端将 4MB 数据一股脑推送给服务端 -> 服务端此时本地磁盘满载或正在执行事务 Flush ->
没有空闲内存接收 -> 内存溢出（OOM）或网络层丢包重传！

[Lustre 方案：服务端拉取（Pull via Bulk GET）]：
1. 客户端只是发送“我打算写 4MB”的微型意向 RPC；
2. 服务端收到请求，结合自身当前内存压力与磁盘调度器状态，排队等待；
3. 一旦服务端准备好对应的 Page 缓存，服务端硬件主动向客户端发送 RDMA Read 指令；
4. 数据从客户端物理内存直接被“吸”入服务端内存；
5. 服务端完全掌控了整条链路的内存与物理 IO 节拍！
```

### 4.5.2 GPU Direct Storage（GDS / GPU RDMA）支持

查看 [`lustre_net.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lustre_net.h#L1428) 最新的演进定义：
```c
/* bulk request is GPU RDMA transfer, use page->host as real address */
bd_is_rdma:1,
```
在现代 AI 大模型超算集群中，训练框架（如 PyTorch、Megatron-LM）需要直接将检查点（Checkpoint）或数据集从 GPU 显存载入/写出。
Lustre 的 Bulk Transfer 已经原生拓展了对 NVIDIA GPUDirect Storage（GDS）的支持：
数据流跳过宿主机内存（Host PageCache），由 InfiniBand 网卡通过 PCIe 交换机直接与 GPU HBM 显存发起 P2P RDMA 交互，将端到端通信延迟压缩数倍，单节点吞吐飙升至 100GB/s 以上！

---

## 4.6 生产事故复盘：RPC 堆积、线程饥饿与服务端“假死”排查

### 4.6.1 生产事故现场

某超算中心在运行 20,000 核 MPI 作业时，存储集群监控告警频发，MDT 与多个 OST 出现数十秒无响应现象，所有计算节点 `dmesg` 开始剧烈喷射：
```text
LustreError: 12345:0:(client.c:2310:ptlrpc_check_status()) @@@ slow request to OST0002 
Lustre: ost_io: thread 412 has been running for 35s! (possible deadlock)
```

### 4.6.2 根因定位与排查链路

运维工程师通过检查服务端 proc 节点快速定位了病灶：
```bash
# 查看当前正在被处理的活跃 RPC 数量与排队深度
cat /proc/fs/lustre/ptlrpc/services/ost_io/req_history

# 查看 OST IO 线程池的实时负载
cat /proc/fs/lustre/ptlrpc/services/ost_io/threads_running
cat /proc/fs/lustre/ptlrpc/services/ost_io/threads_max
```

排查发现：
1. 底层存储阵列偶发出现慢盘，导致后端文件系统同步阻塞；
2. `ost_io` 服务默认配置的最大线程数 `threads_max = 256` 被迅速占满；
3. 新到达的 IO 请求全部堵死在 `scp_req_incoming` 队列中，未被处理的 RPC 产生级联超时，引发客户端疯狂发起 `MSG_RESENT` 重试风暴；
4. 巨量的重传请求彻底冲垮了服务端的 CPU 中断与接收缓冲。

### 4.6.3 生产调优处方

针对该类高并发 IO 场景，必须通过调优服务端线程池与队列参数实施加固：

```bash
# 1. 动态扩张服务端服务线程上限，允许更多并发处理排队
lctl set_param ost.OSS.ost_io.threads_max=1024
lctl set_param ost.OSS.ost_io.threads_min=128

# 2. 启用 NRS CRRN 公平调度，压制单作业的重传洪峰
lctl set_param ost.OSS.ost_io.nrs_policies="crrn"

# 3. 调优客户端每个 CPT 的守护线程数，避免客户端过载
options ptlrpc ptlrpcd_per_cpt_max=8
```

---

## 4.7 Portal RPC 并发调度与生产调优 Checklist

- [ ] **服务端服务线程池动态扩容（Threads Tuning）**：
  在高并发闪存 OSS/MDS 上，检查 `/proc/fs/lustre/ptlrpc/services/*/threads_max`，默认 256 容易在慢 IO 时耗尽。推荐根据 NVMe 并发队列深度将 `ost_io` 线程提升至 `threads_max=512~1024`，并设定 `threads_min=128` 避免频繁销毁创建线程。
- [ ] **客户端飞行 RPC 上限与带宽时延乘积（Inflight BDP）匹配**：
  检查客户端 `max_rpcs_in_flight`。对于 200Gbps 高吞吐网络，单个 OSC 建议配置 `max_rpcs_in_flight=16~32`；对于海量小文件高并发元数据场景，MDC 建议设置为 `max_rpcs_in_flight=16`，防止过深队列触发服务端拥塞。
- [ ] **网络请求调度器（NRS）防插队配置**：
  在多租户超算集群中，务必将 MDS 与 OSS 的 NRS 调度策略切换为公平轮询：
  ```bash
  lctl set_param *.*.nrs_policies="fifo crrn"
  ```
  利用 CRRN（Client Round-Robin Network）策略，强行压制单租户恶性死循环写入占满服务管道。
- [ ] **Bulk RDMA 缓冲区 64 字节对齐核查**：
  在开发自定义驱动或使用 GPU Direct Storage（GDS）时，确保所有的 RDMA 传输页面基地址与偏移对齐到 64 字节或 4KB 边界，杜绝网卡在 PCIe 总线上执行代价高昂的分散聚集拆分（Scatter-Gather）。
- [ ] **客户端 ptlrpcd 伙伴结对健康度**：
  通过 `cat /proc/fs/lustre/ptlrpcd/info` 监控客户端后台 `ptlrpcd` 线程堆积状态，确保无线程长时间陷入 D 状态（Uninterruptible Sleep）。

---

## 4.8 源码关键点检索索引

下表汇总了本章涉及的 Portal RPC 核心数据结构与实现源码，供架构深潜查阅：

| 逻辑实体 / 抽象 | 源码定义文件 | 核心数据结构 / 函数 | 生产定位与意义 |
| :--- | :--- | :--- | :--- |
| **RPC 核心请求体** | [`lustre_net.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lustre_net.h) | `struct ptlrpc_request` | 贯穿生命周期的核心凭证，承载 XID/Phase/Capsule |
| **客户端调度引擎** | [`ptlrpcd.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ptlrpc/ptlrpcd.c) | `struct ptlrpcd`, `ptlrpcd_ctl` | 每 CPT 专属异步线程池与伙伴结对防死锁引擎 |
| **客户端请求流转** | [`client.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ptlrpc/client.c) | `ptlrpc_queue_wait()`, `ptlrpc_check_reply()` | 客户端发送、重试、超时判定与应答解析入口 |
| **服务端流水线** | [`service.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ptlrpc/service.c) | `struct ptlrpc_service_part` | 服务端 CPT 隔离架构、RQBD 投递与线程派发 |
| **大块 RDMA 引擎** | [`niobuf.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ptlrpc/niobuf.c) | `struct ptlrpc_bulk_desc` | 零拷贝内存注册、Bulk GET/PUT 与 GDS 显存直连 |
| **请求生命周期** | [`lustre_net.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lustre_net.h) | `enum rq_phase` | 7 阶段状态机，统御初始化、网络、Bulk 与解绑流程 |

---

## 4.8 本章小结

在本章中，我们拆解了 Lustre 最具工程智慧的分布式通信骨架 —— Portal RPC：
- 我们理解了**控制流与数据流分离**的物理哲学，以及由服务端反向拉取/推送（Bulk GET/PUT）所带来的绝对流控安全；
- 我们揭示了 `ptlrpcd` 如何通过 **CPT 隔离与伙伴结对模型（Partner Group）** 彻底破解内核 RPC 递归自死锁；
- 我们遍历了 `ptlrpc_request` 的七阶段状态机，洞悉了服务端的 RQBD 预投递与零分配接收架构。

然而，在成千上万个节点组成的庞大超算网络中，**“网络延迟不是恒定的，物理节点随时可能抖动甚至断电宕机”**。
静态的 RPC 超时会导致灾难性的雪崩误判，而服务端的意外崩溃更是要求系统能够自动在混乱中恢复未完成的事务。

在下一章 [第五章：自适应超时（AT）与网络/节点恢复](05-recovery-at.md) 中，我们将揭开 Lustre 著名的 **自适应超时算法（Adaptive Timeouts）**、**Early Reply 续命机制** 以及震撼业界的 **事务重放（Transaction Replay）与锁重放（Lock Replay）** 容灾奇迹！
