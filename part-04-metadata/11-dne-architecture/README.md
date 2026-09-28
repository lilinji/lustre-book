# 第 11 章：DNE（Distributed Namespace Engine）多元数据水平扩展

> **本章核心源码文件**：  
> - `lustre/lmv/lmv_obd.c`：客户端逻辑元数据卷（LMV）驱动与哈希路由实现  
> - `lustre/include/lustre_lmv.h`：LMV 条带化描述符与目录分片布局定义  
> - `lustre/mdt/mdt_coordinator.c`：跨 MDT 分布式操作协调器（Coordinator）实现  
> - `lustre/mdd/mdd_dir.c`：条带化目录（Striped Directory）分片创建与迭代遍历  
> - `lustre/lod/lod_sub_object.c`：底层跨目标对象更新日志（Update Log）管理  

---

## 本章核心小节导读

- [11.1 单 MDT 的扩展性物理极限与 DNE 演进](11.1.md)
- [11.2 目录条带化核心算法与 LMV 哈希机制](11.2.md)
- [11.3 跨 MDT 分布式操作与更新日志（Update Log）](11.3.md)
- [11.4 目录在线平滑迁移（Directory Migration）](11.4.md)
- [11.5 生产实战：DNE 水平扩展 参数调优与监控指标](11.5.md)
- [11.6 生产事故案例：跨 MDT Update Log 堆积引发分布式重命名挂起与 MDS 内存溢出](11.6.md)
- [11.7 DNE 水平扩展 运维基线检查清单](11.7.md)
- [本章小结：DNE 水平扩展 核心思考与自检](summary.md)
