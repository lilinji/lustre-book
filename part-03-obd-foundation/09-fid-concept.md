# 第九章：FID 体系与分布式命名空间路由 —— 128 位全局标识符、序列批发器与 OI 物理映射

> “在单机 Linux 系统中，一个 64 位的 inode 编号足以统领单块磁盘上的数亿文件。但在一个横跨数万节点、数十万硬盘、数十亿甚至千亿对象的跨机架分布式存储体系中，简单的 inode 编号必然会遭遇碰撞、归属不清与无法水平扩展的死局。Lustre 首创的 128 位 FID（File Identifier）体系，宛如分布式文件系统的‘IPv6’，不仅赋予了每个文件全局唯一的宇宙坐标，更在零中心化瓶颈的前提下实现了百亿级文件的秒级路由。”

在上一章 [现代对象栈模型](08-lu-object.md) 中，我们理解了复合对象（`lu_object`）如何通过统一头部进行多层抽象。而连接所有复合对象、贯穿客户端与服务端的唯一物理信物，正是 **FID（File Identifier，文件标识符）**。

本章我们将深入剖析：
- 为什么单机 inode 无法在分布式存储中生存？
- 128 位全局唯一信物 [`struct lu_fid`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_user.h#L362) 的物理构成与保留序列宇宙；
- 杜绝全局锁竞争的 **分布式序列分配器（Sequence Controller / Generator）** 批发机制；
- 负责瞬时路由寻址的 **FLD（FID Location Database）**；
- 将虚拟 FID 翻译为本地磁盘物理 inode 的 **OI 表（Object Index Table）**。

---

## 9.1 告别传统 inode 编号：为什么必须引入 128 位 FID？

### 9.1.1 单机 Inode 在分布式环境下的三重死局

```text
+-------------------------------------------------------------------------------+
|                       单机 Inode 在分布式环境下的三重死局                     |
+-------------------------------------------------------------------------------+

1. 编号全局碰撞 (ID Collision):
   MDT0 分配了 inode=10001, MDT1 本地磁盘也分配了 inode=10001!
   客户端同时挂载两台 MDT 时，VFS inode 哈希表立即爆发冲突撕裂!

2. 归属盲区 (Zero Routing Information):
   面对一个单纯的整数 10001，客户端根本无法得知该文件位于 MDT0、MDT1 还是 OST5，
   必须依赖中心目录树一层层递归解析 Lookup，网络往返开销巨大!

3. 条带化物理割裂 (Striping Disconnect):
   一个 10TB 的大文件，元数据在 MDT 上，底层对应 20 个不同 OST 上的数据对象。
   传统 inode 无法在数据分片与元数据母体之间建立确定性的因果数学映射!
```

为此，Lustre 在 2.x 全面弃用了原有的 32/64 位本地 inode 机制，重构了 **128 位全局文件标识符（FID）**。

### 9.1.2 `struct lu_fid` 物理内存解构

查看源码 [`include/uapi/linux/lustre/lustre_user.h`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_user.h#L362-L378)：

```c
struct lu_fid {
	__u64 f_seq;	/* 64 位序列号 (Sequence)：定义物理归属与迁移单元 */
	__u32 f_oid;	/* 32 位对象编号 (Object ID)：Sequence 内部自增索引 */
	__u32 f_ver;	/* 32 位版本号 (Version)：快照版本，或在 OST 上复用为条带索引 */
} __attribute__((packed));
```

```text
+-------------------------------------------------------------------------------+
|                       struct lu_fid 16 字节 (128-bit) 排布                    |
+-------------------------------------------------------------------------------+
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
+                       f_seq (高 64 位序列号)                  +
|                                                               | 0x00 ~ 0x07
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       f_oid (32 位对象 ID)                    | 0x08 ~ 0x0B
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       f_ver / f_stripe_idx (32 位版本/条带索引)| 0x0C ~ 0x0F
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

在日常运维与日志中，一个 FID 通常被表示为标准的括号三元组：**`[seq:oid:ver]`**。
例如：`[0x200000401:0x12:0x0]`。

### 9.1.3 保留序列宇宙：Lustre 的特殊 FID 空间

Lustre 对 64 位的 `f_seq` 空间进行了严密的数学分区（[`include/uapi/linux/lustre/lustre_idl.h:277`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_idl.h#L277)）：

| 序列区间 / 常量 | 宏定义取值 | 核心职责与设计内涵 |
| :--- | :--- | :--- |
| **IGIF 兼容空间** | `[0x0000000c, 0x0ffffffff]` | 兼容 Lustre 1.x：将旧 inode 和 generation 压缩为 FID |
| **IDIF 兼容空间** | `[0x100000000, 0x1ffffffff]` | 兼容旧 OST 对象编号：`0x100000000 + (ost_index << 16)` |
| **普通文件起点** | `FID_SEQ_START = 0x200000000` | 现代 2.x FID 宇宙的分水岭（$2^{33}$ 处） |
| **文件系统根节点** | `FID_SEQ_ROOT = 0x200000007` | 全局唯一的根目录 `/`，固定 FID 为 `[0x200000007:0x1:0x0]` |
| **隐形魔法空间** | `FID_SEQ_DOT_LUSTRE = 0x200000002` | 挂载点根目录下的隐藏管理通道 `.lustre` 目录 |
| **普通用户文件** | `FID_SEQ_NORMAL = 0x200000400` | 所有普通用户创建的文件和目录序列号的分配起始点 |

通过保留序列，Lustre 让“根目录在哪里”、“配置日志在哪里”变成了**数学常量**，任何节点在挂载瞬间无需进行任何网络协商，即可直接硬编码定位根目录。

---

## 9.2 分布式序列分配器：三级无锁批发机制

在一个每秒并发创建数百万个文件的超算集群中，如果每次创建文件都要找同一个中心节点申请下一个递增 ID，系统将在几毫秒内被网络延迟卡死。

Lustre 创造了 **三级序列批发架构（Sequence Allocator）**：

```text
+-------------------------------------------------------------------------------+
|                       FID 三级序列批发机制全景架构                            |
+-------------------------------------------------------------------------------+

               MDT0 (全局 Sequence Controller)
        持有全局 64 位 Sequence 资源池 [0x200000400, 0xFFFFFFFF...]
                                 |
         +-----------------------+-----------------------+
         | (批量批发: 一次批发 1000 万个 Sequence)       |
         v                                               v
    MDT1 Sequence Generator                         MDT2 Sequence Generator
    (在本地拥有独立的 Sequence 仓库)                (在本地拥有独立的 Sequence 仓库)
         |                                               |
         | (本地自增發号)                                | (本地自增發号)
         v                                               v
客户端 A 创建文件: [0x200000401:1:0]            客户端 B 创建文件: [0x200000805:1:0]
客户端 A 创建文件: [0x200000401:2:0]            客户端 B 创建文件: [0x200000805:2:0]
客户端 A 创建文件: [0x200000401:3:0]            客户端 B 创建文件: [0x200000805:3:0]
```

1. **第一级：全局控制器（Sequence Controller）**：
   运行在 MDT0 上。它统领全集群尚未使用的 64 位 Sequence 广袤空间。
2. **第二级：本地生成器（Sequence Generator）**：
   每个 MDT 和 OST 运行一个本地生成器。当本地可用序列不足时，向 MDT0 发送一次微小的 RPC 请求，一次性“批发”一个极大的 Sequence 区间（例如每次批量划拨 $10^6$ 个 Sequence）。
3. **第三级：无锁本地分发**：
   当应用在特定 MDT 上创建文件时，MDT 在当前激活的 Sequence 内部，利用 CPU 原子指令自增 `f_oid`（从 0 一直分配到 $2^{32}-1$，即单序列支持 42 亿个对象）。
   **在此期间，完全零网络通信、零锁竞争，发号性能仅受限于本地 CPU 内存带宽！**

---

## 9.3 路由神经中枢：FLD（FID Location Database）

当客户端拿到了一个 FID（例如从目录项里读出了一个子文件的 FID 为 `[0x200000805:0x12:0]`），客户端如何知道这个文件究竟在 MDT0、MDT1 还是 MDT2 上？

这依靠 **FLD（FID Location Database，FID 定位数据库）**。

```text
+-------------------------------------------------------------------------------+
|                       FLD 范围二分查找与路由判定                              |
+-------------------------------------------------------------------------------+

客户端本地 FLD 缓存 (基于红黑树组织):
+-------------------------------------------------------------------------------+
| Sequence 范围                  | 目标 Target (MDT 编号) | 状态                |
+--------------------------------+------------------------+---------------------+
| [0x200000400 - 0x2000004FF]    | MDT 0                  | Local Cached        |
| [0x200000500 - 0x2000007FF]    | MDT 1                  | Local Cached        |
| [0x200000800 - 0x2000009FF]    | MDT 2                  | Local Cached        |
+-------------------------------------------------------------------------------+
                                 ^
                                 | [待查询 FID: 0x200000805]
                                 | [红黑树二分检索: 落在 [0x200000800 - 0x2000009FF]]
                                 |
                      [判定结论: 立即发往 MDT 2 ! 耗时: 50 纳秒!]
```

- **范围聚合存储**：FLD 不记录单个对象的映射（否则百亿文件会导致 FLD 自身爆仓），而是记录 **Sequence 区间（Range）到 Target Index 的映射**；
- **客户端内存缓存**：客户端在本地维护一颗 FLD 红黑树。当发生缓存未命中时，客户端向服务端发起一次 `FLD_QUERY` RPC，将涵盖该区间的整段 Range 拉取到本地缓存；
- **零中心寻址**：在后续长达数天或数月的运行中，客户端访问该区间内的所有文件，全部在本地内存通过二分查找瞬间完成路由，彻底消除了寻址瓶颈。

---

## 9.4 磁盘物理映射：OI 表（Object Index Table）

虚拟的 FID 最终必须落地在真实的物理介质上。
但底层的 ldiskfs（Ext4）或 ZFS 并不能直接把一个 128 位的结构体当成物理 inode。
**Lustre 本地磁盘驱动（OSD）如何实现 `FID -> 本地物理 Inode` 的超高速转换？**

答案是：**OI 表（Object Index Table）**（[`lustre/osd-ldiskfs/osd_oi.c`](https://github.com/lustre/lustre-release/blob/master/lustre/osd-ldiskfs/osd_oi.c)）。

```text
+-------------------------------------------------------------------------------+
|                       OI 表物理转换与反向指纹校验                             |
+-------------------------------------------------------------------------------+

[上层调用: 访问 FID [0x200000401:0x12:0x0]]
                      |
                      v
1. 计算 FID 的哈希值: h = fid_flatten(fid)
                      |
                      v
2. 查找后端磁盘的隐藏索引目录 /O/oi.16 (内部基于 IAM / B-Tree 索引)
                      |
                      v
3. OI 表直接定位并返回对应的物理 inode 编号: inode = 1245781
                      |
                      v
4. 调用底层 ext4_iget(sb, 1245781) 读出物理 inode 结构
                      |
                      v
5. 反向安全指纹比对:
   检查该物理 inode 的扩展属性: getxattr(trusted.lma)
   - 提取其中的 lma_self_fid
   - 强校验: lma_self_fid 是否严格等于 [0x200000401:0x12:0x0] ?
     [是] -> 安全通过，返回数据!
     [否] -> 检测到磁盘逻辑错乱，报警拦截并提示运行 LFSCK!
```

### 9.4.1 双向防伪：`trusted.lma` 与 `trusted.fid`

在极端异常断电或硬件损坏时，磁盘上的 B-Tree 索引可能发生位翻转。为了绝对防止将错误的文件内容返回给用户，Lustre 在每个物理 inode 的扩展属性（Extended Attribute）中烙印了反向防伪指纹：
- **`trusted.lma`（Lustre Metadata Attributes）**：
  记录该物理 Inode 宣称属于哪一个虚拟 FID（`lma_self_fid`）；
- **`trusted.fid`**：
  在 OST 数据切片上，记录该数据块所属的母体 MDT Inode 的 FID 与条带索引（`f_stripe_idx`）。
通过正向 OI 表与反向 LMA 属性的双向交织校验，构筑了即使物理扇区损坏也绝不发生“串户读取”的铁壁防线。

---

## 9.5 生产实战：FID 序列耗尽、重叠与孤岛危机排查

### 9.5.1 生产事故现场：`-ENOSPC` 诡异报错

某气象预测超算集群，存储阵列物理容量还剩余 40%（数百 TB 空间空闲），但计算节点批量提交任务创建新文件时，所有应用突然抛出严重错误：
```text
mkdir: cannot create directory '/mnt/lustre/run_01': No space left on device
[ 2411.551010] LustreError: 1541:0:(seq_client.c:280:seq_client_alloc_seq()) 
               Can't allocate sequence: rc = -28
```

### 9.5.2 根因调查链条

工程师深入 MDT 服务端排查 `seq` 状态：
```bash
# 查看当前 Sequence Controller 的发号水位
lctl get_param seq.ctl-lustre-MDT0000.*
lctl get_param seq.srv-lustre-MDT0000.*
```

**病灶揭露**：
1. 由于早期历史迁移误操作，MDT0 上记录全局最大序列的元数据日志文件损坏；
2. Sequence Controller 误认为 `0x200000400` 以上的合法序列已经耗尽，拒绝向本地 Generator 批发新的区间；
3. 本地 Generator 没有可用序列，在收到客户端创建请求时直接向 VFS 返回了错误码 `-28`（即 `-ENOSPC`，无空间可用）；
4. **表面上是“磁盘空间满”，物理上是“FID 虚拟序列分配号断流”！**

### 9.5.3 生产抢救与 LFSCK 校验

针对该类由于元数据异常引发的 FID 序列卡死或重叠故障，必须使用 Lustre 专用的在线一致性扫描引擎 **LFSCK（Lustre File System Consistency Checker）** 进行修复：

```bash
# 1. 在线启动 LFSCK 对全集群 FID 布局与 OI 表的一致性校验
lctl lfsck_start -M lustre-MDT0000 -t layout
lctl lfsck_start -M lustre-MDT0000 -t fid_space

# 2. 实时监测 LFSCK 修复进度
lctl lfsck_query -M lustre-MDT0000

# 3. 检查是否有丢失父子引用的孤儿对象 (Orphans)
ls -la /mnt/lustre/.lustre/lost+found
```

LFSCK 会扫描全盘所有的物理 Inode，根据 `trusted.lma` 重新重建底层 OI 索引树，并强制对齐全局 Sequence Controller 的发号水线，使集群起死回生。

---

## 9.6 FID 体系与序列分配调优 Checklist

在维护拥有数十亿文件的超大规模命名空间时，必须严格遵守以下 FID 与序列核查清单：

- [ ] **序列批发步长（Sequence Step）匹配**：
  检查 `/proc/fs/lustre/seq/cli-srv-*/width`。对于小文件高频创建场景，客户端本地 FID 缓存批次推荐设置为 65536 或更大，避免客户端频繁向 MDT 序列控制器发起跨网络序列续约 RPC。
- [ ] **FID 空间溢出风险监控**：
  虽然 64 位 Sequence 极其广袤（哪怕每微秒消耗一个序列也可使用 58 万年），但应定期监控 `lctl get_param seq.ctl-srv-*.space`，确保当前 Sequence 区间正常递增，无回滚或异常跳跃。
- [ ] **FLD 路由缓存命中率监控**：
  监控 `/proc/fs/lustre/fld/cache_hit_ratio`。在启用 DNE 多元数据后，FLD 本地缓存命中率应长期保持在 98% 以上。若命中率跌破 90%，应考虑调大 FLD 缓存大小：`lctl set_param fld.cache_size=65536`。
- [ ] **OI 物理映射表碎片率检查**：
  对于运行超过 3 年的旧集群，MDT 上的 `oi.16` 索引表可能会产生 B-Tree 碎片。在离线维护时应运行带有 OI 检查选项的 `e2fsck`（或 LFSCK），确保 `FID -> i_ino` 物理检索保持在 1~2 次 I/O 的理想效率。
- [ ] **LMA 安全指纹校验防线（trusted.lma）**：
  在底层块设备执行迁移或卷镜像克隆后，必须验证 `trusted.lma` 包含的 FID 与目录项（Directory Entry）中的 FID 严格一致，严禁绕过 Lustre 驱动直接在底层 ext4 使用 `debugfs` 篡改 Inode 属性。

---

## 9.7 核心源码对照表

| 核心实体 / 概念 | 源码位置 | 关键函数 / 数据结构 | 架构功能与生产定位 |
| :--- | :--- | :--- | :--- |
| **FID 结构定义** | [`lustre_user.h`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_user.h) | `struct lu_fid` | 128 位全局物理标识符，集成了 Sequence/OID/Version |
| **保留序列空间** | [`lustre_idl.h`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_idl.h) | `enum fid_seq` | 划分 ROOT、.lustre、IGIF、IDIF 与普通文件序列宇宙 |
| **序列分配中枢** | [`seq_client.c`](https://github.com/lustre/lustre-release/blob/master/lustre/fid/seq_client.c) | `seq_client_alloc_fid()`, `seq_client_alloc_seq()` | 三级批发体系：本地发号、区间向 Controller 申请 |
| **定位数据库** | [`fld_index.c`](https://github.com/lustre/lustre-release/blob/master/lustre/fld/fld_index.c) | `fld_index_lookup()` | 基于红黑树的 `[seq_start, seq_end] -> Target` 纳秒路由 |
| **底层 OI 索引表** | [`osd_oi.c`](https://github.com/lustre/lustre-release/blob/master/lustre/osd-ldiskfs/osd_oi.c) | `osd_oi_lookup()`, `osd_oi_insert()` | 本地 B-Tree 索引，完成 `FID -> 本地 inode` 转换 |
| **安全指纹防伪** | [`osd_handler.c`](https://github.com/lustre/lustre-release/blob/master/lustre/osd-ldiskfs/osd_handler.c) | `trusted.lma`, `trusted.fid` | Inode 扩展属性反向校验，杜绝磁盘索引错乱与串户 |

---

## 9.7 本章小结与第三部分全面回顾

在本章中，我们彻底揭开了 Lustre 路由神经中最核心的秘密：
1. **128 位 FID 彻底打破了单机 inode 的物理壁垒**，赋予了海量对象全网唯一的身份坐标；
2. **三级序列批发架构** 巧妙地将全局分配与本地无锁并发熔于一炉，消除了单点发号性能瓶颈；
3. **FLD 范围映射** 提供了近乎零成本的快速路由查找；
4. **OI 索引表与反向 LMA 指纹** 构筑了虚拟对象与物理磁盘介质之间安全可信的落地桥梁。

---

### 第三部分（OBD & Object Subsystem）里程碑总结

至此，**第三部分：对象存储抽象与核心子系统（OBD Foundation）** 已经完整收官！
- **第七章（OBD 分层）**：剖析了乐高积木式的 `obd_device` 堆叠与现代 XArray 拓扑管理；
- **第八章（现代对象栈）**：解密了 `lu_object` 复合对象、堆上虚拟执行栈（`lu_env`）与两阶段事务契约；
- **第九章（FID 体系）**：展示了 128 位全局标识符与三级序列批发器的无锁高并发图景。

从底层的通信（Part 1）、分布式锁（Part 2）到对象模型（Part 3），我们已经打牢了整座 Lustre 大厦的地基与钢筋骨架！

接下来，我们将正式进入整座系统最惊心动魄的实战业务中心 —— **第四部分：元数据子系统深入剖析（Metadata Subsystem）**！
我们将推开 **MDT 服务端架构、多元数据 DNE 水平扩展、目录哈希路由，以及支持快照与故障审计的变更日志（Changelogs）** 的宏伟之门！
