# Summary

[序言：为什么需要深入理解 Lustre？](README.md)

## 第一卷：通信基石与内核抽象层 (Foundation & LNet)
* [第 1 章：高性能内核基础设施：libcfs 与平台兼容抽象](part-01-foundation/01-libcfs.md)
* [第 2 章：LNet（Lustre Network）通信引擎：构建集群血管](part-01-foundation/02-lnet.md)
* [第 3 章：统一线控协议与数据包布局 (Wire Protocol)](part-01-foundation/03-wire-protocol.md)

## 第二卷：分布式通信与并发控制骨架 (Portal RPC & LDLM)
* [第 4 章：Portal RPC 异步通信框架与请求状态机](part-02-rpc-and-locks/04-portal-rpc.md)
* [第 5 章：分布式容错恢复与自适应超时 (Adaptive Timeouts)](part-02-rpc-and-locks/05-recovery-at.md)
* [第 6 章：LDLM 分布式锁管理器：意图锁与并发控制深度解密](part-02-rpc-and-locks/06-ldlm-locks.md)

## 第三卷：对象存储设备抽象与基础组件 (OBD Foundation)
* [第 7 章：OBD 分层模型与设备生命周期](part-03-obd-foundation/07-obd-model.md)
* [第 8 章：现代对象栈模型：lu_object 与两阶段事务契约](part-03-obd-foundation/08-lu-object.md)
* [第 9 章：FID 体系与分布式命名空间路由](part-03-obd-foundation/09-fid-concept.md)

## 第四卷：元数据集群与分布式命名空间 (Metadata Services)
* [第 10 章：MDS 与 MDT 核心架构与元数据流水线](part-04-metadata/10-mdt-internals.md)
* [第 11 章：DNE（Distributed Namespace Engine）多元数据水平扩展](part-04-metadata/11-dne-architecture.md)
* [第 12 章：元数据变更日志（Changelogs）与数据保护](part-04-metadata/12-changelogs.md)

## 第五卷：条带化并发数据 I/O 引擎 (Data Storage Path)
* [第 13 章：OST 与 OSD 存储核心与底层引擎抉择](part-05-data-storage/13-ost-osd.md)
* [第 14 章：文件条带化（Striping）与现代布局演进 (PFL / FLR / DoM)](part-05-data-storage/14-striping-pfl-flr.md)
* [第 15 章：分布式 IO 流水线与缓存 Grant 机制](part-05-data-storage/15-io-grant.md)

## 第六卷：客户端 VFS 装配与 POSIX 语义实现 (Client Subsystem)
* [第 16 章：llite 与 Linux VFS 深度适配与生命周期](part-06-client-subsystem/16-llite-vfs.md)
* [第 17 章：cl_object 客户端对象抽象层与 IO 状态机](part-06-client-subsystem/17-cl-object.md)
* [第 18 章：分布式缓存一致性与并发控制 (PCC / 分布式 mmap)](part-06-client-subsystem/18-distributed-cache.md)

## 第七卷：集群管控、运维工具与现代扩展 (Management & Observability)
* [第 19 章：MGS 与动态配置分发中心](part-07-management/19-mgs-config.md)
* [第 20 章：高可用架构（HA）与故障转移机制](part-07-management/20-high-availability.md)
* [第 21 章：性能监控、指标度量与可观测性体系](part-07-management/21-monitoring-observability.md)

## 第八卷：生产工程调优、容灾救援与 AI 前沿 (Production Engineering & AI Frontiers)
* [第 22 章：全栈性能调优黑魔法](part-08-production/22-performance-tuning.md)
* [第 23 章：真实生产灾难排查与应急救援手册](part-08-production/23-disaster-recovery.md)
* [第 24 章：面向 AI 时代的演进与前沿架构 (GDS / DAOS 反思)](part-08-production/24-ai-frontiers.md)
