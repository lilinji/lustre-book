# 第二十章：高可用架构（HA）与故障转移机制 —— 双机共享存储、Pacemaker 调度与秒级无损接管

> “在企业级生产环境中，任何一台服务器的主板电容、内存金手指或电源模块随时可能在深夜烧毁。高可用（High Availability, HA）架构的目的，绝不是寄希望于硬件永远不坏，而是在物理服务器瞬间断电起火的极端灾难下，备用节点能在秒级内斩断脑裂隐患、接管磁盘卷，并引导全网成千上万个客户端完成无损自愈。”

在上一章 [MGS 与动态配置分发](19-mgs-config.md) 中，我们理解了全集群的自举与参数广播。但如果承载核心元数据的 MDS 节点发生物理硬件宕机，整个集群该如何自保？

本章我们将直面企业级 Lustre 的最高防御工程 —— **高可用架构（HA）与故障转移**：
- 双机共享存储拓扑（Dual-Controller SAS / NVMe-oF）与多路径（Multipath）架构；
- 杜绝文件系统永久损坏的绝对死命令：**STONITH / IPMI 硬件隔离机制**；
- 基于 **Pacemaker / Corosync** 的集群仲裁与 Lustre 专用资源代理（`ocf:lustre:LustreTarget`）；
- 结合前文剖析过的事务重放与锁重放，揭秘 **Failover 秒级透明接管的全生命周期时序**；
- 生产环境中由于网络抖动引发“双机互相断电处决（Dual Fence）”的 **灾难复盘与加固军规**。

---

## 20.1 高可用物理基石：共享存储拓扑与多路径

### 20.1.1 为什么是共享存储架构？

很多现代分布式存储（如 Ceph、HDFS）依赖三副本（3-Way Replication）在服务器之间做软件镜像。
但在超算与 AI 基础设施中，存储阵列的裸带宽动辄达到数十甚至数百 GB/s：
- 如果采用纯网络软件三副本，每次写入都需要消耗 3 倍昂贵的 InfiniBand/RoCE 网络带宽，且端到端延迟会被网络多跳大幅劣化；
- Lustre 在服务器端普遍采用成熟的 **双机主备共享存储拓扑（Shared-Storage HA Pair）**：数据依靠底层硬件 RAID 或双活 NVMe 控制器保证介质安全，两台对等的高性能服务器通过冗余总线同时连接同一批物理磁盘柜。

```
+-------------------------------------------------------------------------------+
|                       Lustre 双机共享存储高可用拓扑全景                       |
+-------------------------------------------------------------------------------+

        +-----------------------+               +-----------------------+
        |  MDS 01 (活动主节点)  | <=== 心跳网 == |  MDS 02 (备用接管节点)|
        |  NID: 10.0.0.1@tcp    | <=== (Coro) =>|  NID: 10.0.0.2@tcp    |
        +-----------+-----------+               +-----------+-----------+
                    |                                       |
    [双冗余 SAS 3.0 / PCIe / NVMe-oF 链路]  [双冗余 SAS 3.0 / PCIe / NVMe-oF 链路]
                    |                                       |
                    v                                       v
        +---------------------------------------------------------------+
        |  高密双控全闪 NVMe / SAS 磁盘阵列柜 (JBOD / JBOF)             |
        |  - /dev/mapper/mpath_mdt0 (Lustre MDT 0000 存储卷)            |
        |  - 每一个 LUN 具备全球唯一的 SCSI WWID 标识符                 |
        +---------------------------------------------------------------+
```

### 20.1.2 Linux 多路径（Device Mapper Multipath）绑定

在双机共享拓扑中，每台服务器通常通过双 HBA 卡连接磁盘阵列的 A/B 控制器。在 Linux 内核中，同一块物理磁盘会呈现出多个设备名（如 `/dev/sdb`, `/dev/sdc`, `/dev/sdd`）。
**必须在操作系统层启用 `multipathd`，将多条物理路径聚合成单一高可用的多路径设备：**

```text
# /etc/multipath.conf 生产推荐配置
multipaths {
    multipath {
        wwid                    360002ac0000000000000000a00021301
        alias                   mpath_mdt0
        path_grouping_policy    group_by_prio
        failback                immediate
        no_path_retry           queue
    }
}
```

任何一条光纤被拔掉或控制器抖动，Linux 多路径驱动在底层毫秒级自动切换物理通道，上层 Lustre 完全无感知。

---

## 20.2 脑裂防御的绝对铁律：STONITH 硬件隔离

在双机集群中，存在一个极其恐怖的灾难性场景 —— **脑裂（Split-Brain）**：
- 如果两台主机之间的心跳网线被误拔或交换机断电；
- 主节点其实并没有死，依然在向 `/dev/mapper/mpath_mdt0` 写入数据；
- 备节点以为主节点挂了，强行在本地也执行 `mount /dev/mapper/mpath_mdt0`！
- **两台独立的操作系统同时挂载并写入同一个本地 Ext4/ldiskfs 文件系统！**
- 底层 B-Tree 索引、位图与日志在几秒钟内被互相覆盖踩烂，全盘元数据彻底粉碎，且**物理不可逆**！

### 20.2.1 STONITH 哲学：怀疑即处决

为了彻底从物理定律上杜绝脑裂，企业级 HA 体系强制推行 **STONITH 机制（Shoot The Other Node In The Head，爆掉对方的头）**：

> **“在备机尝试碰触共享存储磁盘之前的第一件事，必须先通过带外硬件通道（IPMI / BMC / Redfish / 智能 PDU 插座），强行切断主机的物理电源，并等待电源完全掉电确认！”**

```
+-------------------------------------------------------------------------------+
|                       STONITH 处决与接管时序                                  |
+-------------------------------------------------------------------------------+

备节点 (MDS 02)                                           主节点 (MDS 01)
      |                                                         |
[心跳检测超时: 疑似主节点宕机!]                                 [可能发生内核 Hang / 假死]
      |                                                         |
      |--- (1) 发起 STONITH 处决指令 ------------------------->| [服务器 BMC/IPMI]
      |    (通过独立带外管理网向 BMC 发送 power off)            | [物理电源被瞬间硬切断!]
      |                                                         | * 彻底断电熄火 *
      |<-- (2) BMC 确认掉电完成 (Chassis Power is Off) ---------|
      |
[绝对安全: 主机已成为物理死尸，绝不可能再次写入磁盘!]
      |
      |--- (3) 备机安全挂载共享磁盘: mount -t lustre /dev/mapper/mpath_mdt0
      |
[启动 Lustre Recovery 模式，接管客户端重放]
```

---

## 20.3 Pacemaker / Corosync 集群中枢集成

在现代化 Linux HA 栈中，**Corosync** 负责节点间心跳探测与 Quorum（法定人数）仲裁；**Pacemaker** 负责资源决策与依赖调度。

### 20.3.1 Lustre 专用资源代理：`ocf:lustre:LustreTarget`

Lustre 官方在源码中提供了标准化的 OCF（Open Cluster Framework）集群资源代理脚本。
管理员通过 `pcs` 命令行将存储卷声明为受控集群资源：

```bash
# 1. 配置 IPMI 硬件 Fencing 隔离设备
pcs stonith create fence_mds01 fence_ipmilan \
    ipaddr="192.168.100.11" login="admin" passwd="password" \
    lanplus=1 pcmk_host_list="mds01"
pcs stonith create fence_mds02 fence_ipmilan \
    ipaddr="192.168.100.12" login="admin" passwd="password" \
    lanplus=1 pcmk_host_list="mds02"

# 2. 创建 MDT0000 存储资源
pcs resource create mdt0000 ocf:lustre:LustreTarget \
    target="/dev/mapper/mpath_mdt0" \
    mountpoint="/mnt/mdt0" \
    op monitor interval=5s timeout=20s

# 3. 配置资源位置倾向与约束 (默认优先跑在 mds01 上)
pcs constraint location mdt0000 prefers mds01=100
```

---

## 20.4 故障转移（Failover）全生命周期时序

当主节点 MDS 01 发生硬件故障时，全网客户端、备用节点与共享磁盘之间展开了一场教科书级的毫秒级接力自愈：

```
+-------------------------------------------------------------------------------+
|                       Lustre 透明故障转移 (Failover) 完整生命周期             |
+-------------------------------------------------------------------------------+

Client 1000台计算节点             MDS 01 (主)        MDS 02 (备)       磁盘柜
       |                              |                  |               |
[正常并发读写]                         |                  |               |
       |                              | * 硬件冒烟起火!* |               |
[RPC 超时未回包]                      * 物理暴毙 *       |               |
       |                                                 |               |
       |                                     [Corosync 探测到心跳丢失]   |
       |                                     [触发 STONITH 硬切断主节点] |
       |                                                 |               |
       |                                                 |--- 挂载磁盘 ->|
       |                                                 |<-- 挂载完成 --|
       |                                                 |               |
       |                                     [MDT 启动并进入 RECOVERY 状态]
       |                                     [向网络宣告自己接管了 MDT 0000]
       |                                                 |
[客户端发现主节点失联]                                   |
[触发 obd_import 状态机: DISCON]                         |
[遍历 imp_conn_list，切换到备机 NID 10.0.0.2]            |
       |                                                 |
       |=== (1) 向备节点发起重连 (MSG_CONNECT_RECOVERING) =======>|
       |                                                 |
       |=== (2) 启动事务重放 (Transaction Replay) =======>| [重建未落盘事务]
       |                                                 |
       |=== (3) 启动锁重放 (Lock Replay) ================>| [重建内存分布式锁]
       |                                                 |
       |<== (4) 恢复窗口结束，全网解除 RECOVERY 锁定 ============|
       |                                                 |
[计算节点的 Python / C++ 进程毫无感知，继续满速运行!]
```

**自愈的核心奇迹**：
依托前文剖析过的 [第五章：自适应超时与事务/锁重放](../part-02-rpc-and-locks/05-recovery-at.md)，整台服务器的物理毁灭，在客户端应用看来仅仅是一次长达十几秒的“慢 IO”。**没有任何应用程序崩溃，没有产生任何文件系统脏数据，零丢失完美接管！**

---

## 20.5 真实生产事故复盘：双机心跳闪断引发双重处决 (Dual STONITH) 同归于尽惨案

### 20.5.1 现场灾难复盘：双机同时黑屏关机

某国家级超算中心，主备 MDS 服务器突然在半夜双双关机下线。
机房运维赶到现场，发现两台物理机完全处于 Power Off 状态。手动开机后，查看 Pacemaker 日志：
```text
[ 2104.112001] pacemaker-fenced: Node mds01: Peer mds02 heartbeats lost, requesting STONITH!
[ 2104.112015] pacemaker-fenced: Node mds02: Peer mds01 heartbeats lost, requesting STONITH!
[ 2104.112100] fence_ipmilan: Successfully sent 'chassis power off' to mds02
[ 2104.112110] fence_ipmilan: Successfully sent 'chassis power off' to mds01
```
**双机在同一秒钟内，利用 IPMI 把对方给活生生处决了（Mutual Suicide）！**

### 20.5.2 根因定位分析

1. **单心跳网络脆弱性**：
   该集群的 Corosync 心跳仅配置了一条网线，并与高流量的业务管理网混用；
2. **瞬时微突发（Microburst）拥塞**：
   夜间备份脚本突然产生大流量打满交换机端口，导致心跳报文连续丢失 3 秒；
3. **缺少仲裁见证人（Quorum Tie-breaker）**：
   双节点集群各持 1 票，在心跳断开后各自认为自己处于多数派（1 票对 1 票）；
4. **缺少 Fencing 延迟惩罚（Fencing Delay）**：
   两台主机同时以绝对相同的时机向对方的 IPMI 发起断电指令，双双同归于尽。

### 20.5.3 架构加固钢铁四法则

为了绝对杜绝双机互杀，生产 HA 配置必须强制执行以下加固：

```bash
# 加固法则 1: 配置双独立物理心跳网卡 (绑定不同物理网口与独立直连线)
# corosync.conf 中配置两个独立 interface (rrp_mode: passive 或 active)

# 加固法则 2: 引入第三方 QNet 仲裁守护进程 (QDevice 见证节点)
# 让双节点集群拥有第三票，断网时唯有拿到仲裁票的节点有权执行 Fencing!
pcs quorum device add model net host=192.168.100.200 algorithm=ffsplit

# 加固法则 3: 配置 Fencing 延迟惩罚 (错开处决时间差)
# 让优先级最高的主节点延迟 0 秒处决，备用节点强制延迟 15 秒处决!
# 如果主节点存活，它会率先干掉备机，避免同归于尽!
pcs stonith update fence_mds01 pcmk_delay_base=0s
pcs stonith update fence_mds02 pcmk_delay_base=15s

# 加固法则 4: 调宽 Corosync 心跳超时时间 (容忍网络微突发)
# token 超时从默认 1000ms 调至 5000ms
pcs cluster update corosync_token=5000
```

---

## 20.6 高可用架构与故障转移调优 Checklist

| 检查维度 | 核心核查项 | 推荐生产设定 / 阈值 | 风险偏离后果 |
| :--- | :--- | :--- | :--- |
| **心跳冗余** | 双独立网络路径 | 独立交换机 + 背对背直连心跳 | 交换机故障导致集群全网脑裂 |
| **仲裁隔离** | 第三方仲裁见证 | `corosync-qnet` / `qdevice` 部署 | 双节点等额对峙导致无解僵死 |
| **处决延迟** | STONITH 差异化延迟 | 主机 `pcmk_delay_base=0s`, 备机 `15s` | 心跳抖动时双机同时处决殉爆 |
| **多路径聚合** | multipath 故障挂起 | `no_path_retry queue` / `failback immediate` | 光纤单跳切换时应用收到 EIO 崩溃 |
| **恢复超时** | 自适应超时与恢复窗口 | `obd_recovery_timeout=300`, `at_min=20` | 客户端超时过短提早放弃重连 |
| **资源约束** | 存储与文件系统共置 | `colocation` + `order` 约束强制绑定 | 存储卷未挂载就启动 Lustre 导致损坏 |

---

## 20.7 核心源码与配置对照表

| 核心抽象 / 组件 | 源码 / 配置文件 | 关键参数 / 函数 | 架构功能与生产定位 |
| :--- | :--- | :--- | :--- |
| **Failover 节点声明** | [`lustre_param.h`](https://github.com/lustre/lustre-release/blob/master/include/uapi/linux/lustre/lustre_param.h) | `PARAM_FAILNODE`, `failover.node` | 在超级块中注册备机 NID，下发给客户端连接池 |
| **客户端切换中枢** | [`import.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ptlrpc/import.c) | `imp_conn_list`, `ptlrpc_set_import_discon()` | 检测主节点断开并无缝轮换到备机发起重连 |
| **HA 恢复追踪** | [`obd_config.c`](https://github.com/lustre/lustre-release/blob/master/lustre/obdclass/obd_config.c) | `obd_recovery_start`, `obd_recovery_timeout` | 统计接管恢复窗口时间并协调各客户端重放 |
| **集群资源代理** | `LustreTarget` (OCF 脚本) | `start()`, `stop()`, `monitor()` | Pacemaker 驱动挂载、健康检查与安全卸载的封装 |
| **多路径聚合** | `/etc/multipath.conf` | `no_path_retry queue` | 屏蔽光纤或存储控制器单点故障，提供高可用 LUN |

---

## 20.8 本章小结

在本章中，我们解密了企业级存储高可用的最高防线：
1. **双机共享存储架构** 兼顾了超高带宽、微秒级延迟与经济高效的硬件成本；
2. **STONITH 硬件处决机制** 以冷酷但绝对可靠的物理掉电，彻底粉碎了脑裂破坏文件系统的可能；
3. **Pacemaker 与 Lustre 资源代理** 实现了对网络、存储与进程状态的全自动智能守护；
4. **两阶段无损故障转移（Failover）** 完备衔接了从硬件宕机到客户端透明重放的全链路生命周期。

然而，在成百上千台服务器构筑的浩瀚系统里，如果无法精确洞察系统的内部脉搏，系统管理员就像在黑夜中盲人骑瞎马。
在下一章 [第二十一章：性能监控、指标度量与可观测性体系](21-monitoring-observability.md) 中，我们将探索 Lustre 极其深邃的度量视窗 —— **lprocfs 统计内核、SLURM 作业级追踪（`job_stats`）、BRW 延迟直方图以及 Prometheus/Grafana 全景观测大盘**！
