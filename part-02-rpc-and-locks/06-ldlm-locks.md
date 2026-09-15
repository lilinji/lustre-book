# 第六章：LDLM 分布式锁管理器与意向锁 —— 细粒度并发、AST 异步通信与 1-RTT 意向革命

> “在单机操作系统中，互斥锁与读写锁依靠 CPU 原子指令与内存总线仲裁，耗时不过数纳秒。但在拥有上万节点的超算集群中，如果每次并发访问都要经过多轮网络往返来协商分布式锁，系统的 IOPS 将不可避免地退化至原始时代。Lustre 的分布式锁管理器（LDLM）通过范围锁、字段锁、三大异步 AST 神经网以及首创的‘意向锁（Intent Lock）’，完成了分布式存储史上最壮丽的并发性能革命。”

在前面的章节中，我们深入剖析了 [Portal RPC 管道](04-portal-rpc.md) 与 [自适应超时/恢复状态机](05-recovery-at.md)。本章我们将进入 Lustre 维持全局数据一致性与实现极速并发的核心殿堂 —— **Lustre Distributed Lock Manager (LDLM)**。

我们将彻底拆解：
- 为什么单机锁模型无法直接搬到分布式系统？
- 涵盖区间并发写入的 **范围锁（EXTENT）** 与多维度属性解耦的 **字段锁（IBITS）**；
- 将传统 5 次网络往返（5 RTT）暴力压缩至 1 次的 **意向锁（Intent Lock）**；
- 支撑分布式无缝协同的 **三大 AST（Blocking, Completion, Glimpse）** 异步回调机制；
- 避免集群内存被海量锁挤爆的 **动态锁收缩（SLV）与 LRU 机制**。

---

## 6.1 分布式锁的核心抽象与锁模式兼容性矩阵

### 6.1.1 核心三元组：Namespace、Resource 与 Lock

在单机内核中，锁通常直接嵌入在 `struct inode` 中。但在分布式文件系统中，锁的管理必须与物理数据解耦。
LDLM 建立了严格的三层拓扑抽象：

```text
+-------------------------------------------------------------------------------+
|                       LDLM 核心三层拓扑抽象                                   |
+-------------------------------------------------------------------------------+

                             struct ldlm_namespace
                           (命名空间：MDT 或 OST 独占)
                                       |
         +-----------------------------+-----------------------------+
         |                                                           |
         v                                                           v
struct ldlm_resource                                        struct ldlm_resource
(资源：由 128位 FID 标识)                                   (资源：对应特定文件或目录)
         |                                                           |
  +------+------+                                                    |
  |             |                                                    |
  v             v                                                    v
Granted 队列  Waiting 队列                                         ...
  |             |
  v             v
struct ldlm_lock (锁实体：持有者 Client NID, Mode, Extent/IBits, AST 指针)
```

1. **`struct ldlm_namespace`（命名空间）**：
   每个服务端（每个 MDT、每个 OST）维护独立的锁命名空间，负责该 Target 上所有锁的生命周期、并发队列与内存配额；
2. **`struct ldlm_resource`（锁资源）**：
   由一个 128 位的资源名称 `struct ldlm_res_id` 唯一标识（在 Lustre 2.x 中通常直接对应文件的全局唯一标识符 FID）；
3. **`struct ldlm_lock`（锁实体）**：
   记录实际的锁状态。每个 Resource 内部维护三个双向链表：
   - **`lr_granted`（已授予队列）**：当前没有任何冲突、正在被客户端生效持有的锁；
   - **`lr_waiting`（等待队列）**：因模式或范围冲突、尚未被授予的排队锁；
   - **`lr_converting`（转换队列）**：正在申请锁模式升级或降级的锁。

### 6.1.2 锁模式定义与兼容性矩阵（Compatibility Matrix）

查看源码 [`include/uapi/linux/lustre/lustre_idl.h`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_idl.h#L2596-L2608)：

```c
enum ldlm_mode {
	LCK_EX		= 1,	/* 独占锁 (Exclusive Lock) */
	LCK_PW		= 2,	/* 写锁 (Protected Write) */
	LCK_PR		= 4,	/* 读锁 (Protected Read) */
	LCK_CW		= 8,	/* 并发写 (Concurrent Write) */
	LCK_CR		= 16,	/* 并发读 (Concurrent Read) */
	LCK_NL		= 32,	/* 空锁 (Null Lock，无冲突) */
	LCK_GROUP	= 64,	/* 组锁 (Group Lock，跨进程协作) */
	LCK_COS		= 128,	/* 提交时提交锁 (Commit-on-Share) */
};
```

当一个新锁申请访问某个 Resource 时，服务端根据下表判定其是否能直接进入 `lr_granted`，还是必须挂起进入 `lr_waiting`：

```text
+-----------------------------------------------------------------------+
|                    LDLM 锁模式兼容性决策矩阵                           |
+-----------------------------------------------------------------------+
| 申请 \ 已存在 |   EX   |   PW   |   PR   |   CW   |   CR   |   NL    |
+---------------+--------+--------+--------+--------+--------+---------+
|      EX       |   否   |   否   |   否   |   否   |   否   |   是    |
|      PW       |   否   |   否   |   否   |   是   |   是   |   是    |
|      PR       |   否   |   否   |   是   |   否   |   是   |   是    |
|      CW       |   否   |   是   |   否   |   是   |   是   |   是    |
|      CR       |   否   |   是   |   是   |   是   |   是   |   是    |
|      NL       |   是   |   是   |   是   |   是   |   是   |   是    |
+-----------------------------------------------------------------------+
```

---

## 6.2 锁的四种形态：针对不同存储实体的定制化隔离

在 Lustre 中，不存在“一刀切”的锁。针对不同的文件系统对象，LDLM 派生出了四种特化的锁类型（[`enum ldlm_type`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_idl.h#L2614-L2621)）：

```c
enum ldlm_type {
	LDLM_PLAIN	= 10,	/* 扁平锁 */
	LDLM_EXTENT	= 11,	/* 范围锁 */
	LDLM_FLOCK	= 12,	/* POSIX 用户态文件锁 */
	LDLM_IBITS	= 13,	/* Inode 字段位锁 */
};
```

### 6.2.1 EXTENT 范围锁：超算并行 IO 的基石

在并行计算（MPI）场景中，数千个进程通常需要并发写入同一个极大的共享文件（如 100TB 的物理模拟网格）。
如果采用传统全文件粒度的写锁，所有进程只能串行排队写入，带宽直接暴跌至单机水平。

Lustre 在 OST 数据端全面采用 **EXTENT 范围锁**（[`struct ldlm_extent`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_idl.h#L2626)）：
```c
struct ldlm_extent {
	__u64 start;	/* 起始字节偏移 */
	__u64 end;	/* 终止字节偏移 (可至 0xFFFFFFFFFFFFFFFF 即 EOF) */
	__u64 gid;	/* 组锁标识 */
};
```

两个写锁（PW Mode）只要其申请的区间不发生重叠，它们在 LDLM 判定中就是**绝对兼容**的！

```text
+-------------------------------------------------------------------------------+
|                       EXTENT 范围锁并发并行写入全景                           |
+-------------------------------------------------------------------------------+

同一个文件对象 (OST Object FID: 0x200000401)
=================================================================================
[0 MB ----------- 4 MB]  [4 MB ----------- 8 MB]  [8 MB ---------- 12 MB]  ...
       Client A                 Client B                 Client C
     持锁: PW                 持锁: PW                 持锁: PW
  范围: [0, 4MB-1]         范围: [4MB, 8MB-1]       范围: [8MB, 12MB-1]
=================================================================================
               三大客户端同时满速打满物理网卡与 NVMe 阵列，互不阻塞！
```

### 6.2.2 IBITS 字段锁：元数据属性彻底解耦

在元数据服务器（MDT）上，文件的属性非常复杂：文件名、权限、大小、修改时间、扩展属性、条带布局等。
在早期分布式系统中，只要客户端 A 修改了文件权限，客户端 B 缓存的目录项和文件属性全被粗暴作废。

Lustre 设计了著名的 **Inode Bits Lock（IBITS 锁）**（[`enum mds_ibits_locks`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_idl.h#L973-L1002)）：

```c
enum mds_ibits_locks {
	MDS_INODELOCK_LOOKUP	= 0x00000001, /* 保护目录项 dentry 与路径名映射 */
	MDS_INODELOCK_UPDATE	= 0x00000002, /* 保护文件大小、链接数、时间戳 */
	MDS_INODELOCK_OPEN	= 0x00000004, /* 保护文件打开状态与句柄 */
	MDS_INODELOCK_LAYOUT	= 0x00000008, /* 保护文件条带布局 (LOV EA) */
	MDS_INODELOCK_PERM	= 0x00000010, /* 保护权限、属主与 ACL */
	MDS_INODELOCK_XATTR	= 0x00000020, /* 保护非权限扩展属性 */
	MDS_INODELOCK_DOM	= 0x00000040, /* 保护 MDT 上内嵌的小文件数据 (DOM) */
};
```

两个客户端可以同时持有同一个文件的独占写模式（PW）IBITS 锁，**只要它们的 bits 完全正交**！
- 客户端 A 持有 `MDS_INODELOCK_UPDATE` 写锁在修改文件时间戳；
- 客户端 B 同时持有 `MDS_INODELOCK_PERM` 读锁在做权限检查，客户端 C 持有 `MDS_INODELOCK_LOOKUP` 读锁在缓存文件名；
- 三者**完全互不干扰、无需撤回锁**！元数据并发吞吐因此产生质的跃升。

---

## 6.3 革命性的 1-RTT 意向锁（Intent Lock）

在分布式系统的经典交互模式下，执行一次看似简单的 `fd = open("/mnt/lustre/data.bin", O_RDONLY)`，在传统系统（如原始 NFS/Ceph）中必须按部就班地经历多轮网络交互：

```text
传统系统 VFS Open 时序 (至少 4~5 次网络往返!):
Client ---------------- (1) Lookup 请求 (获取 dentry) ---------------> MDT
Client <--------------- (2) Lookup 应答 (返回 inode) ----------------- MDT
Client ---------------- (3) 申请 Inode 读锁 ------------------------> MDT
Client <--------------- (4) 读锁已授予 (Granted) -------------------- MDT
Client ---------------- (5) 发起 Open 系统调用 ----------------------> MDT
Client <--------------- (6) Open 成功返回 --------------------------- MDT
Client ---------------- (7) 请求获取文件条带布局 (Getattr / Layout) -> MDT
Client <--------------- (8) 返回布局数据 ---------------------------- MDT
```

在 100 微秒延迟的网络中，打开一个文件就要白白浪费近 1 毫秒！如果有几千个并发进程同时执行，MDT 会被成倍的无意义交互报文彻底淹没。

### 6.3.1 意向锁的物理哲学：操作随锁行

Lustre 提出了震惊存储学术界的 **意向锁（Intent Lock）**：
**“既然客户端申请锁的最终目的是为了操作，为什么不直接把操作的意图直接夹带在加锁请求里，由服务端加锁时顺手把活给干了？”**

```text
+-------------------------------------------------------------------------------+
|                       意向锁 (Intent Lock) 1-RTT 极致时序                     |
+-------------------------------------------------------------------------------+

Client                                                        MDT (Server)
  |                                                                 |
[用户调用 open("data.bin", O_RDWR)]                                 |
  |                                                                 |
  |--- (1) LDLM_ENQUEUE (带 IT_OPEN 意向 + 路径名 + 访问模式) ------->|
  |                                                         [查找目录项 dentry]
  |                                                         [执行权限校验]
  |                                                         [分配打开句柄]
  |                                                         [锁定 IBITS 资源]
  |                                                         [打包文件 Layout]
  |                                                         [打包文件属性 body]
  |                                                                 |
  |<-- (2) LDLM_ENQUEUE Reply (包含锁句柄 + 属性 + Layout + 结果) ---|
  |                                                                 |
[客户端在本地一次性建好 dentry、inode、打开状态与条带映射！]        |
[耗时：严格仅 1 次网络往返 (1 RTT)！]
```

### 6.3.2 源码层面的意向映射

查看 [`lustre/include/obd.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/obd.h#L941-L957)：

```c
static inline int it_to_lock_mode(struct lookup_intent *it)
{
	/* 若包含创建意向，必须申请并发写锁 CW */
	if (it->it_op & IT_CREAT)
		return LCK_CW;
	/* 若为普通读属性、打开或解析路径，申请并发读锁 CR */
	else if (it->it_op & (IT_GETATTR | IT_OPEN | IT_LOOKUP))
		return LCK_CR;
	/* 若为布局意向，根据是否写打开申请 EX 或 CR */
	else if (it->it_op & IT_LAYOUT)
		return (it->it_open_flags & FMODE_WRITE) ? LCK_EX : LCK_CR;
	...
}
```

客户端直接使用带有意向的 RPC，在单次网络报文中跨越了“分布式锁协商、元数据解析、权限鉴权、布局下发”四大原本孤立的阶段。

---

## 6.4 锁的异步通信神经网：三大 AST 机制深度剖析

分布式锁不是被动等待轮询的静态结构，而是一个事件驱动的异步系统。
LDLM 的精髓在于其定义的 **三大 AST（Asynchronous System Trap 异步系统回调）**：

```text
+-------------------------------------------------------------------------------+
|                       LDLM 三大 AST 异步通知机制全景                          |
+-------------------------------------------------------------------------------+

      Client A (持锁者)                   Server (LDLM)           Client B (新申请者)
             |                                  |                         |
             |                                  |<--- (1) 申请冲突的写锁 ---|
             |                                  |     (进入 lr_waiting)   |
             |                                  |                         |
             |<-- (2) Blocking AST -------------|                         |
             |    (请立即下刷脏页并撤销/降级锁) |                         |
    [将 PageCache 脏页刷盘]                     |                         |
    [调用 ldlm_lock_cancel]                     |                         |
             |                                  |                         |
             |--- (3) Cancel OK 确认释放锁 ---->|                         |
             |                                  |                         |
             |                                  |--- (4) Completion AST ->|
             |                                  |    (恭喜，你的锁已授予!)|
             |                                  |                         |
```

### 6.4.1 Blocking AST（阻断回调）

当客户端 B 申请一个与客户端 A 当前持有的锁冲突的锁时，服务端不会强行粗暴剔除客户端 A，而是向客户端 A 发送一个 `LDLM_BL_CALLBACK`（Blocking AST）。
- 客户端 A 的回调函数（如 [`lustre/llite/file.c`](https://github.com/lustre/lustre-release/blob/master/lustre/llite/file.c) 中的 `ll_mds_blocking_ast()`）被触发；
- 如果是写锁（PW），客户端 A 必须在规定时间内将内核 PageCache 中的脏页通过 Bulk RPC 全部推向 OST；
- 下刷完成后，客户端 A 释放或降级持有的锁，服务端方可安全将锁授予客户端 B。

### 6.4.2 Completion AST（完成回调）

客户端在异步申请锁（Non-blocking 或排队模式）时，如果无法立即获得，请求线程可以先去处理其他逻辑。
一旦阻塞资源被释放，服务端通过 `LDLM_CP_CALLBACK`（Completion AST）通知客户端：“你之前排队的锁已经真正处于 GRANTED 状态”，客户端被唤醒继续推进 IO。

### 6.4.3 Glimpse AST（窥探回调）：只读探测神技

在传统文件系统中，如果用户敲了一个 `ls -l` 命令需要获知文件的大小（size）和修改时间（mtime），而此时另一个客户端正在并发执行写入并持有 `[0, EOF]` 的独占写锁。
如果必须回收写锁才能拿到最新大小，写入客户端的 IO 流将被严重打断并触发昂贵的多次刷盘。

Lustre 发明了 **Glimpse AST（窥探回调）**：
- 服务端向持锁写入的客户端发送一个极轻量的 Glimpse 报文；
- 持锁客户端在本地检查当前已被写入的最高偏移量，并就地原路回传；
- **持锁客户端的写锁完全不被撤销，写 IO 流完全不被中断**；
- 服务端据此拼装出正确的 stat 属性并返回给 `ls -l`！

---

## 6.5 动态锁收缩（Dynamic Lock Revocation）与 LRU 配额

### 6.5.1 客户端锁贪婪危机

在分布式文件系统中，为了最大化缓存命中率，客户端在完成读写后，**绝不会主动立刻向服务端归还锁**，而是将这些未使用的锁保存在本地 LRU 链表（`ns_unused_list`）中，以便下次打开或读写时能够实现“本地零 RTT 命中”。

然而，这引发了一个致命危机：
如果集群有 10,000 个客户端，每个客户端都贪婪地缓存了 50,000 把锁，服务端的内存中将积压 **5 亿把锁**！MDT 和 OST 的物理内存在几分钟内就会被全部爆头（OOM）。

### 6.5.2 SLV（Server Lock Volume）算法

Lustre 设计了一套精密的动态锁收缩算法：**服务端锁体积（Server Lock Volume, SLV）**。

```text
服务端根据系统当前可用物理内存压力，动态评估集群允许的最大锁总数 Limit。
并在每个 RPC 回包的 ptlrpc_body 中，动态捎带两个控制变量：
- pb_slv: 当前服务端的锁体积参考水位
- pb_limit: 该客户端被允许持有的最大未使用锁数量 (LRU Limit)
```

客户端在收到回包后，后台内核守护线程检测本地持有的锁数量：
$$\text{ClientUnusedLocks} > \text{pb}_\text{limit}$$
一旦越界，客户端后台线程立即触发 `ldlm_cancel_unused()`，批量将本地 LRU 队列末尾的闲置锁主动归还给服务端。

### 6.5.3 提前锁取消（Early Lock Cancel, ELC）

在释放无用锁时，如果每个锁都要发起一次单独的 RPC，网络将被数以万计的取消报文挤爆。
Lustre 支持 **提前锁取消（ELC）**：
客户端在发起任何新的正常 RPC（如发往该 Target 的普通读取或写入）时，顺便在报文中塞入需要销毁的旧锁句柄列表，**利用正常业务 RPC 免费搭车归还锁**，将销毁锁的网络开销降到了绝对的零。

---

## 6.6 生产实战：意向锁风暴、锁撤销超时与死锁排查

### 6.6.1 生产事故复盘：万人 `ls -l` 引发 MDT 锁雪崩

某智算中心在几千个计算节点同时启动深度学习数据加载脚本，该脚本错误地对同一个包含 1,000,000 个碎文件的共享数据集目录执行了无缓存的全局 `ls -l`：

```text
LustreError: 15421:0:(ldlm_lockd.c:380:ldlm_handle_bl_callback()) @@@ cancel callback failed for lock 0xffff880123: -110 (timed out)
Lustre: MDT0000: client c3-hpc-123 failed to revoke lock within 100s, initiating client EVICTION!
```

**故障演进路径**：
1. 上万客户端同时发起了对该巨型目录下文件的元数据读取请求；
2. 客户端持有的 IBITS 锁数量瞬间突破百万，MDT 内存告急，触发 SLV 极限收缩；
3. MDT 疯狂向成千上万个客户端下发 Blocking AST 撤销锁；
4. 客户端本地负责处理锁撤销的内核线程 `ldlm_canceld` 队列被打满，无法在超时窗口（`ldlm_timeout`）内逐一完成下刷和确认；
5. 服务端认定这几台客户端发生死锁，启动 **强制驱逐（Eviction）**，导致大批作业直接报错崩溃。

### 6.6.2 生产排查与调优处方

针对该类高并发锁争抢与锁雪崩，必须执行以下体系化加固：

```bash
# 1. 查看特定命名空间当前的活跃锁数量与等待队列深度
cat /proc/fs/lustre/ldlm/namespaces/lustre-MDT0000-mdc-*/pool/grant_rate
cat /proc/fs/lustre/ldlm/namespaces/lustre-MDT0000-mdc-*/lock_count

# 2. 调大客户端处理锁阻断回调的宽限超时时间 (默认 20s -> 调至 60s)
lctl set_param ldlm.timeouts.ldlm_timeout=60

# 3. 开启严格的 ELC 提前搭车释放，压制独立 Cancel 报文数量
lctl set_param ldlm.namespaces.*.early_lock_cancel=1

# 4. 强制压制客户端最大未激活锁缓存上限 (防止客户端过度贪婪)
lctl set_param ldlm.namespaces.*.max_unused=400
```

---

## 6.7 LDLM 分布式并发控制与调优 Checklist

在超大规模并发集群中，针对 LDLM 锁管理器与意向锁，推荐执行以下工程核查：

- [ ] **未用锁 LRU 缓存深度（max_unused）调优**：
  检查所有客户端与服务端的 `ldlm.namespaces.*.max_unused`。大内存 MDS 节点可设为 100,000 ~ 500,000，维持极高元数据锁缓存命中率；而在多租户客户端上应设置为 400 ~ 1000，防止成千上万节点闲置锁霸占 MDS 内存引发锁收缩风暴。
- [ ] **动态锁加权（SLV / ldlm_pool）健康度**：
  监控 `/proc/fs/lustre/ldlm/services/ldlm_canceld/stats`。若 `recalc` 频次异常偏高，说明服务端锁内存水位线（`pool.granted`）逼近物理告警线，应扩充 MDS 内存或降低客户端的 `max_unused`。
- [ ] **大范围 EXTENT 锁竞争避免（Shared-file Appending）**：
  对于多进程并行追加写同一个共享文件的场景（如 MPI-IO），严禁使用普通 `write()` 盲目扩充锁范围，必须使用 `O_APPEND` 或使用 MPI-IO 独立的非重叠区间偏移，防止全文件 `[0, EOF]` 排他锁引发串行化雪崩。
- [ ] **Glimpse AST 高频开销监控**：
  在海量作业轮询文件大小时（如 `ls -l`），检查是否有大量 `glimpse_ast` 请求打满服务端。高频查询场景推荐在客户端开启用户态缓存或使用 `lfs find` 批量元数据抓取。
- [ ] **意向锁（Intent Lock）网络往返核对**：
  利用 `lctl get_param mdc.*.stats` 核对 `ldlm_intent_enqueue` 与普通 `ldlm_enqueue` 的比值，确保绝大部分文件 lookup、open 与 create 均命中 Intent 1-RTT 合并链路。

---

## 6.8 核心源码对照表

| 核心抽象 / 组件 | 源码文件 | 核心函数 / 数据结构 | 架构功能与生产定位 |
| :--- | :--- | :--- | :--- |
| **锁资源与命名空间** | [`ldlm_resource.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ldlm/ldlm_resource.c) | `struct ldlm_namespace`, `struct ldlm_resource` | 锁的层次化哈希桶、Granted/Waiting 队列管理 |
| **锁申请与入队** | [`ldlm_lockd.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ldlm/ldlm_lockd.c) | `ldlm_cli_enqueue()`, `ldlm_handle_enqueue()` | 客户端发起加锁与服务端冲突判定入口 |
| **范围锁冲突算法** | [`ldlm_extent.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ldlm/ldlm_extent.c) | `ldlm_extent_compat()` | 判定 `[start, end]` 区间是否重叠与模式兼容 |
| **异步 AST 派发** | [`ldlm_lock.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ldlm/ldlm_lock.c) | `ldlm_run_bl_ast()`, `ldlm_run_cp_ast()` | 触发跨网络 Blocking / Completion 异步回调 |
| **动态锁收缩与 LRU** | [`ldlm_pool.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ldlm/ldlm_pool.c) | `ldlm_pool_recalc()`, `ldlm_cancel_unused()` | SLV 锁容量动态加权移动平均与客户端淘汰机制 |
| **意向锁协议解构** | [`lustre_idl.h`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_idl.h) | `struct ldlm_intent`, `enum mds_ibits_locks` | 线路层 Intent 载荷与 IBITS 属性位切分规范 |

---

## 6.8 本章小结与第二部分回顾

在本章中，我们完整揭开了 Lustre 分布式锁管理器（LDLM）的宏大图景：
1. **区间与属性的双重细粒度解耦**：EXTENT 范围锁让超算多进程并行区间写毫无阻塞，IBITS 字段锁让多客户端修改不同属性互不踩踏；
2. **意向锁（Intent Lock）创造了 1-RTT 性能奇迹**：将分布式锁与打开、查询、创建操作强行合一，将传统多轮握手暴力归一；
3. **三大 AST 构筑了自愈的事件神经网**：Blocking 保证安全，Completion 保证异步，Glimpse 则在零打断写并发的同时奉献精准的状态观测；
4. **SLV 与 LRU 实现了弹性锁治理**：在极致缓存命中与有限服务端内存之间达成了高精度的动态动态平衡。

---

### 第二部分（Core Distributed Engine）里程碑总结

随着第四、五、六章的写就，**第二部分：核心分布式引擎：Portal RPC 与分布式锁** 已圆满铸成坚不可摧的整体：
- **第四章（Portal RPC）**：打造了控制流与大块 RDMA 解耦的高性能多 CPT 异步流水线；
- **第五章（AT 与容灾恢复）**：揭示了 Early Reply 免死金牌与断电零丢失的事务/锁重放奇迹；
- **第六章（LDLM 分布式锁）**：奠定了全集群超大规模并发一致性与 1-RTT 意向锁的巅峰性能基石。

有了这套无比强悍的通信与锁引擎，Lustre 是如何在内核对象模型（OBD）上搭建分层软件架构的？
在接下来的 **第三部分：对象存储抽象与核心子系统（OBD Foundation）** 中，我们将深入剖析 Lustre 赖以成名的分层驱动堆栈 —— `obd_device`、`obd_ops`，以及统领万千元数据与数据路由的 **`lu_object` / `dt_device` / `md_device` 现代分层内核模型**！
