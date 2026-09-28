# 第 24 章：企业级磁盘配额系统与空间治理

> **本章核心源码文件**：  
> - `lustre/qmt/qmt_handler.c`：配额主目标（QMT, Quota Master Target）全局记账与配额协调引擎  
> - `lustre/qsd/qsd_handler.c`：配额从设备（QSD, Quota Slave Device）本地配额池与异步申请实现  
> - `lustre/osd-ldiskfs/osd_quota.c`：底层物理块与 Inode 配额硬校验与扣减钩子  
> - `lustre/include/lustre_quota.h`：用户/组/项目（Project）配额数据结构与二阶段配额协议定义  
> - `lustre/utils/lfs_project.c`：用户态目录级项目 ID（Project ID）继承与配置实现  

---

## 本章核心小节导读

- [24.1 传统配额痛点与分布式配额工程矛盾](24.1.md)
- [24.2 QMT 与 QSD 分布式协调机制](24.2.md)
- [24.3 企业级目录级配额：Project Quota 机制](24.3.md)
- [24.4 软限制（Soft Limit）、硬限制（Hard Limit）与宽限期（Grace Time）](24.4.md)
- [24.5 生产实战：配额配置与管理命令集](24.5.md)
- [24.6 生产事故案例：大规模 Checkpoint 瞬时突发引发 QSD 信用滞后与非预期 -EDQUOT 假死](24.6.md)
- [24.7 磁盘配额治理 运维基线检查清单](24.7.md)
- [本章小结：磁盘配额治理 核心思考与自检](summary.md)
