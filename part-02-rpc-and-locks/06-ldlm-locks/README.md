# 第 6 章：LDLM 分布式锁管理器：意图锁与并发控制深度解密

> **本章核心源码文件**：  
> - `include/uapi/linux/lustre/lustre_idl.h`：LDLM 锁模式、锁类型与意向操作码定义  
> - `lustre/include/lustre_dlm.h`：锁管理器核心命名空间、资源实体与锁结构声明  
> - `lustre/ldlm/ldlm_lock.c`：分布式锁生命周期、状态迁移与队列流转实现  
> - `lustre/ldlm/ldlm_resource.c`：资源哈希表管理、冲突判定与兼容性矩阵计算  
> - `lustre/ldlm/ldlm_request.c`：意图锁（Intent Lock）协议交互与 AST 异步回调处理  

---

## 本章核心小节导读

- [6.1 分布式锁的核心拓扑与兼容性矩阵](6.1.md)
- [6.2 锁特化形态：针对不同存储实体的定制化隔离](6.2.md)
- [6.3 三大异步 AST 回调机制](6.3.md)
- [6.4 意向锁（Intent Lock）：1-RTT 复合元数据操作](6.4.md)
- [6.5 锁动态收缩与内存控制（SLV 与 Client LRU）](6.5.md)
- [6.6 生产实战：LDLM 锁 参数调优与监控指标](6.6.md)
- [6.7 生产事故案例：共享目录并发创建引发 Inode 字段锁颠簸（Lock Ping-Pong）](6.7.md)
- [6.8 LDLM 锁 运维基线检查清单](6.8.md)
- [本章小结：LDLM 锁 核心思考与自检](summary.md)
