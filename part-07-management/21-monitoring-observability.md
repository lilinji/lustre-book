# 第二十一章：性能监控、指标度量与可观测性体系 —— lprocfs 统计内核、Jobstats 作业追踪与 Prometheus 全景观测

> “管理一个拥有数万节点、数十万硬盘的分布式超级存储集群，就像驾驶一架超音速超重型客机。如果仪表盘反应迟钝、或者无法穿透到单个作业与物理磁盘的微观切面，哪怕一颗小小的慢盘螺丝钉松动，都足以让整架飞机在万米高空失速下坠。Lustre 拥有分布式存储领域最精细的内核级度量雷达，为性能调优与故障定位提供了纳秒级的显微镜。”

在前面的章节中，我们解密了 [MGS 动态配置](19-mgs-config.md) 与 [双机高可用 HA 架构](20-high-availability.md)。本章我们将进入第七部分的收官之作 —— **性能监控、指标度量与可观测性体系（Observability）**。

我们将从源码到工业实践全面拆解：
- 基于每 CPU 无锁计数器的 **`lprocfs_status` 内核统计引擎**；
- 超算与 AI 集群精准归因的核武 —— **Jobstats 作业级多维审计**；
- 洞悉物理磁盘真实读写质感的 **BRW Stats（大块读写直方图）**；
- 对接现代云原生体系的 **Prometheus + Grafana 监控大盘搭建实战**；
- 生产环境中利用度量数据在几分钟内揪出“慢盘害群之马（Straggler）”的 **实战排查秘籍**。

---

## 21.1 可观测性基石：Lustre 内核度量视窗

在 Linux 内核中，如果频繁执行原子操作（`atomic_inc`）来记录每一次读写或 RPC 调用，CPU 核心间的总线缓存行反弹（Cacheline Bouncing）会吃掉高达 30% 的算力。

Lustre 研发了极度轻量的 **`lprocfs_status` 内核度量引擎**（[`lustre/obdclass/lprocfs_status.c`](https://github.com/lustre/lustre-release/blob/master/lustre/obdclass/lprocfs_status.c)）：
- **Per-CPU 无锁计数器**：每个 CPU 核心在自己的本地内存中无锁自增统计值，完全零总线锁竞争；
- **读取时聚合**：只有当外部运维工具（如 `lctl` 或 Prometheus Exporter）读取文件时，内核才瞬时累加所有核心的数值；
- **双重视窗与 YAML 原生输出**：历史接口位于 `/proc/fs/lustre/`，现代标准逐步对齐到 `/sys/fs/lustre/`，原生支持标准 YAML 结构化输出（`lctl get_param -F yaml`）。

---

## 21.2 超算级归因利器：Jobstats 作业级精细化追踪

在拥有成千上万个并发训练任务的超算或 AI 智算中心，管理员最常面对的绝望场景是：
**“存储集群整体 IOPS 突然暴涨到极限，到底是哪个用户的哪个脚本在疯狂狂刷存储？”**
在传统文件系统中，由于所有客户端流量汇聚到服务端后只剩下了裸 NID，管理员只能像大海捞针一样一台台机器去 `top` 抓进程。

Lustre 在内核中首创了 **Jobstats（作业级度量引擎）**（[`lustre/obdclass/lprocfs_jobstats.c`](https://github.com/lustre/lustre-release/blob/master/lustre/obdclass/lprocfs_jobstats.c)）！

```text
+-------------------------------------------------------------------------------+
|                       Jobstats 作业级全链路透传与审计全景                     |
+-------------------------------------------------------------------------------+

[计算节点: 调度系统启动任务]
SLURM: export SLURM_JOB_ID="job_98412"
Kubernetes: export POD_NAME="llama3-worker-0"
               |
               v
[客户端发起 VFS 读写与元数据调用]
llite 自动提取环境变量中的 JobID，注入每个 RPC 报文的 ptlrpc_body.pb_jobid!
               |
               v (飞越物理网络)
[服务端 MDT / OST 接收 RPC]
OFD / MDT 在两阶段事务中，调用:
lprocfs_job_stats_log(obd, jobid, opcode, amount);
               |
               v
[服务端按 JobID 聚合生成实时 YAML 账单!]
```

### 21.2.1 `job_stats` YAML 剖析实战

在任意一个 OST 或 MDT 上执行：
```bash
lctl get_param -F yaml obdfilter.lustre-OST0000.job_stats
```
控制台将输出极其精美、分作业归因的实时度量：

```yaml
job_stats:
- job_id:          slurm.98412
  snapshot_time:   1773712001
  read_bytes:      { samples: 10240, min: 4096, max: 4194304, sum: 42949672960 }
  write_bytes:     { samples: 51200, min: 4096, max: 4194304, sum: 214748364800 }
  getattr:         { samples: 120 }
  setattr:         { samples: 0 }
  punch:           { samples: 4 }
  sync:            { samples: 12 }
- job_id:          slurm.98415
  snapshot_time:   1773712001
  read_bytes:      { samples: 2, min: 1024, max: 2048, sum: 3072 }
  ...
```

管理员一眼就能看穿：**作业 `98412` 在几分钟内刷了 200GB 数据，正是挤爆存储的罪魁祸首！**

---

## 21.3 物理 IO 显微镜：BRW Stats（大块读写直方图）

衡量底层磁盘阵列健康状况与上层应用 IO 质量的最强工具，莫过于 **`brw_stats`（Block Read/Write Stats）**。

在 OST 节点执行：
```bash
lctl get_param obdfilter.lustre-OST0000.brw_stats
```
它输出了物理 IO 的多维统计直方图：

```text
# 1. IO 大小分布直方图 (pages per bulk rpc):
pages per bulk rpc     read               write
4K:                  0   0%   0%        1200  10%  10%  |***
8K:                  0   0%   0%         800   6%  16%  |**
64K:                 4   1%   1%         400   3%  19%  |*
1M:                120  20%  21%        1500  12%  31%  |****
4M:                450  79% 100%        8500  69% 100%  |*********************

# 2. 物理磁盘连续性 (discontiguous blocks):
discontig blocks       read               write
0:                 570  99%  99%       11200  90%  90%  |****************************
1:                   4   1% 100%        1000   8%  98%  |**
>2:                  0   0% 100%         200   2% 100%  |*

# 3. 磁盘物理落盘耗时直方图 (disk I/O latency in ms):
disk I/O time          read               write
< 1ms:             500  87%  87%        9800  79%  79%  |************************
1-4ms:              60  10%  97%        2100  17%  96%  |*****
4-16ms:             14   3% 100%         450   3%  99%  |*
> 100ms:             0   0% 100%          50   1% 100%  |
```

**直方图诊断秘籍**：
- 如果 `4M` 占比超过 70%，且 `discontig blocks` 几乎全为 0，说明上层在执行完美的超大块连续顺序写入，系统处于巅峰性能区间；
- 如果 `4K` 占比高达 80% 以上，说明应用程序存在极其恶劣的小碎片写反模式；
- 如果 `disk I/O time` 中 `> 100ms` 的比例突然上升，说明底层某块物理磁盘发生了慢道或阵列卡电池故障！

---

## 21.4 云原生监控大盘：Prometheus + Grafana 实战

现代数据中心普遍采用 Prometheus 抓取度量指标并由 Grafana 统一大屏展示。

```text
+-------------------------------------------------------------------------------+
|                       Lustre 云原生可观测性架构全景                           |
+-------------------------------------------------------------------------------+

[Lustre 集群节点]
  MDS 节点 (/sys/fs/lustre) ===> [lustre_exporter] :9169
  OSS 节点 (/sys/fs/lustre) ===> [lustre_exporter] :9169 === (HTTP Pull) ===> [Prometheus Server]
  Client 节点 (/sys/fs/lustre)=> [lustre_exporter] :9169                              |
                                                                                      v
                                                                             [Grafana Dashboard]
                                                                             - 集群总吞吐 (GB/s)
                                                                             - 元数据总 IOPS
                                                                             - 各 OST 剩余容量预警
                                                                             - 慢节点延迟热力图
```

### 21.4.1 生产级核心监控指标告警规则（PromQL）

```yaml
# 1. 监控 OST 物理剩余容量低于 10% (阻击 Grant 空间耗尽危机)
- alert: LustreOSTSpaceLow
  expr: (lustre_kbytesfree / lustre_kbytestotal) < 0.10
  for: 5m
  labels: { severity: warning }
  annotations:
    summary: "OST {{ $labels.target }} 剩余空间低于 10%!"

# 2. 监控客户端飞行脏页堆积 (捕获客户端下刷卡顿)
- alert: LustreClientDirtyHigh
  expr: lustre_cur_dirty_bytes > 500000000
  for: 2m
  labels: { severity: critical }
  annotations:
    summary: "客户端 {{ $labels.instance }} 脏页堆积突破 500MB，可能发生写卡死!"

# 3. 监控服务端 RPC 处理慢请求 (告警慢盘与网络拥塞)
- alert: LustreSlowRPCDetected
  expr: rate(lustre_slow_rpc_total[1m]) > 10
  for: 1m
  labels: { severity: critical }
  annotations:
    summary: "Target {{ $labels.target }} 出现每秒超 10 次的严重慢 RPC 延迟!"
```

---

## 21.5 生产实战：利用可观测性分钟级揪出“木桶慢节点（Straggler）”

### 21.5.1 生产故障现场：神秘的周期性吞吐暴跌

某万卡 GPU 算力中心，全集群分布式训练时，每隔 15 分钟聚合吞吐就会从正常的 120GB/s 暴跌至不到 2GB/s，持续数分钟后又自动恢复。
计算任务频繁报超时，运维团队面临巨大排查压力。

### 21.5.2 诊断与定位工作流

工程师登录 Grafana 查看全集群热力图，并在 OSS 节点利用命令行追踪：

```bash
# 步骤 1: 一键拉取所有 OST 的实时服务延迟排队
lctl get_param ost.OSS.ost_io.req_waittime

# 步骤 2: 检查各 OST 的 BRW 延迟分布 (寻找超过 500ms 的长尾)
for d in /proc/fs/lustre/obdfilter/lustre-OST*; do
    slow_io=$(awk '/disk I\/O time/,0' $d/brw_stats | grep "> 100ms" | awk '{print $2}')
    if [ "$slow_io" -gt 100 ]; then
        echo "ALERT: 发现慢 OST 节点: $d (长尾 IO 达 $slow_io 次!)"
    fi
done

# 控制台瞬间锁定了真凶:
# ALERT: 发现慢 OST 节点: /proc/fs/lustre/obdfilter/lustre-OST001c (长尾 IO 达 12450 次!)
```

### 21.5.3 破案与处理

- 深入 OST001c 所在的底层物理阵列，`smartctl` 发现其底层 RAID 卡的一块 SAS 机械盘发生了密集的 **物理扇区重新映射（Reallocated Sectors）**；
- 每次写到该坏道时，硬盘固件陷入长达数十秒的内部重试；
- 整个训练任务由于采用条带化写入，**所有计算节点都在同步等待这块慢盘写入完成**，直接被拖下悬崖！
- **处理动作**：立即执行 `lctl --device lustre-OST001c-osc-* deactivate` 临时剔除该 OST，全集群吞吐瞬间秒级恢复 120GB/s 满血状态！

---

## 21.6 生产监控指标采集与告警 Checklist

在构建大规模存储监控大盘与告警规则时，必须落实以下关键指标采集与告警阈值配置：

- [ ] **Jobstats 作业溯源开启**：
  在集群全局设置 `lctl conf_param *.sys.jobid_var=SLURM_JOB_ID`（或 `PBS_JOBID`），确认 MDS 与 OSS 的 `job_stats` 文件能按作业输出读写量与元数据吞吐，为多租户争抢提供追责凭据。
- [ ] **Prometheus 采样频率与内核开销控制**：
  使用 `lustre_exporter` 采集 `/proc/fs/lustre/` 时，采样间隔建议配置为 15 秒 ~ 30 秒；严禁配置为 1 秒极高频采样，避免用户态频繁遍历数百个文件造成轻微上下文切换损耗。
- [ ] **物理 IO 延时直方图（brw_stats）长尾告警**：
  设置自动脚本轮询各 OST 的 `brw_stats`。当超过 1,000ms（1秒）的长尾 IO 占比突破总请求的 0.1% 时，立即标记该 OST 为疑似亚健康慢盘并发出黄色预警。
- [ ] **MDT 意向锁等待深度指标（waiting_locks）**：
  监控 `ldlm.namespaces.MDT*.waiting_locks`。若该数值持续突破 500，表明元数据热点或锁争用严重，通常预示着即将发生客户端 RPC 超时。
- [ ] **网络重试与丢包指标（LNet Drop/Retry）**：
  监控 `lnet.peers.*.health_value` 与各节点的网络丢包计数，将健康分低于 500 的节点自动告警并触发网络拓扑核查。

---

## 21.7 核心源码对照表

| 核心抽象 / 模块 | 源码位置 | 关键结构体 / 函数 | 架构功能与生产定位 |
| :--- | :--- | :--- | :--- |
| **度量内核中枢** | [`lprocfs_status.c`](https://github.com/lustre/lustre-release/blob/master/lustre/obdclass/lprocfs_status.c) | `struct lprocfs_stats`, `lprocfs_counter` | 基于 Per-CPU 无锁计数器的极轻量内核统计框架 |
| **作业级度量** | [`lprocfs_jobstats.c`](https://github.com/lustre/lustre-release/blob/master/lustre/obdclass/lprocfs_jobstats.c) | `lprocfs_job_stats_log()`, `struct obd_job_stats` | 透传 JobID，按作业生成读写与元数据 YAML 账单 |
| **物理 IO 直方图** | [`lproc_ofd.c`](https://github.com/lustre/lustre-release/blob/master/lustre/ofd/lproc_ofd.c) | `ofd_brw_stats_read()` | 统计 4KB~4MB 块大小、磁盘连续性与落盘时延直方图 |
| **客户端读写洞察** | [`lproc_llite.c`](https://github.com/lustre/lustre-release/blob/master/lustre/llite/lproc_llite.c) | `llite_read_ahead_stats` | 客户端 PageCache 命中率、预读效果与脏页水位导出 |
| **参数格式化** | [`lprocfs_status.h`](https://github.com/lustre/lustre-release/blob/master/lustre/include/lprocfs_status.h) | `LPROCFS_YAML` | 统一驱动 `/sys/fs/lustre/` 现代结构化指标输出 |

---

## 21.7 本章小结与第七部分全面回顾

在本章中，我们点亮了 Lustre 全球分布式体系的可观测性灯塔：
1. **`lprocfs_status` 无锁内核度量** 保证了监控采样本身对极限高并发业务的绝对零侵扰；
2. **Jobstats 作业级追踪** 打通了从上层超算调度器到最底层磁盘 IO 的因果追溯链；
3. **BRW Stats 直方图** 赋予了系统洞察物理磁盘微观读写质感的显微镜；
4. **Prometheus + Grafana 现代观测大盘** 与慢节点诊断军规，为万卡集群提供了分钟级故障定位的终极底气。

---

### 第七部分（Management & High Availability）里程碑回顾

至此，**第七部分：系统管理、配置与高可用** 全部三章圆满构筑完成：
- **第十九章（MGS 与配置分发）**：解密了全集群启动自举因果链、LLOG 配置日志与 `lctl conf_param` 毫秒级参数全局广播；
- **第二十章（高可用 HA 架构）**：拆解了双机共享存储拓扑、冷酷高效的 STONITH 硬件处决与两阶段透明重放自愈；
- **第二十一章（可观测性体系）**：展示了 Jobstats 归因、BRW 直方图与云原生 Prometheus 监控的全景图景。

现在，整座 Lustre 大厦的架构原理、核心通信、锁机制、元数据、数据存储、客户端以及高可用已经全面贯通！
在接下来的终篇 —— **第八部分：工业级生产实战与前沿演进（Production Engineering & Frontiers）** 中，我们将把所有理论知识熔铸进血与火的工业实战场地：**全栈性能调优黑魔法、真实灾难排查应急手册，以及面向 AI/GPU 时代的最前沿演进（DAOS 对比、GDS 直连与异构算力融合）**！
