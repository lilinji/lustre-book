# 第 15 章：文件条带化与现代布局演进 (PFL / FLR / DoM / SEL)

> **本章核心源码文件**：  
> - `include/uapi/linux/lustre/lustre_user.h`：条带布局数据结构、复合布局（Composite Layout）与 PFL/FLR 宏定义  
> - `lustre/lov/lov_object.c`：逻辑对象卷（LOV）布局解析、条带分发与 I/O 映射实现  
> - `lustre/lov/lov_ea.c`：布局扩展属性（LOV EA）序列化与反序列化  
> - `lustre/lod/lod_lov.c`：服务端条带布局生成、OST 对象挑选与组件分配  
> - `lustre/utils/lfs.c`：用户态 `lfs setstripe`、`lfs mirror` 布局配置实现  

---

## 本章核心小节导读

- [15.1 传统固定条带化的原理与局限](15.1.md)
- [15.2 渐进式文件布局（PFL, Progressive File Layout）](15.2.md)
- [15.3 自扩展布局（SEL, Self-Extending Layout）](15.3.md)
- [15.4 元数据端内嵌小数据：DoM（Data-on-MDT）](15.4.md)
- [15.5 文件级冗余（FLR, File-Level Redundancy）多副本机制](15.5.md)
- [15.6 生产实战：现代布局配置与运维命令集](15.6.md)
- [15.7 生产事故案例：全局 stripe_count=-1 引发海量小文件预分配枯竭雪崩](15.7.md)
- [15.8 条带化 PFL/FLR 运维基线检查清单](15.8.md)
- [本章小结：条带化 PFL/FLR 核心思考与自检](summary.md)
