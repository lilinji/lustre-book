# Lustre 权威技术资料库解构与 Markdown 图文知识库

> 本目录为 `book/` 目录下 5 份核心官方文献与白皮书的全面结构化解构成果（Markdown 源码 + 高清图表资源库）。

---

## 目录结构索引

```
book/extracted/
├── README.md                                # 本总览导引与章节映射全景表
├── 01_understanding_lustre_internals/        # 《Understanding Lustre Internals》解构库
│   ├── understanding_lustre_internals.md    # 完整 62 页图文 Markdown（8 个技术大章）
│   └── images/                              # 17 幅矢量拓扑与状态机高清切图（fig_01 ~ fig_17）
├── 02_lustre_architecture_v4/                # 《Lustre Architecture v4》解构库
│   ├── lustre_architecture_v4.md            # 完整 37 页架构白皮书图文 Markdown
│   └── images/                              # 11 幅核心架构拓扑图（arch_01 ~ arch_11）
├── 03_roadmap_2019/                         # 《Lustre Roadmap 2019》解构库
│   ├── roadmap_2019.md                      # 15 页社区演进路线演练图文
│   └── images/                              # 15 页全高清幻灯片（slide_01 ~ slide_15）
├── 04_feature_development_challenges/       # 《Lustre Under New Challenges》解构库
│   ├── feature_development_challenges.md    # 18 页现代硬件挑战与架构演进图文
│   └── images/                              # 18 页全高清幻灯片（slide_01 ~ slide_18）
└── 05_lustre_manual_cn/                     # 《Lustre 官方中文操作手册》（626页）解构库
    ├── 00_manual_toc_and_overview.md        # 全书 45 章、772 个小节层级完整树状大纲
    ├── 01_architecture_and_components.md    # 第 1~4 章：基础架构与组件模型
    ├── 02_hardware_and_installation.md      # 第 5~10 章：硬件规划与安装配置
    ├── 03_operations_and_maintenance.md     # 第 11~18 章：集群运维管理与灾备
    ├── 04_striping_pfl_dom.md               # 第 19~21 章：条带化、PFL 与 MDT 数据内嵌 DoM
    ├── 05_flr_redundancy.md                 # 第 22 章：文件级冗余 FLR 镜像机制
    ├── 06_management_ha_pcc.md              # 第 23~27 章：存储管理、高可用与持久客户端缓存 PCC
    ├── 07_security_nodemap.md               # 第 28~31 章：安全体系（Nodemap、SSK、ACL、快照）
    ├── 08_tuning_benchmarks_nrs.md          # 第 32~34, 39 章：性能调优、基准测试与 NRS 调度
    ├── 09_troubleshooting_lfsck_recovery.md # 第 35~38 章：故障排查、LFSCK 在线修复与恢复
    ├── 10_cli_tools_llapi.md                # 第 40~45 章：命令行工具集与 C 语言接口 llapi
    └── images/                              # 30 幅官方原版高清架构拓扑与流程图
```

---

## 图像资产总表（共计 91 幅独立高清工程图表）

| 资料分类 | 图片数量 | 典型图表内容 |
| :--- | :--- | :--- |
| **01 Internals** | 17 张 | 集群组件（fig_01）、RAID0 条带化（fig_02）、FID 与 Layout EA（fig_03）、软件栈（fig_04）、客户端 I/O 请求流（fig_05）、obdclass 通信（fig_06-07）、MGC 生命周期与装配（fig_08-11）、class_attach/setup/cleanup 状态机（fig_12-15）、Import/Export 管道（fig_16-17） |
| **02 Architecture v4** | 11 张 | 系统总架构（arch_01）、分布式对象存储模型（arch_02）、集群组件构成（arch_03）、Multi-Rail 与路由（arch_04）、HSM 分层存储（arch_05）、CTDB 集群网关（arch_06）、MDS 高可用设计（arch_07）、OSS 高可用双活设计（arch_08）、VFS 装配栈（arch_09）、客户端读写流水线（arch_10）、跨 OST 条带化（arch_11） |
| **03 Roadmap 2019** | 15 张 | 社区协作版图、DNE3 演进、FLR 镜像与自愈、PCC 客户端持久缓存、Multi-Rail 健康打分路由、IPv6 支持与未来规划 |
| **04 Challenges** | 18 张 | AI 与深度学习 I/O 挑战、Flash/NVMe 阶梯层、FLR 性能数据、Data-on-MDT (DoM) 基准、Multi-Rail Auto-selection、未来用户态 Lustre 与 GDS |
| **05 Manual CN** | 30 张 | 基础组件拓扑（p036）、大规模集群架构（p038）、MDS/OSS 故障切换（p040）、双活共享存储拓扑（p041）、Multi-Rail 与动态路由（p047-048, p167）、PFL 渐进布局（p204-220）、自扩展布局 SEL（p228-237）、外部布局（p240-241）、DoM 小文件内嵌（p248）、FLR 镜像（p258）、HSM 数据流（p310）、PCC 架构（p317）、NRS 请求调度（p423）、LNet C-API 模块（p608） |

---

## 与主书 24 章内容深度融合映射表

| 书籍分卷与章节 | 重点吸收的解构材料与图表引用 |
| :--- | :--- |
| **第 1 章：libcfs** | `05_lustre_manual_cn/08_tuning_benchmarks_nrs.md`（libcfs 参数与 CPU 分区调优） |
| **第 2 章：LNet** | `01_understanding_lustre_internals/images/fig_01.png`<br>`02_lustre_architecture_v4/images/arch_04_network_multirail.png`<br>`05_lustre_manual_cn/images/manual_p047_xref950.png`, `manual_p167_xref1339.png` |
| **第 3 章：Wire Protocol** | `01_understanding_lustre_internals.md`（第 3 章：Portals 与 wire 格式协议交互） |
| **第 4 章：Portal RPC** | `05_lustre_manual_cn/images/manual_p423_xref2168.png`（NRS 调度器）<br>`01_understanding_lustre_internals.md`（第 4 章：OBP 宏与 RPC 派遣） |
| **第 5 章：Recovery & AT** | `01_understanding_lustre_internals.md`（第 8 章：Lustre Recovery 恢复状态机）<br>`05_lustre_manual_cn/09_troubleshooting_lfsck_recovery.md`（VBR 与重放机制） |
| **第 6 章：LDLM Locks** | `01_understanding_lustre_internals.md`（第 7 章：Lustre Locks 意图锁与 AST）<br>`02_lustre_architecture_v4/lustre_architecture_v4.md`（分布式锁管理） |
| **第 7 章：OBD Model** | `01_understanding_lustre_internals/images/fig_06.png`, `fig_07.png`, `fig_11.png`~`fig_15.png`（设备生命周期完整状态机） |
| **第 8 章：lu_object** | `01_understanding_lustre_internals.md`（第 5 章：class_attach/setup 底层对象分配） |
| **第 9 章：FID** | `01_understanding_lustre_internals/images/fig_03.png`（FID 访问 Layout EA 与对应 OST 复合对象）<br>`02_lustre_architecture_v4.md`（FID 序列分配） |
| **第 10 章：MDT Internals** | `02_lustre_architecture_v4/images/arch_07_mds_reference_design.png`（MDS 容灾参考设计） |
| **第 11 章：DNE Architecture** | `03_roadmap_2019/images/slide_06.png`（DNE3 目录分片扩展） |
| **第 12 章：Changelogs** | `05_lustre_manual_cn/06_management_ha_pcc.md`（Changelogs 与 HSM 协同） |
| **第 13 章：OST & OSD** | `01_understanding_lustre_internals/images/fig_16.png`, `fig_17.png`（OST-MDT 交互与 Import/Export） |
| **第 14 章：PFL / FLR / DoM** | `05_lustre_manual_cn/images/manual_p204_xref1458.png` (PFL 架构)<br>`manual_p248_xref1624.png` (DoM 架构)<br>`manual_p258_xref1656.png` (FLR 架构)<br>`04_feature_development_challenges/images/slide_05.png`~`slide_10.png` |
| **第 15 章：IO Grant** | `01_understanding_lustre_internals.md`（第 2 章：I/O 数据路径与 Grant 约束） |
| **第 16 章：llite & VFS** | `01_understanding_lustre_internals/images/fig_04.png`, `fig_05.png`<br>`02_lustre_architecture_v4/images/arch_09_client_vfs_stack.png`, `arch_10_client_io_flow.png` |
| **第 17 章：cl_object** | `01_understanding_lustre_internals.md`（客户端 I/O 分层抽象与状态机） |
| **第 18 章：Distributed Cache & PCC** | `05_lustre_manual_cn/images/manual_p317_xref1843.png`（PCC 持久缓存体系）<br>`04_feature_development_challenges/images/slide_03.png` |
| **第 19 章：MGS & Config** | `01_understanding_lustre_internals/images/fig_08.png`, `fig_09.png`, `fig_10.png`（MGC 配置获取与日志处理） |
| **第 20 章：HA Architecture** | `02_lustre_architecture_v4/images/arch_08_oss_ha_design.png`<br>`05_lustre_manual_cn/images/manual_p040_xref925.png`, `manual_p041_xref931.png` |
| **第 21 章：Observability** | `05_lustre_manual_cn/08_tuning_benchmarks_nrs.md`（procfs/sysfs 指标度量与诊断） |
| **第 22 章：Performance Tuning** | `05_lustre_manual_cn/08_tuning_benchmarks_nrs.md`（sgpdd-survey, obdfilter-survey, 16MB RPC 调优） |
| **第 23 章：Disaster Recovery** | `05_lustre_manual_cn/09_troubleshooting_lfsck_recovery.md`（LFSCK 完整运行与修复手册） |
| **第 24 章：AI Frontiers & GDS** | `04_feature_development_challenges/images/slide_11.png`~`slide_18.png`（大模型与 GPU Direct Storage 演进） |
