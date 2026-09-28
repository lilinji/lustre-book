# 第 18 章：llite 与 Linux VFS 深度适配与生命周期

> **本章核心源码文件**：  
> - `lustre/llite/llite_lib.c`：文件系统挂载注册、超级块初始化（`ll_fill_super()`）与卸载实现  
> - `lustre/llite/file.c`：标准文件操作表（`file_operations`）与 `read`/`write` 迭代器实现  
> - `lustre/llite/namei.c`：Inode 操作表（`inode_operations`）与目录项查找（`lookup`/`create`）实现  
> - `lustre/llite/dcache.c`：分布式 Dentry 验证器（`ll_d_revalidate()`）与缓存生命周期管理  
> - `lustre/llite/rw26.c`：页面缓存操作表（`address_space_operations`）与直接 I/O 绑定  
> - `lustre/include/lustreapi.h`：用户态开发库 `liblustreapi`（LLAPI）条带与底层控制接口定义  

---

## 本章核心小节导读

- [18.1 llite 架构定位：Linux VFS 与分布式集群的适配中枢](18.1.md)
- [18.2 挂载与装配流程：ll_fill_super()](18.2.md)
- [18.3 核心数据结构内嵌：struct ll_inode_info](18.3.md)
- [18.4 分布式 Dentry 校验与生命周期：ll_d_revalidate()](18.4.md)
- [18.5 客户端完整读写 I/O 流水线](18.5.md)
- [18.6 用户态 C 语言控制接口：liblustreapi（LLAPI）](18.6.md)
- [18.7 生产实战：llite VFS 客户端 生产调优与运行指标](18.7.md)
- [18.8 生产故障案例：冷锁滞留导致 VFS Dentry 泄露与客户端内核 OOM](18.8.md)
- [18.9 llite VFS 客户端 运维基线检查清单](18.9.md)
- [本章小结：llite VFS 客户端 核心思考与自检](summary.md)
