# 第 14 章：OST 与 OSD 存储核心与底层引擎抉择

> **本章核心源码文件**：  
> - `lustre/ofd/ofd_obd.c`：OST 过滤设备（OFD, OST Filter Device）初始化与 RPC 分发中枢  
> - `lustre/ofd/ofd_io.c`：数据读写 I/O 处理、Bulk 校验与空间提交逻辑  
> - `lustre/ofd/ofd_objects.c`：对象预创建（Pre-creation）机制与 FID 分配  
> - `lustre/osd-ldiskfs/osd_io.c`：基于 ldiskfs 的 Direct I/O 与 `bio` 向量组装驱动  
> - `lustre/osd-zfs/osd_io.c`：基于 ZFS DMU（Data Management Unit）的对象 I/O 驱动  

---

## 本章核心小节导读

- [14.1 数据存储节点全景：OSS 与 OST](14.1.md)
- [14.2 服务端调度中枢：OFD（OST Filter Device）](14.2.md)
- [14.3 后端存储引擎抉择：osd-ldiskfs vs osd-zfs](14.3.md)
- [14.4 物理 I/O 流水线：osd_iobuf 与 bio 直通](14.4.md)
- [14.5 生产实战：OST/OSD 存储引擎 参数调优与监控指标](14.5.md)
- [14.6 生产事故案例：底层硬件 RAID 卡回写缓存失效导致 OST 写入吞吐骤降 90%](14.6.md)
- [14.7 OST/OSD 存储引擎 运维基线检查清单](14.7.md)
- [本章小结：OST/OSD 存储引擎 核心思考与自检](summary.md)
