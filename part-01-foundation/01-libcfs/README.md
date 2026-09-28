# 第 1 章：高性能内核基础设施：libcfs 与平台兼容抽象

> **本章核心源码文件**：  
> - `libcfs/include/libcfs/libcfs.h`：基础宏、类型与全局环境定义  
> - `libcfs/include/libcfs/libcfs_cpu.h` / `include/linux/lnet/lib-cpt.h`：CPU 分区表（CPT）核心接口与数据结构声明  
> - `libcfs/libcfs/libcfs_cpu.c`：CPT 拓扑探测、掩码计算与线程亲和性绑定实现  
> - `libcfs/libcfs/libcfs_mem.c`：Per-CPT 内存分配器与本地 NUMA 内存管理  
> - `libcfs/libcfs/tracefile.c` / `tracefile.h`：Per-CPU 环形内存跟踪日志引擎  
> - `libcfs/include/libcfs/libcfs_fail.h` / `libcfs/libcfs/fail.c`：内核故障注入框架实现  
> - `lustre/include/obd_support.h`：存储子系统故障注入码映射宏  

---

## 本章核心小节导读

- [1.1 硬件矛盾：NUMA 拓扑开销与 Linux 内核演进](1.1.md)
- [1.2 CPT（CPU Partition Table）虚拟处理单元架构](1.2.md)
- [1.3 零锁环形内存跟踪日志（Tracefile）](1.3.md)
- [1.4 内核故障注入机制（fail_loc）](1.4.md)
- [1.5 跨内核平台兼容层设计](1.5.md)
- [1.6 生产实战：CPT 与 libcfs 参数调优矩阵](1.6.md)
- [1.7 生产事故案例：NUMA CPT 映射退化引发集群 I/O 吞吐骤降](1.7.md)
- [1.8 libcfs 运维基线检查清单](1.8.md)
- [本章小结：libcfs 核心思考与自检](summary.md)
