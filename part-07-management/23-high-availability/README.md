# 第 23 章：高可用架构（HA）与故障转移机制

> **本章核心源码文件**：  
> - `lustre/obdclass/genops.c`：多 NID 导出与连接重定向（Failover NID Mapping）逻辑实现  
> - `lustre/ptlrpc/recover.c`：故障转移重连握手、恢复窗口倒计时与重放事务协调  
> - `lustre/include/lustre_import.h`：Import 多路径网络连接描述符（`struct obd_import_conn`）定义  
> - `lustre/utils/mount_lustre.c`：挂载参数解析、多主备 NID 识别与高可用选项绑定  
> - `lustre/ldiskfs/mmp.c`：多挂载保护（MMP, Multiple Mount Protection）心跳写入与双挂防脑裂机制  

---

## 本章核心小节导读

- [23.1 生产级高可用硬件拓扑：双活对偶与双端口共享存储](23.1.md)
- [23.2 MDS 与 OSS 的 Active-Active 对偶故障切换架构](23.2.md)
- [23.3 防脑裂双保险机制：STONITH 硬隔离与驱动级 MMP](23.3.md)
- [23.4 故障转移完整时序与客户端透明重连](23.4.md)
- [23.5 生产实战：Pacemaker 集群资源与 MMP 配置](23.5.md)
- [23.6 生产事故案例：测试期私自禁用 STONITH 引发双主脑裂与元数据覆灭](23.6.md)
- [23.7 HA 双机高可用 运维基线检查清单](23.7.md)
- [本章小结：HA 双机高可用 核心思考与自检](summary.md)
