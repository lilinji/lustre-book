# 第 12 章：元数据变更日志（Changelogs）与数据保护

> **本章核心源码文件**：  
> - `include/uapi/linux/lustre/lustre_user.h`：`struct changelog_rec` 二进制报文、标志位与事件类型枚举定义  
> - `lustre/mdd/mdd_dir.c`：元数据变更事件捕获与 Changelog 记录生成  
> - `lustre/obdclass/llog.c`：底层追加型日志引擎（LLOG, Lustre Log）实现  
> - `lustre/obdclass/llog_cat.c`：LLOG 目录索引（Catalog）与分片生命周期管理  
> - `lustre/utils/lfs.c`：用户态 `lfs changelog` 消费、监听与清理命令实现  

---

## 本章核心小节导读

- [12.1 变更捕获机制：从定时扫描到事件驱动](12.1.md)
- [12.2 二进制数据结构：struct changelog_rec](12.2.md)
- [12.3 存储引擎：LLOG（Lustre Log）组织架构](12.3.md)
- [12.4 消费者生命周期与最低水位线回收](12.4.md)
- [12.5 下游集成应用：分层存储管理（HSM）](12.5.md)
- [12.6 生产实战：Changelogs 运维与消费管理](12.6.md)
- [12.7 生产事故案例：废弃消费者未注销导致 MDT 磁盘空间耗尽与集群只读](12.7.md)
- [12.8 Changelogs 运维基线检查清单](12.8.md)
- [本章小结：Changelogs 核心思考与自检](summary.md)
