# 第 9 章：FID 体系与分布式命名空间路由

> **本章核心源码文件**：  
> - `include/uapi/linux/lustre/lustre_user.h`：128 位 FID 结构体（`struct lu_fid`）与基础操作宏  
> - `include/uapi/linux/lustre/lustre_idl.h`：保留序列号常量与范围划分宏定义  
> - `lustre/fid/fid_request.c`：分布式序列号分配器（Sequence Controller & Manager）实现  
> - `lustre/fld/fld_request.c`：FID 位置数据库（FLD, FID Location Database）实现  
> - `lustre/osd-ldiskfs/osd_index.c`：本地磁盘对象索引表（OI Table）映射机制  

---

## 本章核心小节导读

- [9.1 分布式环境下的标识需求与 128 位 FID](9.1.md)
- [9.2 保留序列空间划分（Reserved Sequence Universe）](9.2.md)
- [9.3 序列分配中枢：Sequence Controller 与 Manager 批发机制](9.3.md)
- [9.4 基于 FID 与 Layout EA 的跨节点对象寻址](9.4.md)
- [9.5 分布式命名空间路由：FLD（FID Location Database）](9.5.md)
- [9.6 底层物理映射：对象索引表（OI Table）](9.6.md)
- [9.7 生产实战：FID 检查与路径反查工具](9.7.md)
- [9.8 生产事故案例：OI 索引表局部损坏导致文件元数据访问报 -ENOENT](9.8.md)
- [9.9 FID 体系 运维基线检查清单](9.9.md)
- [本章小结：FID 体系 核心思考与自检](summary.md)
