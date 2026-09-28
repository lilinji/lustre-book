# 第 10 章：MDS 与 MDT 核心架构与元数据流水线

> **本章核心源码文件**：  
> - `lustre/mdt/mdt_handler.c`：MDT 请求分发中枢、只读与修改型操作派发实现  
> - `lustre/mdt/mdt_reint.c`：元数据变更（Reintegration）流水线与事务包装  
> - `lustre/mdt/mdt_identity.c`：Nodemap 多租户身份映射与权限压制实现  
> - `lustre/include/lustre_nodemap.h`：Nodemap 配置树与安全域结构声明  
> - `lustre/mdd/mdd_device.c`：MDD 元数据核心业务层驱动实现  

---

## 本章核心小节导读

- [10.1 概念明晰：MDS 物理实体与 MDT 逻辑目标](10.1.md)
- [10.2 元数据双轨流水线：只读与修改型操作](10.2.md)
- [10.3 意向调度中枢：mdt_intent_policy()](10.3.md)
- [10.4 Nodemap 多租户安全隔离与权限压制](10.4.md)
- [10.5 生产实战：MDT 性能指标度量与监控](10.5.md)
- [10.6 生产事故案例：父目录意图写锁冲突引发千节点并发 create 瘫痪](10.6.md)
- [10.7 MDT 元数据 运维基线检查清单](10.7.md)
- [本章小结：MDT 元数据 核心思考与自检](summary.md)
