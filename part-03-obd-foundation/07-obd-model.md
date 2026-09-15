# 第七章：OBD 分层模型与设备生命周期 —— 经典对象驱动、XArray 拓扑与僵尸回收防线

> “在 Linux 内核传统的存储架构中，VFS 之下通常紧接着块设备层（Block Layer），块层以逻辑块寻址（LBA）将磁盘视为扁平的扇区数组。但在一个跨越数千台节点、容纳数百 PB 数据的分布式存储体系中，依然使用块级别抽象将导致元数据与数据路由的彻底失控。Lustre 突破性地构筑了 OBD（Object-Based Device）分层体系，将整个集群抽象为一个由软件对象驱动层层堆叠的虚拟积木城堡。”

在前面两大部分中，我们征服了 [LNet 传输网](../part-01-foundation/02-lnet.md)、[Portal RPC 管道](../part-02-rpc-and-locks/04-portal-rpc.md) 以及 [LDLM 分布式锁](../part-02-rpc-and-locks/06-ldlm-locks.md)。现在，我们将目光聚焦到 Lustre 的软件架构中轴线 —— **OBD（Object-Based Device）分层模型**。

本章我们将深入探索：
- 为什么 Lustre 放弃了传统块设备抽象，选择了对象设备（OBD）？
- 贯穿全局的核心骨架 [`struct obd_device`](https://github.com/lustre/lustre-release/blob/master/lustre/include/obd.h#L698) 与统一函数表 [`struct obd_ops`](https://github.com/lustre/lustre-release/blob/master/lustre/include/obd.h#L1183)；
- 全局设备拓扑的管理演进：从古老数组到 Linux 内核高并发 **XArray（`obd_devs`）**；
- 支撑安全卸载与防止 Use-After-Free 崩溃的 **僵尸对象收割机制（Zombie Culling）**。

---

## 7.1 分层架构演进：从 Linux VFS 到 Lustre 虚拟对象栈

### 7.1.1 块存储（Block）vs 对象存储（OBD）

传统分布式块存储（如 iSCSI、Ceph RBD）暴露给客户端的是一个裸磁盘卷。文件的元数据（inode、目录树）必须在客户端本地文件系统解析，这导致多客户端并发挂载时必须引入昂贵的分布式集群文件系统（如 OCFS2、GFS2）。

Lustre 采纳了 ANSI T10 OSD（Object-Based Storage Device）理念：
- **存储目标不再暴露 LBA 扇区，而是暴露“对象（Object）”**；
- 每个对象拥有唯一的 128 位 ID（FID）、拥有独立的属性（Attributes）和可变长的数据流；
- 底层空间分配、Extent 映射由 OST/MDT 本地文件系统（ldiskfs/ZFS）自理，客户端只负责发出高层次的对象操作。

### 7.1.2 客户端与服务端驱动堆叠全景图

在 Lustre 中，任何一个具体的功能模块（无论是网络客户端、逻辑卷分片器还是本地磁盘驱动）都被包装成一个标准化的 OBD 设备。
它们像积木一样在内核中垂直叠加：

```
+-------------------------------------------------------------------------------+
|                       Lustre 客户端与服务端 OBD 分层堆叠全景                  |
+-------------------------------------------------------------------------------+

[Client Node]                                   [Server Node (MDS / OSS)]
+-----------------------------+
|    POSIX Applications       |
+--------------+--------------+
               | (sys_open / sys_read)
               v
+-----------------------------+
|      Linux Kernel VFS       |
+--------------+--------------+
               |
               v
+-----------------------------+
|    llite (Lustre Lite VFS)  |
+--------------+--------------+
               |
       +-------+-----------------------------+
       | (元数据路径)                         | (数据 IO 路径)
       v                                     v
+---------------+                     +---------------+
|      lmv      | (逻辑元数据卷聚合)   |      lov      | (逻辑对象卷分片)
+-------+-------+                     +-------+-------+
        |                                     |
        v                                     v
+---------------+                     +---------------+
|      mdc      | (元数据客户端驱动)   |      osc      | (对象存储客户端驱动)
+-------+-------+                     +-------+-------+
        | (通过 Portal RPC 打包)               | (通过 Bulk Transfer 封装)
        v                                     v
+---------------+                     +---------------+
|  ptlrpc / LNet|                     |  ptlrpc / LNet|
+-------+-------+                     +-------+-------+
        |                                     |
        ================== 物理高速网络 =======+=========================
        |                                     |
        v                                     v
+---------------+                     +---------------+
|      mdt      | (元数据服务端驱动)   |      ost      | (对象存储服务端驱动)
+-------+-------+                     +-------+-------+
        |                                     |
        v                                     v
+---------------+                     +---------------+
|      mdd      | (元数据核心决策层)   |      osd      | (对象存储底层驱动:
+-------+-------+                     +-------+-------+  osd-ldiskfs / osd-zfs)
        |                                     |
        v                                     v
  [物理元数据盘 SSD/NVMe]               [物理数据阵列 HDD/NVMe]
```

这种模块化设计带来了极强的灵活性：
- 客户端只需面对抽象的 `lov`（Logical Object Volume），由 `lov` 将一个 100GB 的大文件透明条带化打碎成数十个 Extent 分片，分发给底层的几十个 `osc`（Object Storage Client）；
- 上层应用无需感知数据究竟落在哪个 OST 上；
- 在多元数据中心（DNE）架构下，`lmv` 自动根据目录哈希将不同的目录项请求路由到不同的 `mdc`。

---

## 7.2 核心实体解构：`struct obd_device`

在内核内存中，每一个激活的驱动实例都被抽象为一个全局唯一的结构体：[`struct obd_device`](https://github.com/lustre/lustre-release/blob/master/lustre/include/obd.h#L698)。

### 7.2.1 关键字段全景剖析

查看源码 [`lustre/include/obd.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/obd.h#L698-L760)：

```c
struct obd_device {
	struct obd_type		*obd_type;	/* 指向驱动类型 (如 "osc", "mdc", "lov") */
	__u32			 obd_magic;	/* 魔数 0xAB5CD6EF，防内存踩踏 */
	int			 obd_minor;	/* 设备唯一编号，即 lctl dl 中的索引 */
	struct lu_device	*obd_lu_dev;	/* 指向下一代现代 lu_device 模型 */

	struct obd_uuid		 obd_uuid;	/* 设备的全局唯一 UUID 字符串 */
	char			 obd_name[MAX_OBD_NAME]; /* 人类可读名称 (如 lustre-OST0000-osc) */

	/* 保护设备内部状态修改的全局位图与自旋锁 */
	DECLARE_BITMAP(obd_flags, OBDF_NUM_FLAGS);
	spinlock_t		 obd_dev_lock;

	/* 哈希桶与连接链表 */
	struct rhashtable	 obd_uuid_hash;	/* UUID 到 Export 的极速查找哈希 */
	struct rhltable		 obd_nid_hash;	/* 客户端 NID 到 Export 的反查哈希 */
	struct list_head	 obd_exports;	/* 挂载到该设备的所有活跃客户端 Export 链表 */
	struct kref		 obd_refcount;	/* 内核安全引用计数 */

	/* 分布式锁与通信组件 */
	struct ldlm_namespace	*obd_namespace;	/* 该设备独占的 LDLM 锁命名空间 */
	struct ptlrpc_client	 obd_ldlm_client;/* 发往远端锁服务的 RPC 客户端通道 */

	/* 统计与容量缓存 */
	spinlock_t		 obd_osfs_lock;
	struct obd_statfs	 obd_osfs;	/* 磁盘容量、inode 剩余量等缓存 */
	time64_t		 obd_osfs_age;	/* statfs 缓存有效时限 */

	/* 恢复与事务中枢 */
	__u64			 obd_last_committed; /* 服务端已落盘的最高事务序列号 */
	spinlock_t		 obd_recovery_task_lock;
	struct hrtimer		 obd_recovery_timer;
	...
};
```

每个 `obd_device` 既是业务逻辑的执行者，也是状态与连接的容器：
- 它维护了连接到当前节点的所有远端客户端凭证（`obd_exports`）；
- 它内置了独立的锁命名空间（`obd_namespace`），保证锁管理在设备层实现彻底隔离；
- 它记录了该设备相关的事务落盘水线（`obd_last_committed`），为容灾恢复提供核心账本。

### 7.2.2 全局设备拓扑查找：XArray（`obd_devs`）演进

在早期 Lustre 中，系统使用一个固定大小的指针数组 `struct obd_device *obd_devs[MAX_OBD_DEVICES]`（通常最多支持 8,192 个设备）。
在现代超大规模 AI 超算中，一个客户端需要挂载数千个 OST 和数百个 MDT，固定数组不仅浪费内存，更在大规模并发查找时引发了巨大的读写锁竞争。

在最新的 Lustre 架构中，全局设备表彻底升级为 Linux 内核现代的 **XArray 结构**（[`lustre/obdclass/genops.c:29`](https://github.com/lustre/lustre-release/blob/master/lustre/obdclass/genops.c#L29)）：

```c
/* lustre/obdclass/genops.c */
DEFINE_XARRAY_ALLOC(obd_devs);
EXPORT_SYMBOL(obd_devs);
static atomic_t obd_devs_count = ATOMIC_INIT(0);
```

通过基于 RCU（Read-Copy-Update）的无锁 XArray 引擎：
- 查找设备（`class_num2obd(minor)`）只需调用 `xa_load(&obd_devs, dev_no)`，**读操作完全免锁**，在数万线程并发访问时依然保持近乎零时延；
- 分配新设备时调用 `__xa_alloc()` 自动寻找最小空闲次设备号，动态扩展无上限。

我们日常执行的诊断命令 `lctl dl`（Device List），其底层就是遍历该 XArray，将每个槽位中的 `obd_device` 状态与名字输出到控制台：

```bash
# 执行 lctl dl 看到的典型设备拓扑
$ lctl dl
  0 UP osd-ldiskfs lustre-OST0000-osd lustre-OST0000-osd_UUID 5
  1 UP ost ost lustre-OST0000-ost_UUID 5
  2 UP osc lustre-OST0000-osc-ffff8801 lustre-mdt-MDT0000_UUID 5
  3 UP lov lustre-clilv-ffff8801 lustre-clilv-ffff8801_UUID 4
  4 UP llite lustre-clilm-ffff8801 lustre-clilm-ffff8801_UUID 1
```

---

## 7.3 面向对象操作契约：`struct obd_ops`

如果说 `obd_device` 是面向对象中的“类实例”，那么 [`struct obd_ops`](https://github.com/lustre/lustre-release/blob/master/lustre/include/obd.h#L1183) 就是所有对象设备必须实现的“虚函数表（Vtable）”。

任何上层模块想要操作下层模块，**绝不允许直接调用下层模块的具体函数**，必须通过 `obd_ops` 约定的标准化接口。

### 7.3.1 核心方法分类速查

```c
struct obd_ops {
	struct module *o_owner;

	/* 1. 控制与生命周期族 */
	int (*o_iocontrol)(unsigned int cmd, struct obd_export *exp, ...);
	int (*o_connect)(const struct lu_env *env, struct obd_export **exp, ...);
	int (*o_reconnect)(const struct lu_env *env, struct obd_export *exp, ...);
	int (*o_disconnect)(struct obd_export *exp);

	/* 2. 对象属性与状态族 */
	int (*o_statfs)(const struct lu_env *env, struct obd_export *exp, ...);
	int (*o_create)(const struct lu_env *env, struct obd_export *exp, struct obdo *oa);
	int (*o_destroy)(const struct lu_env *env, struct obd_export *exp, struct obdo *oa);
	int (*o_setattr)(const struct lu_env *env, struct obd_export *exp, struct obdo *oa);
	int (*o_getattr)(const struct lu_env *env, struct obd_export *exp, struct obdo *oa);

	/* 3. 分散/聚集大块数据 IO 族 */
	int (*o_preprw)(const struct lu_env *env, int cmd, struct obd_export *exp,
			struct obdo *oa, int objcount, struct obd_ioobj *obj,
			struct niobuf_remote *remote, int *nr_pages,
			struct niobuf_local *local);
	int (*o_commitrw)(const struct lu_env *env, int cmd, struct obd_export *exp,
			  struct obdo *oa, int objcount, struct obd_ioobj *obj,
			  struct niobuf_remote *remote, int pages,
			  struct niobuf_local *local, int rc, int nob, ktime_t kstart);

	/* 4. 容灾与事件通知族 */
	int (*o_import_event)(struct obd_device *obd, struct obd_import *imp,
			      enum obd_import_event);
	int (*o_notify)(struct obd_device *obd, struct obd_device *watched,
			enum obd_notify_event ev);
	int (*o_health_check)(const struct lu_env *env, struct obd_device *obd);
};
```

### 7.3.2 深度拆解：`o_preprw` 与 `o_commitrw` 的物理内涵

在 `obd_ops` 中，最具技术含量的当属大块数据读写（Bulk RW）的二阶段接口：`o_preprw` 与 `o_commitrw`。
它们定义了分布式网络页面与底层物理磁盘块的交汇边界：

```
+-------------------------------------------------------------------------------+
|                       o_preprw 与 o_commitrw 执行时序                         |
+-------------------------------------------------------------------------------+

[客户端发起 4MB 写入请求]
           |
           v
服务端接收到 RPC，调用底层 OSD 驱动:
1. o_preprw (Prepare Read/Write)
   - 在服务端物理内存中分配/锁定待写入的连续物理 Page 数组 (struct niobuf_local)
   - 检查配额与底层文件系统空间预留
   - 将内存页面注册到 LNet，准备迎接网络 RDMA Bulk GET
           |
           v
[LNet 通过 RDMA Read 将 4MB 数据拉取到这些本地页面中]
           |
           v
2. o_commitrw (Commit Read/Write)
   - 启动底层后端文件系统 (ldiskfs JBD2 日志 / ZFS 事务组 TXG)
   - 将这批页面实际提交到存储控制器的 BIO 队列排队刷盘
   - 计算并校验数据 End-to-End Checksum (校验和)
   - 释放本地页面锁定，返回最终写入字节数与事务号
```

这种两阶段设计将 **网络内存准备** 与 **磁盘持久化提交** 严格解耦，使得底层无论挂接的是 EXT4（ldiskfs）还是 ZFS，甚至未来全闪 NVMe 驱动，上层通信协议完全无需修改一行代码！

---

## 7.4 客户端与服务端纽带：`obd_import` 与 `obd_export`

在分布式环境中，单机内的一对指针是无法跨越物理网络的。
为了在物理机之间建立可信、可追踪的会话，Lustre 设计了著名的 **Import-Export 孪生机制**：

```
+-------------------------------------------------------------------------------+
|                       obd_import 与 obd_export 镜像关系                       |
+-------------------------------------------------------------------------------+

       客户端节点 (Client)                              服务端节点 (Server)
+-------------------------------+               +-------------------------------+
|   obd_device (如 osc 驱动)    |               |   obd_device (如 ost 驱动)    |
|               |               |               |               |               |
|               v               |               |               v               |
|        struct obd_import      |               |        struct obd_export      |
|  - 记录远端服务端的 NID       |               |  - 记录连接该端的客户端 NID   |
|  - 维护网络自适应超时 (AT)    |               |  - 维护该客户端持有的锁列表   |
|  - 维护重放队列 (replay_list) | ===== 网络 ==>|  - 维护未提交事务与客户端配额 |
|  - 记录连接代数 (generation)  |               |  - 记录该客户端的最后活跃时间 |
+-------------------------------+               +-------------------------------+
```

- **`struct obd_import`（导入句柄，客户端持有）**：
  客户端“导入”了一个远端服务。它是客户端对服务端状态的全部认知集合，掌管着断网重连状态机、AT 均值与未确认重放队列。
- **`struct obd_export`（导出句柄，服务端持有）**：
  服务端将自身的能力“导出”给了某一个特定的客户端。它是服务端对特定客户端的审计凭证与会话上下文。如果某个客户端长期失联，服务端只需调用 `class_fail_export(exp)`，即可精准斩断该客户端的所有资源而绝不波及他人。

---

## 7.5 生产实战：设备卸载卡死、引用计数泄漏与僵尸收割（Zombie Culling）

### 7.5.1 生产血泪：无法卸载的“D 状态”死锁

在维护生产集群时，系统管理员最常遇到的恐怖场景之一就是：
对一个 Lustre 客户端执行 `umount /mnt/lustre`，终端光标彻底卡死。执行 `ps aux | grep umount`，进程稳稳地处于 `D`（不可中断休眠）状态：

```text
[ 1420.112040] INFO: task umount:5124 blocked for more than 120 seconds.
[ 1420.112088] Call Trace:
[ 1420.112102]  __schedule+0x2d1/0x890
[ 1420.112120]  schedule+0x36/0x80
[ 1420.112134]  obd_zombie_barrier+0x7e/0xa0 [obdclass]
[ 1420.112150]  class_cleanup+0x180/0x240 [obdclass]
[ 1420.112165]  lustre_common_put_super+0x80/0x120 [lustre]
```

### 7.5.2 根因定位：内核引用计数泄漏与安全屏障

## 7.5 真实生产事故复盘：客户端卸载挂死与 obd_zombie_barrier 引用泄漏深渊

### 7.5.1 事故现场：无法自拔的 D 状态进程

某超算集群维护窗口，运维批量执行 `umount -f /mnt/lustre` 时，全场近 300 台计算节点全部陷入 D 状态假死：
```text
# ps aux | grep umount
root  12480  0.0  0.0 108420  1450 ?  D  10:20   0:00 umount -f /mnt/lustre

# cat /proc/12480/stack
[<0>] obd_zombie_barrier+0x8a/0x110 [obdclass]
[<0>] class_detach_disconnect+0x102/0x240 [obdclass]
[<0>] ll_put_super+0x130/0x310 [lustre]
[<0>] generic_shutdown_super+0x72/0x110
[<0>] kill_anon_super+0x14/0x30
[<0>] deactivate_locked_super+0x3b/0x70
[<0>] cleanup_mnt+0x43/0x70
[<0>] sys_umount+0x48/0x90
```

为什么 `umount` 会卡死在 `obd_zombie_barrier()`？
这背后是 Lustre 为防止内核 **Use-After-Free（内存释放后访问导致整机 Panic）** 构筑的最后防线：

1. 当客户端卸载时，需要依次销毁所有的 `osc` 和 `mdc` 设备；
2. 但是，每个设备内部都维护着 `obd_refcount` 引用计数。如果有任何用户态进程仍然打开着文件、或者网络中有尚未收回的孤儿 RPC（Orphan RPC）、或者有锁尚未完成撤销，引用计数就无法归零；
3. 如果此时强行 `kfree(obd)`，一旦后续网卡驱动收到迟到的报文尝试访问该设备指针，Linux 内核就会立即崩溃转储（Kernel Crash Dump）！

### 7.5.2 救赎之路：obd_zombie 异步收割机制

查看源码 [`lustre/obdclass/genops.c:1860-1890`](https://github.com/lustre/lustre-release/blob/master/lustre/obdclass/genops.c#L1860-L1890)：

```c
/* 挂入僵尸链表，交由工作队列异步释放 */
static void obd_zombie_export_add(struct obd_export *exp);
static void obd_zombie_import_add(struct obd_import *imp);

/* 等待所有僵尸 import/export 队列完全清空的安全屏障 */
void obd_zombie_barrier(void)
{
	if (obd_zombie_impexp_cull()) {
		wait_event(obd_zombie_waitq,
			   !obd_zombie_impexp_cull());
	}
}
EXPORT_SYMBOL(obd_zombie_barrier);
```

- 当 `class_disconnect()` 被调用时，Lustre 不会就地同步销毁连接，而是将其移入 `obd_zombie` 僵尸链表；
- 后台内核工作队列 `obd_zombie_exp_cull` 与 `obd_zombie_imp_cull` 异步轮询，只有当所有的底层网络事件彻底注销后才释放内存；
- `obd_zombie_barrier()` 负责卡住主卸载线程，直到所有幽灵引用彻底灰飞烟灭。

**运维排查处方**：
当遇到 `umount` 卡在 `obd_zombie_barrier` 时，千万不要强行重启主机！可以通过以下手段快速找出卡住引用的罪魁祸首：

```bash
# 1. 检查是否有用户进程残留未退出的工作目录或文件描述符
lsof +D /mnt/lustre
fuser -vm /mnt/lustre

# 2. 检查特定设备上仍然持有的活跃 Export 数量与未释放锁
cat /proc/fs/lustre/osc/lustre-OST0000-osc-*/num_exports
cat /proc/fs/lustre/ldlm/namespaces/lustre-OST0000-osc-*/lock_unused_count

# 3. 强制触发客户端失效并强行斩断连接 (慎用: 会导致脏数据丢失)
lctl set_param osc.lustre-OST0000-osc-*.import=deactivate
```

---

## 7.6 OBD 设备生命周期与卸载调优 Checklist

在维护复杂的多 OBD 堆栈或编写底层存储驱动时，必须遵守以下核验准则：

- [ ] **引用计数配对审计（obd_get / obd_put）**：
  任何获取 `struct obd_device` 指针的代码路径，必须严格通过 `class_incref()` 与 `class_decref()` 对称配对。严禁在无持有引用的情况下跨函数调用异步回调。
- [ ] **强行卸载（umount -f）安全前提**：
  执行强制卸载前，先运行 `fuser -km /mnt/lustre` 杀死残留的工作目录进程，防止未写回脏页使引用计数陷入死等。
- [ ] **全局 XArray 设备树容量核查**：
  当集群 OST 数量超过 1,000 个时，确认 `obd_devs` 索引无碎片溢出，检查 `/proc/fs/lustre/devices` 确保每个设备的运行状态（Status）均为 `UP` 而非 `RO` 或 `IN`。
- [ ] **幽灵连接主动剥离（Import Deactivation）**：
  若某台 OSS 彻底物理烧毁无法开机，在客户端卸载卡死时，使用 `lctl set_param osc.*-OSTxxxx-*.import=deactivate` 主动切断死循环等待。

---

## 7.7 核心源码对照表

| 核心抽象 / 结构体 | 源码文件 | 核心函数 / 机制 | 生产定位与架构职责 |
| :--- | :--- | :--- | :--- |
| **设备总纲** | [`obd.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/obd.h) | `struct obd_device` | 经典对象设备容器，集成 UUID、锁、哈希与状态机 |
| **操作契约** | [`obd.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/obd.h) | `struct obd_ops` | 统管生命周期、元数据属性与 `o_preprw` 二阶段 IO |
| **拓扑管理器** | [`genops.c`](https://github.com/lustre/lustre-release/blob/master/lustre/obdclass/genops.c) | `obd_devs` (XArray) | Linux 现代无锁 RCU 全局设备树与动态分配 |
| **配置解析引擎** | [`obd_config.c`](https://github.com/lustre/lustre-release/blob/master/lustre/obdclass/obd_config.c) | `class_config_parse_llog()` | 读取集群 MGS 日志并动态装配 OBD 堆栈积木 |
| **僵尸安全屏障** | [`genops.c`](https://github.com/lustre/lustre-release/blob/master/lustre/obdclass/genops.c) | `obd_zombie_barrier()` | 异步收割幽灵引用，彻底根除 UAF 导致的内核 Panic |
| **连接凭证** | [`obd.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/obd.h) | `struct obd_import` / `obd_export` | 跨网络客户端与服务端孪生会话抽象 |

---

## 7.7 本章小结

在本章中，我们解构了 Lustre 最基础的积木架构 —— OBD 分层模型：
1. **面向对象设备（OBD）取代了传统块设备**，使得存储服务以对象（FID + Extent）为边界实现了彻底解耦；
2. **`obd_device` 与 `obd_ops` 构成了统一契约**，让 `lmv`、`lov`、`osc`、`mdc` 可以像乐高积木一样无缝叠加；
3. **现代 XArray 设备树赋予了集群极高的并发检索性能**，而 `obd_zombie` 屏障则在狂暴的网络波动与动态卸载中坚守着内核内存安全底线。

然而，随着 Lustre 演进至 2.x 时代，传统单一的 `obd_ops` 逐渐显现出历史局限：所有的操作被硬编码在一个扁平的函数表中，难以优雅地支持多元数据分片、数据条带镜像（FLR）与复杂的事务嵌套。
在下一章 [第八章：现代对象栈模型：lu_object、dt_device 与 md_device](08-lu-object.md) 中，我们将探索 Lustre 现代内核重构的巅峰之作 —— **`lu_object` 面向对象分层体系**！
