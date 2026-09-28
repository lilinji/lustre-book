# 第 7 章：OBD 分层模型与设备生命周期

> **本章核心源码文件**：  
> - `lustre/include/obd.h`：`struct obd_device`、`struct obd_ops` 及核心设备类型定义  
> - `lustre/include/obd_class.h`：OBD 设备类注册、查找与通用操作宏定义  
> - `lustre/obdclass/genops.c`：全局设备表（`obd_devs`）、设备分配与生命周期管理  
> - `lustre/obdclass/obd_config.c`：配置指令（`lcfg`）解析与设备装配初始化  
> - `lustre/include/lustre_export.h`：Export 结构体与客户端会话管理定义  

---

## 本章核心小节导读

- [7.1 分层架构设计：从块抽象到虚拟对象栈](7.1.md)
- [7.2 核心数据结构：struct obd_device 与 struct obd_ops](7.2.md)
- [7.3 全局设备注册表与生命周期](7.3.md)
- [7.4 OBD 设备全生命周期状态机](7.4.md)
- [7.5 Export 与 Import 核心通信实体](7.5.md)
- [7.6 生产实战：设备状态检查与故障诊断](7.6.md)
- [7.7 生产事故案例：僵尸 Export 引用泄漏导致存储节点卸载挂死](7.7.md)
- [7.8 OBD 设备模型 运维基线检查清单](7.8.md)
- [本章小结：OBD 设备模型 核心思考与自检](summary.md)
