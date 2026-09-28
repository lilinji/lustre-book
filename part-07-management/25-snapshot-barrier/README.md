# 第 25 章：分布式写屏障（Barrier）与集群级全局快照

> **本章核心源码文件**：  
> - `lustre/mgs/mgs_barrier.c`：全集群分布式写屏障（Write Barrier）协调引擎与状态机实现  
> - `lustre/dt_run/barrier.c`：底层 OSD 存储目标事务冻结、刷盘与解除实现  
> - `lustre/osd-zfs/osd_snapshot.c`：基于 ZFS 数据集快照的底层协同创建与回滚  
> - `lustre/utils/lfs_snapshot.c`：用户态 `lctl snapshot_*` 与 `lctl barrier_*` 控制命令实现  
> - `lustre/mgs/mgs_llog.c`：快照专属配置日志分支（`fork_lcfg` / `erase_lcfg`）实现  

---

## 本章核心小节导读

- [25.1 跨节点一致性快照的工程困境](25.1.md)
- [25.2 分布式写屏障（Barrier）协议时序与状态机](25.2.md)
- [25.3 快照配置日志分支：fork_lcfg 与只读挂载](25.3.md)
- [25.4 生产实战：写屏障与快照管理指令集](25.4.md)
- [25.5 生产事故案例：大写突发期间写屏障超时熔断与长尾 OST 事务挂起](25.5.md)
- [25.6 快照与 Barrier 运维基线检查清单](25.6.md)
- [本章小结：快照与 Barrier 核心思考与自检](summary.md)
