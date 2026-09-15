# 第五章：自适应超时（AT）与网络/节点恢复 —— Early Reply 续命、状态机跃迁与事务无损重放

> “在分布式系统理论中，FLP 不可能定理早已宣判：在异步网络中，不存在能够完全容忍崩溃失效的确定性共识算法。然而在工程物理世界里，超算集群必须面对成千上万节点、海量慢盘 IO 与不可预测的网络拥塞。Lustre 创造性地通过自适应超时（AT）、Early Reply 续命与双阶段事务/锁重放机制，在脆弱的物理硬件之上构筑了磐石般的高可用性。”

在上一章 [Portal RPC 机制深度拆解](04-portal-rpc.md) 中，我们掌握了请求的七阶段流水线。但分布式系统永远无法回避墨菲定律：
- 如果一个 OST 在刷盘时遇到了底层 RAID 慢盘，导致 RPC 耗时从 10 毫秒突增到 40 秒，客户端该判定它“死了”发起故障转移，还是“活着”继续等待？
- 如果 MDS 发生硬件断电或内核崩溃重启，那些客户端已经收到应答但在服务端内存中尚未落盘的 `mkdir` / `create` 操作，如何做到一个都不丢失？

本章将直击 Lustre 最负盛名的工程绝技：**自适应超时（Adaptive Timeouts, AT）**、**提前应答（Early Reply）** 与 **两阶段重放（Transaction & Lock Replay）**。

---

## 5.1 静态超时之死与自适应超时（Adaptive Timeouts）

### 5.1.1 传统静态超时的“两难陷阱”

在早期的 Lustre（以及大多数传统分布式系统如 NFS）中，RPC 超时时间通常配置为一个静态固定值（例如 `timeout = 30s`）。这种设计在大规模集群中必然导致系统崩溃：

```text
+-------------------------------------------------------------------------------+
|                       静态固定超时的“两难陷阱”                                |
+-------------------------------------------------------------------------------+
  如果 timeout 设得太短 (例如 5 秒):
  ==================================> 存储压力大时，正常的慢 IO 被误判为宕机！
                                      数万客户端同时发起重连与重试风暴，
                                      引发级联雪崩（Cascading Failure）！

  如果 timeout 设得太长 (例如 300 秒):
  ===================================> 某个节点真正断电宕机时，所有应用进程陷入
                                       长达 5 分钟的“D 状态”僵死，
                                       生产业务完全不可用！
```

### 5.1.2 AT 的核心算法：服务时间预测与网络往返分离

Lustre 自适应超时（AT）的核心思想是：**客户端不猜测超时时间，超时时间完全由服务端根据实时负载动态计算并随回包捎带（Piggyback）同步给客户端**。

客户端每次计算特定请求的期望等待截止时间（Deadline），遵循以下公式：
$$\text{Deadline} = \text{CurrentTime} + 2 \times \text{NetworkLatency} + \text{ServiceEstimate}$$

- **`NetworkLatency`（网络往返时延）**：客户端测量的与该目标节点最近几组 RPC 的底层网络往返时间，通常在微秒到毫秒级；
- **`ServiceEstimate`（服务端耗时预估）**：服务端当前处理该类型请求的历史加权移动平均时间（EMA/SMA）。

在 [`lustre/include/lustre_import.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lustre_import.h#L60-L65) 中，客户端为每个目标存储服务的不同 Portal 维护了精细化的自适应耗时结构：

```c
struct imp_at {
	int			iat_portal[IMP_AT_MAX_PORTALS];
	struct adaptive_timeout	iat_net_latency;
	struct adaptive_timeout	iat_service_estimate[IMP_AT_MAX_PORTALS];
};
```

服务端在每个回包的 `ptlrpc_body` 中，动态填入其当前的 `pb_timeout` 和 `pb_service_time`。客户端收到应答后调用 `at_add_latency()` 动态修正历史均值。

---

## 5.2 绝妙的“免死金牌”：Early Reply 续命机制

即便有了 AT，偶发的“极端长尾慢 IO”（如大文件 Flush、同步文件系统 Journal Commit）依然可能突破历史均值。
为了彻底解决“服务端还没死，只是在拼命干活，客户端却等不及要断连”的矛盾，Lustre 设计了惊艳业界的 **Early Reply（提前应答/免死金牌）** 机制！

```text
+-------------------------------------------------------------------------------+
|                       Early Reply 提前应答时序图                              |
+-------------------------------------------------------------------------------+

Client                                                Server (OST / MDT)
  |                                                           |
  |--- (1) 发送重型写请求 RPC (预计 10s 内完成) ------------->| [放入工作队列]
  |    [设置 Deadline = Now + 10s]                            | [底层存储负载激增，慢盘!]
  |                                                           |
  |                                                  [耗时已达 8 秒，逼近 Deadline!]
  |                                                  [触发 ptlrpc_at_send_early_reply]
  |                                                           |
  |<-- (2) Early Reply (带 LPRFL_EARLY_REPLY 标记, extra=+20s)|
  |                                                           |
  | [收到 Early Reply!]                                       |
  | [确认服务端存活且正在处理]                                 |
  | [重置 Deadline = Now + 20s]                               |
  |                                                           |
  | ... 继续耐心等待 ...                                      | ... 最终处理完毕 ...
  |                                                           |
  |<-- (3) Final Reply (包含真实数据与最终结果) ---------------|
  |                                                           |
[业务正常返回，零误判，零重试]
```

### 5.2.1 核心源码深度剖析

查看服务端核心逻辑 [`lustre/ptlrpc/service.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ptlrpc/service.c#L1516-L1600)：

```c
static int ptlrpc_at_send_early_reply(struct ptlrpc_request *req)
{
	/* 计算距离客户端最初设定的截止时间还剩多少秒 */
	timeout_t olddl = req->rq_deadline - ktime_get_real_seconds();
	
	/* 如果已经越过了 deadline，说明网卡或服务已严重卡死，不再发 early reply */
	if (olddl < 0)
		RETURN(-ETIMEDOUT);

	/* 检查客户端报文是否支持 AT 协商 */
	if ((lustre_msghdr_get_flags(req->rq_reqmsg) & MSGHDR_AT_SUPPORT) == 0)
		RETURN(-ENOSYS);

	/* 
	 * 服务端重新计算评估耗时：
	 * 当前已花费时间 + 额外宽限时间 at_extra (默认 30s)
	 */
	obd_at_measure(obd, &svcpt->scp_at_estimate, 
		       at_extra + ktime_get_real_seconds() - req->rq_arrival_time.tv_sec);

	/* 发送仅包含 ptlrpc_body 的轻量应答包，打上 EARLY_REPLY 标记 */
	rc = lustre_pack_reply_flags(reqcopy, 1, NULL, NULL, LPRFL_EARLY_REPLY);
	...
}
```

客户端在收到带有 `LPRFL_EARLY_REPLY` 标记的报文时（[`lustre/ptlrpc/client.c:524`](https://github.com/lustre/lustre-release/blob/master/lustre/ptlrpc/client.c#L524)），**绝不会将其作为业务结果提交给 VFS**，而是提取其中最新的服务时间预估，直接将本地计时器的超时时间向后推迟，继续等待最终的 Final Reply。

---

## 5.3 客户端导入连接状态机：`enum lustre_imp_state`

当网络光纤被挖断，或者服务端物理宕机无法发出 Early Reply 时，客户端是如何一步步优雅降级并最终自动重连的？
这依赖于挂载在客户端 `struct obd_import` 上的 **导入状态机（Import State Machine）**。

```text
+-------------------------------------------------------------------------------+
|                       Lustre 客户端导入状态机流转全景                         |
+-------------------------------------------------------------------------------+

                         +-------------------+
                         |  LUSTRE_IMP_NEW   | (初始建立连接)
                         +---------+---------+
                                   |
                                   v
                         +-------------------+
                         |  LUSTRE_IMP_FULL  | <----------------------------+
                         +---------+---------+ (健康稳定服务状态)           |
                                   |                                        |
                     (网络断开 / 连续超时 / 探测失败)                       |
                                   |                                        |
                                   v                                        |
                         +-------------------+                              |
                         | LUSTRE_IMP_DISCON | (标记断开，启动 Pinger 探测) |
                         +---------+---------+                              |
                                   |                                        |
                                   v                                        |
                         +-------------------+                              |
                         |LUSTRE_IMP_CONNECT | (向服务端发送重连 CONNECT 报文)  |
                         +---------+---------+                              |
                                   |                                        |
                    +--------------+--------------+                         |
                    | (服务端处于 Recovery 模式)   | (超时仍未恢复)          |
                    v                             v                         |
          +-------------------+         +--------------------+              |
          | LUSTRE_IMP_REPLAY |         | LUSTRE_IMP_EVICTED |              |
          +---------+---------+         +--------------------+              |
                    |                     (已被服务端驱逐踢出,              |
            (重放所有事务 RPC)            本地缓存失效抛 -EIO)              |
                    |                                                       |
                    v                                                       |
          +-------------------+                                             |
          |LUSTRE_IMP_REPLAY_ |                                             |
          |      LOCKS        | (重放所有客户端活跃锁)                      |
          +---------+---------+                                             |
                    |                                                       |
                    v                                                       |
          +-------------------+                                             |
          |LUSTRE_IMP_REPLAY_ |                                             |
          |       WAIT        | (等待集群所有其他客户端完成重放)            |
          +---------+---------+                                             |
                    |                                                       |
                    v                                                       |
          +-------------------+                                             |
          |LUSTRE_IMP_RECOVER | (重发断连期间积压的普通未发出 RPC)          |
          +---------+---------+                                             |
                    |                                                       |
                    +-------------------------------------------------------+
```

### 5.3.1 状态转移矩阵

查看源码 [`lustre/include/lustre_import.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lustre_import.h#L68-L81)：

1. **`LUSTRE_IMP_FULL`**：
   导入连接完全健康，所有并发 RPC 无阻碍飞行。
2. **`LUSTRE_IMP_DISCON`**：
   检测到连接失效。客户端将所有处于飞行中（In-flight）的普通 RPC 拦截回收到待发队列，挂起上层 VFS 进程，阻止进一步错误扩散。
3. **`LUSTRE_IMP_CONNECTING`**：
   客户端 `pinger` 守护线程以指数退避算法不断向服务端尝试发起 `MDS_CONNECT` / `OST_CONNECT`。
4. **`LUSTRE_IMP_REPLAY`**：
   服务端节点重启完成！但此时服务端**绝不开放普通用户读写**，而是进入全集群恢复期。客户端按单调递增的事务号（`transno`），依次回放之前成功执行过但未持久化的修改型请求。
5. **`LUSTRE_IMP_REPLAY_LOCKS`**：
   事务重放完毕，客户端向服务端声明并重建自己持有的分布式锁。
6. **`LUSTRE_IMP_REPLAY_WAIT`**：
   客户端已完成所有重放，等待服务端的恢复窗口（Recovery Window）结束。
7. **`LUSTRE_IMP_RECOVER`**：
   恢复窗口关闭，重新发送断线期间上层进程积压的普通读写请求。
8. **`LUSTRE_IMP_EVICTED`（被驱逐深渊）**：
   如果客户端断网时间超过了服务端的硬恢复超时限制（`recovery_time_hard`），服务端为了保护其他几千台节点的正常运转，会将该客户端强制踢出（Evict）。该客户端持有的所有分布式锁和脏数据被作废，上层进程收到 `-EIO` 报错。

---

## 5.4 事务重放（Transaction Replay）：断电零丢失奇迹

很多存储系统面对服务端突然断电重启，唯一的选择是让客户端报错回滚，或者依赖复杂的 Paxos/Raft 少数服从多数协议。
但 Lustre 的元数据服务器（MDS）往往采用主备 HA 架构。**Lustre 如何保证当 Active MDS 宕机重启后，已发生的元数据修改一个都不丢失？**

答案就是：**客户端即分布式日志缓冲区（Client-Side Transaction Log）**！

```text
+-------------------------------------------------------------------------------+
|                       Lustre 事务重放 (Transaction Replay) 全景                |
+-------------------------------------------------------------------------------+

客户端 (Client)                                          服务端 (MDT)
      |                                                        |
[用户创建文件 /dir/fileA]                                      |
      |--- (1) RPC Request (create) -------------------------->|
      |                                                [分配 transno = 501]
      |                                                [写入内存日志，尚未落盘]
      |<-- (2) RPC Reply (transno=501, committed=490) ---------|
      |                                                        |
[将 RPC 缓存进 imp_replay_list]                                |
[业务进程返回成功！]                                           |
      |                                                   * 突然断电宕机! *
      |                                                   * 主机重启/备机接管 *
      |                                                        |
      |                                                [后端磁盘挂载恢复]
      |                                                [磁盘最高持久化 transno=490]
      |                                                [丢失了 491~501 的内存状态!]
      |                                                [进入 RECOVERY 状态]
      |                                                        |
      |<== (3) 重连成功，协商开始 Replay =======================|
      |                                                        |
      |--- (4) 重新发送 RPC (transno=501, 附带 MSG_REPLAY) --->|
      |                                                [服务端依次回放事务 501]
      |                                                [状态机恢复到断电前一刻！]
      |<-- (5) Replay OK (transno=501) ------------------------|
      |                                                        |
[从 imp_replay_list 安全移出]                                  |
```

### 5.4.1 `imp_replay_list` 与 `pb_last_committed` 的精密配合

1. 客户端发送修改型 RPC 时，请求对象被置入 `obd_import` 的 `imp_replay_list` 链表中（[`lustre/include/lustre_net.h:1081`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lustre_net.h#L1081)）。
2. 服务端回包时带上当前的 `pb_transno` 以及物理磁盘已完成落盘的最高事务号 `pb_last_committed`。
3. 只有当后续任何 RPC 的回包中显示：
   $$\text{pb}_\text{last}_\text{committed} \ge \text{req}\text{->}\text{rq}_\text{transno}$$
   客户端才能调用 `ptlrpc_free_committed()` 将该请求从重放链表中彻底释放！
4. 如果服务端中途暴毙，其磁盘未落盘的数据，由客户端链表中的原始请求重新补全。

### 5.4.2 基于版本的恢复（VBR, Version-Based Recovery）

在超算大规模并发重放时，如果客户端 A 和客户端 B 分别发起了针对不同目录的重放，网络延迟可能导致重放顺序颠倒。
Lustre 的 **VBR 机制** 在报文中记录了目标对象在被修改前的版本号（`pb_pre_versions[0]`）。
服务端在重放执行前，校验磁盘当前对象的版本是否等于 `pb_pre_versions[0]`。
- 若相等：证明因果依赖链完好，即使与其他客户端的重放有顺序交错，依然可以安全幂等执行！
- 若不匹配：触发因果依赖回溯，等待前置依赖的客户端完成重放后再执行，杜绝了文件系统目录树撕裂。

---

## 5.5 锁重放（Lock Replay）：无缝重建分布式锁状态

在所有的事务重放（Transaction Replay）执行完毕后，导入状态机并不会立刻恢复服务，而是步入 **`LUSTRE_IMP_REPLAY_LOCKS`** 阶段。

**为什么必须重放锁？**
因为当服务端宕机重启后，它内存中的 LDLM（分布式锁管理器）资源树已经被彻底清空！
如果此时立刻开放客户端写入，客户端 A 以为自己还持有 `/data/model.pt` 的独占写锁（PW Lock）并在本地修改 PageCache，而服务端可能已经将新的读锁发给了客户端 B，造成致命的数据脏读或重写覆盖！

```text
+-------------------------------------------------------------------------------+
|                       Lock Replay 锁重建时序                                  |
+-------------------------------------------------------------------------------+

客户端 (Client)                                          服务端 (MDT / OST)
      |                                                        |
[事务重放全部完毕]                                             | [所有未落盘事务已重建]
      |                                                        |
      |--- 发送 LDLM 重放报文 (附带旧锁句柄、模式 PW、范围 [0-4M]) ->|
      |                                                        | [在内存中重新构建 Lock Tree]
      |                                                        | [将该锁状态直接设置为 GRANTED]
      |<-- 确认锁重建成功 --------------------------------------|
      |                                                        |
[遍历并重放本地所有未被释放的活跃锁]                            |
      |                                                        |
[所有客户端重放完毕，恢复正常服务]                             | [解除 RECOVERY 锁定]
```

通过这一步，客户端原有的内存锁结构与服务端的新内存状态重新对齐，上层打开的文件描述符（FD）和内存映射（mmap）无需关闭重启，整个过程对上层应用程序**完全透明**！

---

## 5.6 生产故障全景复盘：慢盘引发 Early Reply 风暴与节点被 Evict 事故

### 5.6.1 故障现场：集群大规模 Eviction 惨案

## 5.6 真实生产事故复盘：慢盘引发自适应超时雪崩与客户端 Eviction 惨案

### 5.6.1 生产事故现场

某大型 AI 训练集群在进行万卡预训练时，突然数十个计算节点被踢出存储集群：
```text
LustreError: 8712:0:(import.c:1240:ptlrpc_import_delay_req()) @@@ import OST001b-osc-ffff8801 has been evicted!
LustreError: 8712:0:(llite_nfs.c:120:ll_dirty_page_discard()) dropping dirty page for fid [0x200000401:0x12:0x0]
Application killed with signal 9 (SIGKILL): IO Error
```

### 5.6.2 根因调查链条

工程师深入服务端排查，还原了故障链条：
1. OST001b 对应的一组后端物理盘发生了阵列卡掉盘重构，写入延迟从 5ms 飙升至 60 秒以上；
2. 此时大量计算节点的 RPC 超出预估时间，OST 疯狂向客户端发送 Early Reply；
3. 但由于网络交换机此时发生单端口微突发拥塞（Microburst），部分计算节点丢失了连续两次 Early Reply；
4. 计算节点判定 OST001b 彻底失联，强行转入 `LUSTRE_IMP_DISCON` 并发起重连；
5. 服务端 OST001b 在恢复超时窗口内未能及时处理这几台节点的重连请求，认定它们已失联，触发硬超时 **Eviction**；
6. 客户端所有未下刷的脏页（Dirty Pages）被强制丢弃，训练任务瞬间报 `-EIO` 崩溃。

### 5.6.3 生产加固处方

在权威生产集群中，必须放宽自适应超时与恢复宽限期，避免硬件抖动引发系统雪崩：

```bash
# 1. 调大 Early Reply 的宽限时间 (at_extra)，默认 30 秒调至 60 秒
lctl set_param at_extra=60

# 2. 调高最大服务时间估计上限 (at_max)，由 600s 调高至 1200s，容忍大并发 IO 刷盘
lctl set_param at_max=1200

# 3. 延长服务端对客户端的软/硬恢复宽限窗口 (默认 300s -> 900s)
lctl set_param obdfilter.*.recovery_time_soft=600
lctl set_param obdfilter.*.recovery_time_hard=900

# 4. 开启针对 Eviction 的内核告警审计
lctl set_param ldlm.dump_namespaces=1
```

---

## 5.7 自适应超时与容错恢复调优 Checklist

在智算中心与超算生产环境中，针对自适应超时与节点重连恢复，必须落实以下核查防线：

- [ ] **自适应超时时间（Adaptive Timeouts）上限校准**：
  检查全集群 `/sys/module/ptlrpc/parameters/at_max` 与 `/sys/module/ptlrpc/parameters/at_min`。全闪存储建议 `at_min=5`、`at_max=600`；机械盘归档存储建议 `at_max=1200`，避免大块刷盘时因超时估计过低引发误踢。
- [ ] **Early Reply 续命容限（at_extra）核对**：
  确认 `at_extra` 设定在 30 秒 ~ 60 秒之间。该值代表服务端预估自己还能撑多久并通知客户端继续等待。如果网络拥塞较频繁，必须调大此参数，防止 Early Reply 丢包后客户端提前放弃等待。
- [ ] **软硬恢复时间窗口（Recovery Time）对齐**：
  检查所有 Target（MDT/OST）的 `recovery_time_soft`（默认 300s）和 `recovery_time_hard`（默认 900s）。集群计算节点超过 2,000 台时，建议将 `recovery_time_soft` 调大至 600 秒，为成千上万节点的锁重放预留平滑窗口。
- [ ] **版本一致恢复（VBR）开启确认**：
  核实 `lctl get_param mdt.*.vbr` 与 `ost.*.vbr` 为 1。VBR 能在重放发生部分失败时保护元数据不至于整卷回滚，将故障范围限制在冲突事务本身。
- [ ] **客户端 Eviction 报警联动**：
  部署 Prometheus 规则监听 `import.*.state` 与内核 `dmesg` 中的 `has been evicted`。一旦发生驱逐，意味着脏数据被丢弃，监控系统必须立即触发 P0 级严重警报并隔离对应节点。

---

## 5.8 核心源码对照表

| 核心抽象 / 机制 | 关键文件 | 核心函数 / 数据结构 | 架构功能与生产定位 |
| :--- | :--- | :--- | :--- |
| **自适应超时核心** | [`service.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ptlrpc/service.c) | `obd_at_measure()`, `ptlrpc_at_send_early_reply()` | 历史均值动态修正与 Early Reply 提前回包续命 |
| **客户端 AT 接收** | [`client.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ptlrpc/client.c) | `ptlrpc_at_recv_early_reply()` | 解析免死金牌，推迟 Deadline，防止误判重试 |
| **导入状态机** | [`import.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ptlrpc/import.c) | `ptlrpc_import_state_name()`, `ptlrpc_set_import_discon()` | 11 种导入状态生命周期管理与事件派发 |
| **事务重放** | [`recover.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ptlrpc/recover.c) | `ptlrpc_resend()`, `ptlrpc_replay_req()` | 从 `imp_replay_list` 提取事务进行零丢失幂等重放 |
| **锁重放** | [`ldlm_request.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ldlm/ldlm_request.c) | `ldlm_replay_locks()` | 遍历本地锁列表，在服务端重建 Distributed Lock Tree |
| **保活心跳** | [`pinger.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ptlrpc/pinger.c) | `ptlrpc_pinger_main()` | 周期性 ping 与指数退避重连守护进程 |

---

## 5.8 本章小结

在本章中，我们解构了 Lustre 在网络混乱与节点死伤边缘的生存法则：
1. **自适应超时（AT）打破了静态超时的两难困境**，让超时时间跟随服务端真实的物理 IO 节拍动态呼吸；
2. **Early Reply 是极具工程美学的免死金牌**，在服务端慢盘或重载时优雅化解客户端雪崩重试；
3. **两阶段无损重放（Transaction Replay + Lock Replay）** 将容灾成本巧妙地分摊到了庞大的客户端内存中，实现了单点宕机重启下全集群事务与锁的零丢失无感恢复！

至此，通信管道与可靠性机制已全面就绪。
在下一章 [第六章：LDLM 分布式锁管理器与意向锁](06-ldlm-locks.md) 中，我们将探索 Lustre 最宏大的并发一致性神殿 —— **Lustre Distributed Lock Manager (LDLM)**！我们将看到 Lustre 是如何利用范围锁、字段锁，以及首创的 **意向锁（Intent Lock）**，将传统分布式文件系统需要 5 次往返的打开文件交互压缩至仅仅 1 次！
