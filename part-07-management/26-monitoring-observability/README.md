# 第 26 章：性能监控、指标度量与可观测性体系

> **本章核心源码文件**：  
> - `lustre/obdclass/lprocfs_status.c`：内核统计框架与 procfs/sysfs 虚拟文件系统指标导出实现  
> - `lustre/obdclass/jobid.c`：Jobstats 作业标识解析、调度环境变量捕获与聚合度量引擎  
> - `lustre/include/lprocfs_status.h`：统计直方图、衰减计数器与高精度采样数据结构定义  
> - `lustre/osc/lproc_osc.c`：客户端传输延迟、在途 RPC 与脏数据指标收集实现  
> - `lustre/obdfilter/lproc_obdfilter.c`：OST 块读写统计、物理 I/O 分布直方图（`brw_stats`）实现  

---

## 本章核心小节导读

- [26.1 内核级度量源：procfs 与 sysfs 监控全景](26.1.md)
- [26.2 物理 I/O 分布直方图：brw_stats 深度解析](26.2.md)
- [26.3 超算与 AI 作业度量引擎：Jobstats](26.3.md)
- [26.4 现代可观测性体系构建：Prometheus 与 Grafana 全景集成](26.4.md)
- [26.5 生产事故案例：死循环 stat 作业引发元数据风暴，通过 Jobstats 3 分钟定界截杀](26.5.md)
- [26.6 监控与度量体系 运维基线检查清单](26.6.md)
- [本章小结：监控与度量体系 核心思考与自检](summary.md)
