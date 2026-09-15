#!/usr/bin/env node
/**
 * generate_architecture_svg.mjs
 * 遵循 baoyu-diagram 规范，生成《Lustre 分布式文件系统》全书知识与系统架构全局全景图 (SVG)
 */

import fs from 'fs';
import path from 'path';

const width = 1680;
const height = 1140;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" stroke-width="0.6" stroke-opacity="0.7"/>
    </pattern>
    <linearGradient id="grad-title" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="50%" stop-color="#818cf8"/>
      <stop offset="100%" stop-color="#c084fc"/>
    </linearGradient>
    <linearGradient id="glow-cyan" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(34,211,238,0.2)"/>
      <stop offset="100%" stop-color="rgba(34,211,238,0.02)"/>
    </linearGradient>
    
    <!-- Arrow Markers -->
    <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#64748b"/>
    </marker>
    <marker id="arrow-cyan" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#22d3ee"/>
    </marker>
    <marker id="arrow-emerald" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#34d399"/>
    </marker>
    <marker id="arrow-violet" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#a78bfa"/>
    </marker>
    <marker id="arrow-amber" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#fbbf24"/>
    </marker>
    <marker id="arrow-rose" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#fb7185"/>
    </marker>
  </defs>

  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&amp;display=swap');
    text { font-family: 'JetBrains Mono', 'SF Mono', 'PingFang SC', 'Microsoft YaHei', monospace; }
    .box-title { font-size: 12px; font-weight: 700; fill: #ffffff; }
    .box-sub { font-size: 9.5px; font-weight: 400; fill: #94a3b8; }
    .box-tag { font-size: 8.5px; font-weight: 600; }
    .region-title { font-size: 13px; font-weight: 700; letter-spacing: 0.5px; }
  </style>

  <!-- 1. Background Fill + Grid -->
  <rect width="100%" height="100%" fill="#0a0f1d"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>

  <!-- ==================== TOP TITLE BAR ==================== -->
  <g transform="translate(40, 25)">
    <text x="0" y="24" font-size="22" font-weight="800" fill="url(#grad-title)">《Lustre 分布式文件系统》全景技术与章节知识架构图</text>
    <text x="0" y="44" font-size="11" font-weight="500" fill="#64748b">LUSTRE HIGH-PERFORMANCE PARALLEL FILE SYSTEM — FULL ARCHITECTURE &amp; KNOWLEDGE MAP</text>
    
    <!-- Meta badges -->
    <g transform="translate(980, 8)">
      <rect x="0" y="0" width="130" height="26" rx="5" fill="#1e293b" stroke="#334155"/>
      <text x="65" y="17" fill="#38bdf8" font-size="10" font-weight="600" text-anchor="middle">Lustre 2.16+ Native</text>
      
      <rect x="140" y="0" width="125" height="26" rx="5" fill="#1e293b" stroke="#334155"/>
      <text x="202" y="17" fill="#34d399" font-size="10" font-weight="600" text-anchor="middle">8 大卷 / 24 核心章</text>

      <rect x="275" y="0" width="130" height="26" rx="5" fill="#1e293b" stroke="#334155"/>
      <text x="340" y="17" fill="#a78bfa" font-size="10" font-weight="600" text-anchor="middle">23.5万字 / 587页</text>

      <rect x="415" y="0" width="195" height="26" rx="5" fill="#1e293b" stroke="#334155"/>
      <text x="512" y="17" fill="#f43f5e" font-size="10" font-weight="600" text-anchor="middle">24 事故复盘 + 24 Checklist</text>
    </g>
  </g>

  <!-- ==================== CONNECTIONS / DATA FLOW (BACKGROUND) ==================== -->
  <!-- Client to MDS/OSS -->
  <path d="M 360 215 L 360 250 L 590 250 L 590 570" fill="none" stroke="#22d3ee" stroke-width="1.8" stroke-dasharray="4,4" marker-end="url(#arrow-cyan)"/>
  <path d="M 1250 215 L 1250 250 L 1080 250 L 1080 570" fill="none" stroke="#a78bfa" stroke-width="2" marker-end="url(#arrow-violet)"/>
  <!-- MGS to All -->
  <path d="M 330 395 L 430 395" fill="none" stroke="#fb7185" stroke-width="1.5" stroke-dasharray="3,3" marker-end="url(#arrow-rose)"/>
  <path d="M 190 490 L 190 590 L 430 590" fill="none" stroke="#fb7185" stroke-width="1.5" stroke-dasharray="3,3" marker-end="url(#arrow-rose)"/>
  <!-- RPC to Engines -->
  <path d="M 720 500 L 720 570" fill="none" stroke="#fbbf24" stroke-width="1.8" marker-end="url(#arrow-amber)"/>
  <path d="M 960 500 L 960 570" fill="none" stroke="#fbbf24" stroke-width="1.8" marker-end="url(#arrow-amber)"/>
  <!-- MDS to OBD Foundation -->
  <path d="M 780 670 L 1310 670" fill="none" stroke="#34d399" stroke-width="1.2" stroke-dasharray="2,2"/>
  <!-- OST to OBD Foundation -->
  <path d="M 1260 670 L 1310 670" fill="none" stroke="#a78bfa" stroke-width="1.2" stroke-dasharray="2,2"/>

  <!-- ==================== LAYER 1: CLIENT SUBSYSTEM & POSIX (卷六) ==================== -->
  <g transform="translate(40, 85)">
    <!-- Boundary -->
    <rect x="0" y="0" width="1600" height="150" rx="10" fill="rgba(8, 51, 68, 0.15)" stroke="#22d3ee" stroke-width="1.2" stroke-dasharray="6,4"/>
    <text x="20" y="24" fill="#22d3ee" class="region-title">【第六卷：客户端 VFS 装配与 POSIX 语义实现】 CLIENT SUBSYSTEM &amp; POSIX LAYER</text>

    <!-- User Space Apps -->
    <rect x="25" y="42" width="280" height="88" rx="6" fill="#0f172a"/>
    <rect x="25" y="42" width="280" height="88" rx="6" fill="rgba(30, 41, 59, 0.6)" stroke="#64748b" stroke-width="1.2"/>
    <text x="165" y="68" class="box-title" text-anchor="middle">用户态应用与算力框架</text>
    <text x="165" y="87" class="box-sub" text-anchor="middle">PyTorch / DeepSpeed / MPI / POSIX Apps</text>
    <text x="165" y="104" font-size="9" fill="#38bdf8" text-anchor="middle">open() / read() / write() / mmap() / Direct IO</text>
    <text x="35" y="120" fill="#94a3b8" font-size="8">Mountpoint: /mnt/lustre</text>

    <!-- Arrow Apps to llite -->
    <line x1="305" y1="86" x2="340" y2="86" stroke="#22d3ee" stroke-width="1.5" marker-end="url(#arrow-cyan)"/>

    <!-- Ch 16: llite VFS -->
    <rect x="345" y="42" width="370" height="88" rx="6" fill="#0f172a"/>
    <rect x="345" y="42" width="370" height="88" rx="6" fill="rgba(8, 51, 68, 0.4)" stroke="#22d3ee" stroke-width="1.5"/>
    <rect x="355" y="50" width="60" height="18" rx="3" fill="#0e7490"/>
    <text x="385" y="63" fill="#ffffff" class="box-tag" text-anchor="middle">第16章</text>
    <text x="425" y="64" class="box-title">llite 驱动与 Linux VFS 深度适配</text>
    <text x="355" y="87" class="box-sub">• struct super_operations / file_operations 重载适配</text>
    <text x="355" y="103" class="box-sub">• Dentry / Inode 缓存状态机与跨网络意向 Lookup</text>
    <text x="355" y="119" font-size="8.5" fill="#f43f5e">⚡ 事故复盘: Dcache 泄漏导致客户端无法卸载</text>

    <!-- Arrow llite to cl_object -->
    <line x1="715" y1="86" x2="750" y2="86" stroke="#22d3ee" stroke-width="1.5" marker-end="url(#arrow-cyan)"/>

    <!-- Ch 17: cl_object -->
    <rect x="755" y="42" width="400" height="88" rx="6" fill="#0f172a"/>
    <rect x="755" y="42" width="400" height="88" rx="6" fill="rgba(8, 51, 68, 0.4)" stroke="#22d3ee" stroke-width="1.5"/>
    <rect x="765" y="50" width="60" height="18" rx="3" fill="#0e7490"/>
    <text x="795" y="63" fill="#ffffff" class="box-tag" text-anchor="middle">第17章</text>
    <text x="835" y="64" class="box-title">cl_object 客户端对象切片与抽象层</text>
    <text x="765" y="87" class="box-sub">• cl_device / cl_object / cl_page / cl_lock 四维模型</text>
    <text x="765" y="103" class="box-sub">• VFS 与网络解耦，消弭多层堆叠死锁 (CLIO Pipeline)</text>
    <text x="765" y="119" font-size="8.5" fill="#f43f5e">⚡ 事故复盘: cl_page 引用计数泄漏引发内存死锁</text>

    <!-- Arrow cl_object to cache -->
    <line x1="1155" y1="86" x2="1190" y2="86" stroke="#22d3ee" stroke-width="1.5" marker-end="url(#arrow-cyan)"/>

    <!-- Ch 18: Distributed Cache & PCC -->
    <rect x="1195" y="42" width="380" height="88" rx="6" fill="#0f172a"/>
    <rect x="1195" y="42" width="380" height="88" rx="6" fill="rgba(8, 51, 68, 0.4)" stroke="#22d3ee" stroke-width="1.5"/>
    <rect x="1205" y="50" width="60" height="18" rx="3" fill="#0e7490"/>
    <text x="1235" y="63" fill="#ffffff" class="box-tag" text-anchor="middle">第18章</text>
    <text x="1275" y="64" class="box-title">分布式缓存一致性、mmap 与 PCC</text>
    <text x="1205" y="87" class="box-sub">• 写后读强一致性保证与 Blocking AST 锁撤销下刷</text>
    <text x="1205" y="103" class="box-sub">• PCC (Persistent Client Cache) 本地 NVMe 热沉加速</text>
    <text x="1205" y="119" font-size="8.5" fill="#f43f5e">⚡ 事故复盘: mmap 脏页并发下刷引发系统 Panic</text>
  </g>

  <!-- ==================== LEFT COLUMN: MANAGEMENT & HA (卷七) ==================== -->
  <g transform="translate(40, 255)">
    <rect x="0" y="0" width="330" height="570" rx="10" fill="rgba(136, 19, 55, 0.12)" stroke="#fb7185" stroke-width="1.2" stroke-dasharray="6,4"/>
    <text x="16" y="24" fill="#fb7185" class="region-title">【第七卷：集群管控、高可用与度量】</text>

    <!-- Ch 19: MGS -->
    <g transform="translate(15, 45)">
      <rect x="0" y="0" width="300" height="145" rx="6" fill="#0f172a"/>
      <rect x="0" y="0" width="300" height="145" rx="6" fill="rgba(136, 19, 55, 0.3)" stroke="#fb7185" stroke-width="1.5"/>
      <rect x="10" y="10" width="55" height="18" rx="3" fill="#9f1239"/>
      <text x="37" y="23" fill="#ffffff" class="box-tag" text-anchor="middle">第19章</text>
      <text x="75" y="24" class="box-title">MGS 配置中心与动态广播</text>
      <text x="10" y="50" class="box-sub">• 全局拓扑集中管理与 Target 自动注册</text>
      <text x="10" y="68" class="box-sub">• 配置日志流 (LLOG Config Log) 解析驱动</text>
      <text x="10" y="86" class="box-sub">• 基于 Config Lock 与 AST 的全网毫秒级广播</text>
      <text x="10" y="108" font-size="8.5" fill="#f43f5e">⚡ 事故复盘: 静态日志锁死引发全网失步</text>
      <text x="10" y="126" font-size="8.5" fill="#34d399">✓ 调优: MGS HA 冗余与客户端重放优化</text>
    </g>

    <!-- Ch 20: HA & Failover -->
    <g transform="translate(15, 205)">
      <rect x="0" y="0" width="300" height="165" rx="6" fill="#0f172a"/>
      <rect x="0" y="0" width="300" height="165" rx="6" fill="rgba(136, 19, 55, 0.3)" stroke="#fb7185" stroke-width="1.5"/>
      <rect x="10" y="10" width="55" height="18" rx="3" fill="#9f1239"/>
      <text x="37" y="23" fill="#ffffff" class="box-tag" text-anchor="middle">第20章</text>
      <text x="75" y="24" class="box-title">高可用架构 (HA) 与故障转移</text>
      <text x="10" y="50" class="box-sub">• 双机共享存储架构 (Dual-Controller SAN/SAS)</text>
      <text x="10" y="68" class="box-sub">• Pacemaker / Corosync 集群状态协调中枢</text>
      <text x="10" y="86" class="box-sub">• STONITH 硬件隔离处决 (IPMI/PDU 防脑裂)</text>
      <text x="10" y="104" class="box-sub">• 两阶段故障转移 (Failover) 与无感重连</text>
      <text x="10" y="126" font-size="8.5" fill="#f43f5e">⚡ 事故复盘: 心跳闪断引发双重处决 (Dual STONITH)</text>
      <text x="10" y="144" font-size="8.5" fill="#34d399">✓ 调优: QDevice 第三方见证与差异化处决延迟</text>
    </g>

    <!-- Ch 21: Monitoring -->
    <g transform="translate(15, 385)">
      <rect x="0" y="0" width="300" height="165" rx="6" fill="#0f172a"/>
      <rect x="0" y="0" width="300" height="165" rx="6" fill="rgba(136, 19, 55, 0.3)" stroke="#fb7185" stroke-width="1.5"/>
      <rect x="10" y="10" width="55" height="18" rx="3" fill="#9f1239"/>
      <text x="37" y="23" fill="#ffffff" class="box-tag" text-anchor="middle">第21章</text>
      <text x="75" y="24" class="box-title">监控度量与可观测性体系</text>
      <text x="10" y="50" class="box-sub">• lprocfs_status: Per-CPU 无锁内核计数引擎</text>
      <text x="10" y="68" class="box-sub">• Jobstats: 关联 SLURM JobID 作业级 IO 追踪</text>
      <text x="10" y="86" class="box-sub">• BRW 时延与物理块大小直方图深度透视</text>
      <text x="10" y="104" class="box-sub">• Prometheus / Grafana 企业级全景观测大盘</text>
      <text x="10" y="126" font-size="8.5" fill="#f43f5e">⚡ 事故复盘: 高频抓取 lprocfs 拖垮内核态</text>
      <text x="10" y="144" font-size="8.5" fill="#34d399">✓ 调优: 聚合抓取间隔与 eBPF 无侵入度量</text>
    </g>
  </g>

  <!-- ==================== CENTER-TOP: COMMUNICATION & CONCURRENCY (卷一 & 卷二) ==================== -->
  <g transform="translate(390, 255)">
    <rect x="0" y="0" width="890" height="265" rx="10" fill="rgba(120, 53, 15, 0.15)" stroke="#fb923c" stroke-width="1.2" stroke-dasharray="6,4"/>
    <text x="20" y="24" fill="#fb923c" class="region-title">【第一卷 &amp; 第二卷：基础通信与分布式并发控制骨架】 COMMUNICATION &amp; CONCURRENCY LAYER</text>

    <!-- SUBGROUP 1: Part 1 Foundation (Ch 1~3) -->
    <g transform="translate(15, 38)">
      <!-- Ch 01: libcfs -->
      <g transform="translate(0, 0)">
        <rect x="0" y="0" width="270" height="95" rx="6" fill="#0f172a"/>
        <rect x="0" y="0" width="270" height="95" rx="6" fill="rgba(30, 41, 59, 0.5)" stroke="#64748b" stroke-width="1.2"/>
        <rect x="8" y="8" width="55" height="16" rx="3" fill="#475569"/>
        <text x="35" y="20" fill="#ffffff" class="box-tag" text-anchor="middle">第01章</text>
        <text x="70" y="21" class="box-title">libcfs 内核跨平台基石</text>
        <text x="10" y="42" class="box-sub">• CPU CPT 绑核与 NUMA 亲和分配</text>
        <text x="10" y="58" class="box-sub">• 自旋锁、无锁哈希与内存池基础设施</text>
        <text x="10" y="76" font-size="8.5" fill="#f43f5e">⚡ 事故: NUMA 跨核访存致性能跌 80%</text>
      </g>

      <!-- Ch 02: LNet -->
      <g transform="translate(285, 0)">
        <rect x="0" y="0" width="275" height="95" rx="6" fill="#0f172a"/>
        <rect x="0" y="0" width="275" height="95" rx="6" fill="rgba(8, 51, 68, 0.4)" stroke="#22d3ee" stroke-width="1.2"/>
        <rect x="8" y="8" width="55" height="16" rx="3" fill="#0891b2"/>
        <text x="35" y="20" fill="#ffffff" class="box-tag" text-anchor="middle">第02章</text>
        <text x="70" y="21" class="box-title">LNet 极速网络传输引擎</text>
        <text x="10" y="42" class="box-sub">• NID 寻址与 RDMA / InfiniBand / RoCE</text>
        <text x="10" y="58" class="box-sub">• Multi-Rail 多轨聚合与动态流控信用机制</text>
        <text x="10" y="76" font-size="8.5" fill="#f43f5e">⚡ 事故: 动态流控失效引发重传雪崩</text>
      </g>

      <!-- Ch 03: Wire Protocol -->
      <g transform="translate(575, 0)">
        <rect x="0" y="0" width="280" height="95" rx="6" fill="#0f172a"/>
        <rect x="0" y="0" width="280" height="95" rx="6" fill="rgba(120, 53, 15, 0.3)" stroke="#fbbf24" stroke-width="1.2"/>
        <rect x="8" y="8" width="55" height="16" rx="3" fill="#b45309"/>
        <text x="35" y="20" fill="#ffffff" class="box-tag" text-anchor="middle">第03章</text>
        <text x="70" y="21" class="box-title">Wire Protocol 线路报文规范</text>
        <text x="10" y="42" class="box-sub">• 严格 8 字节边界与 Request Capsule 药丸</text>
        <text x="10" y="58" class="box-sub">• 异构 CPU 按需 Swab 字节序与位图防重</text>
        <text x="10" y="76" font-size="8.5" fill="#f43f5e">⚡ 事故: wiretest 漏检致跨平台乱码崩溃</text>
      </g>
    </g>

    <!-- SUBGROUP 2: Part 2 RPC & Locks (Ch 4~6) -->
    <g transform="translate(15, 145)">
      <!-- Ch 04: Portal RPC -->
      <g transform="translate(0, 0)">
        <rect x="0" y="0" width="270" height="105" rx="6" fill="#0f172a"/>
        <rect x="0" y="0" width="270" height="105" rx="6" fill="rgba(120, 53, 15, 0.4)" stroke="#fb923c" stroke-width="1.5"/>
        <rect x="8" y="8" width="55" height="16" rx="3" fill="#c2410c"/>
        <text x="35" y="20" fill="#ffffff" class="box-tag" text-anchor="middle">第04章</text>
        <text x="70" y="21" class="box-title">Portal RPC 机制深度拆解</text>
        <text x="10" y="42" class="box-sub">• ptlrpcd 伙伴调度与 CPT 服务端线程池</text>
        <text x="10" y="58" class="box-sub">• 请求 7 阶段状态机与 Bulk Transfer RDMA</text>
        <text x="10" y="76" class="box-sub">• NRS 网络请求调度器 (FIFO/CRRN/TBF)</text>
        <text x="10" y="94" font-size="8.5" fill="#f43f5e">⚡ 事故: Bulk 缓冲区对齐失配致死锁</text>
      </g>

      <!-- Ch 05: Recovery & AT -->
      <g transform="translate(285, 0)">
        <rect x="0" y="0" width="275" height="105" rx="6" fill="#0f172a"/>
        <rect x="0" y="0" width="275" height="105" rx="6" fill="rgba(120, 53, 15, 0.4)" stroke="#fb923c" stroke-width="1.5"/>
        <rect x="8" y="8" width="55" height="16" rx="3" fill="#c2410c"/>
        <text x="35" y="20" fill="#ffffff" class="box-tag" text-anchor="middle">第05章</text>
        <text x="70" y="21" class="box-title">自适应超时 (AT) 与重放自愈</text>
        <text x="10" y="42" class="box-sub">• Adaptive Timeouts 负载感知与 Early Reply 续命</text>
        <text x="10" y="58" class="box-sub">• 事务重放 (Transaction Replay) 零丢失</text>
        <text x="10" y="76" class="box-sub">• 锁重放 (Lock Replay) 重建分布式内存状态</text>
        <text x="10" y="94" font-size="8.5" fill="#f43f5e">⚡ 事故: 突发宕机后 Early Reply 续命失败</text>
      </g>

      <!-- Ch 06: LDLM Locks -->
      <g transform="translate(575, 0)">
        <rect x="0" y="0" width="280" height="105" rx="6" fill="#0f172a"/>
        <rect x="0" y="0" width="280" height="105" rx="6" fill="rgba(120, 53, 15, 0.4)" stroke="#fb923c" stroke-width="1.5"/>
        <rect x="8" y="8" width="55" height="16" rx="3" fill="#c2410c"/>
        <text x="35" y="20" fill="#ffffff" class="box-tag" text-anchor="middle">第06章</text>
        <text x="70" y="21" class="box-title">LDLM 分布式锁与意图锁机制</text>
        <text x="10" y="42" class="box-sub">• 四大锁类型: Plain / Extent / Ibits / Flock</text>
        <text x="10" y="58" class="box-sub">• 意图锁 (Intent Lock): 申请与执行合二为一</text>
        <text x="10" y="76" class="box-sub">• 异步系统陷阱 (AST): Blocking &amp; Completion</text>
        <text x="10" y="94" font-size="8.5" fill="#f43f5e">⚡ 事故: 分布式范围锁 AB-BA 逆序死锁</text>
      </g>
    </g>
  </g>

  <!-- ==================== RIGHT COLUMN: OBD FOUNDATION (卷三) ==================== -->
  <g transform="translate(1300, 255)">
    <rect x="0" y="0" width="340" height="570" rx="10" fill="rgba(76, 29, 149, 0.15)" stroke="#a78bfa" stroke-width="1.2" stroke-dasharray="6,4"/>
    <text x="16" y="24" fill="#a78bfa" class="region-title">【第三卷：对象存储抽象与基础】</text>

    <!-- Ch 07: OBD Model -->
    <g transform="translate(15, 45)">
      <rect x="0" y="0" width="310" height="145" rx="6" fill="#0f172a"/>
      <rect x="0" y="0" width="310" height="145" rx="6" fill="rgba(76, 29, 149, 0.3)" stroke="#a78bfa" stroke-width="1.5"/>
      <rect x="10" y="10" width="55" height="18" rx="3" fill="#6d28d9"/>
      <text x="37" y="23" fill="#ffffff" class="box-tag" text-anchor="middle">第07章</text>
      <text x="75" y="24" class="box-title">OBD 驱动模型与设备抽象</text>
      <text x="10" y="50" class="box-sub">• obd_device 虚表与面向对象驱动多态</text>
      <text x="10" y="68" class="box-sub">• 客户端与服务端三元组配对连接 (import/export)</text>
      <text x="10" y="86" class="box-sub">• 分层驱动栈生命周期 (setup / cleanup)</text>
      <text x="10" y="108" font-size="8.5" fill="#f43f5e">⚡ 事故复盘: 僵尸设备未清导致卸载挂死</text>
      <text x="10" y="126" font-size="8.5" fill="#34d399">✓ 调优: 驱动实例隔离与引用追踪</text>
    </g>

    <!-- Ch 08: lu_object -->
    <g transform="translate(15, 205)">
      <rect x="0" y="0" width="310" height="165" rx="6" fill="#0f172a"/>
      <rect x="0" y="0" width="310" height="165" rx="6" fill="rgba(76, 29, 149, 0.3)" stroke="#a78bfa" stroke-width="1.5"/>
      <rect x="10" y="10" width="55" height="18" rx="3" fill="#6d28d9"/>
      <text x="37" y="23" fill="#ffffff" class="box-tag" text-anchor="middle">第08章</text>
      <text x="75" y="24" class="box-title">lu_object 统一对象栈状态机</text>
      <text x="10" y="50" class="box-sub">• lu_device / lu_object / lu_context 分层架构</text>
      <text x="10" y="68" class="box-sub">• 跨设备切片指针聚合与多态虚表调度</text>
      <text x="10" y="86" class="box-sub">• 内存分层分配与并发锁防护体系</text>
      <text x="10" y="104" class="box-sub">• 两阶段提交下层切片安全回滚机制</text>
      <text x="10" y="126" font-size="8.5" fill="#f43f5e">⚡ 事故复盘: 复合切片分配失败回滚漏洞</text>
      <text x="10" y="144" font-size="8.5" fill="#34d399">✓ 调优: 对象堆栈缓存深度与锁分段优化</text>
    </g>

    <!-- Ch 09: FID Concept -->
    <g transform="translate(15, 385)">
      <rect x="0" y="0" width="310" height="165" rx="6" fill="#0f172a"/>
      <rect x="0" y="0" width="310" height="165" rx="6" fill="rgba(76, 29, 149, 0.3)" stroke="#a78bfa" stroke-width="1.5"/>
      <rect x="10" y="10" width="55" height="18" rx="3" fill="#6d28d9"/>
      <text x="37" y="23" fill="#ffffff" class="box-tag" text-anchor="middle">第09章</text>
      <text x="75" y="24" class="box-title">128位 FID 全局寻址与 LLOG</text>
      <text x="10" y="50" class="box-sub">• struct lu_fid (Sequence + OID + Version)</text>
      <text x="10" y="68" class="box-sub">• FLD (FID Location Database) 分布式位置数据库</text>
      <text x="10" y="86" class="box-sub">• Sequence Controller / Client 动态号段批发</text>
      <text x="10" y="104" class="box-sub">• LLOG: 高效可靠的二进制变长事务日志记录</text>
      <text x="10" y="126" font-size="8.5" fill="#f43f5e">⚡ 事故复盘: FLD 缓存穿透引发全网元数据风暴</text>
      <text x="10" y="144" font-size="8.5" fill="#34d399">✓ 调优: 号段缓存预取策略与 FLD 扩容</text>
    </g>
  </g>

  <!-- ==================== LOWER-CENTER: METADATA vs DATA TWIN TOWERS (卷四 & 卷五) ==================== -->
  <!-- TWIN 1: METADATA SUBSYSTEM (卷四) -->
  <g transform="translate(390, 540)">
    <rect x="0" y="0" width="435" height="285" rx="10" fill="rgba(6, 78, 59, 0.15)" stroke="#34d399" stroke-width="1.2" stroke-dasharray="6,4"/>
    <text x="16" y="24" fill="#34d399" class="region-title">【第四卷：元数据集群与分布式命名空间】 (MDS/MDT)</text>

    <!-- Ch 10: MDT Internals -->
    <g transform="translate(12, 38)">
      <rect x="0" y="0" width="410" height="70" rx="5" fill="#0f172a"/>
      <rect x="0" y="0" width="410" height="70" rx="5" fill="rgba(6, 78, 59, 0.35)" stroke="#34d399" stroke-width="1.2"/>
      <rect x="8" y="8" width="55" height="16" rx="3" fill="#059669"/>
      <text x="35" y="20" fill="#ffffff" class="box-tag" text-anchor="middle">第10章</text>
      <text x="70" y="21" class="box-title">MDS/MDT 核心处理管线与意向驱动</text>
      <text x="10" y="42" class="box-sub">• 只读与修改型 (MDS_REINT) 双轨处理流水线</text>
      <text x="10" y="58" class="box-sub">• mdt_intent_policy 意向锁调度与 Nodemap 安全租户映射</text>
    </g>

    <!-- Ch 11: DNE Architecture -->
    <g transform="translate(12, 118)">
      <rect x="0" y="0" width="410" height="70" rx="5" fill="#0f172a"/>
      <rect x="0" y="0" width="410" height="70" rx="5" fill="rgba(6, 78, 59, 0.35)" stroke="#34d399" stroke-width="1.2"/>
      <rect x="8" y="8" width="55" height="16" rx="3" fill="#059669"/>
      <text x="35" y="20" fill="#ffffff" class="box-tag" text-anchor="middle">第11章</text>
      <text x="70" y="21" class="box-title">DNE 分布式多元数据与目录分片架构</text>
      <text x="10" y="42" class="box-sub">• DNE 1/2: 远程目录挂载、子树切分与分片哈希条带 (DoM)</text>
      <text x="10" y="58" class="box-sub">• 跨 MDT 跨节点 Rename 分布式两阶段事务一致性保障</text>
    </g>

    <!-- Ch 12: Changelogs -->
    <g transform="translate(12, 198)">
      <rect x="0" y="0" width="410" height="72" rx="5" fill="#0f172a"/>
      <rect x="0" y="0" width="410" height="72" rx="5" fill="rgba(6, 78, 59, 0.35)" stroke="#34d399" stroke-width="1.2"/>
      <rect x="8" y="8" width="55" height="16" rx="3" fill="#059669"/>
      <text x="35" y="20" fill="#ffffff" class="box-tag" text-anchor="middle">第12章</text>
      <text x="70" y="21" class="box-title">Changelogs 变更追踪与 HSM 异构联动</text>
      <text x="10" y="42" class="box-sub">• 内核审计日志生成、变长结构体封装与消费者位点管理</text>
      <text x="10" y="58" class="box-sub">• HSM (分层存储管理): 磁带库/对象存储自动归档与动态拉回</text>
    </g>
  </g>

  <!-- TWIN 2: DATA STORAGE SUBSYSTEM (卷五) -->
  <g transform="translate(845, 540)">
    <rect x="0" y="0" width="435" height="285" rx="10" fill="rgba(76, 29, 149, 0.15)" stroke="#8b5cf6" stroke-width="1.2" stroke-dasharray="6,4"/>
    <text x="16" y="24" fill="#a78bfa" class="region-title">【第五卷：并发数据 I/O 引擎与布局】 (OSS/OST)</text>

    <!-- Ch 13: OST & OSD -->
    <g transform="translate(12, 38)">
      <rect x="0" y="0" width="410" height="70" rx="5" fill="#0f172a"/>
      <rect x="0" y="0" width="410" height="70" rx="5" fill="rgba(76, 29, 149, 0.35)" stroke="#8b5cf6" stroke-width="1.2"/>
      <rect x="8" y="8" width="55" height="16" rx="3" fill="#7c3aed"/>
      <text x="35" y="20" fill="#ffffff" class="box-tag" text-anchor="middle">第13章</text>
      <text x="70" y="21" class="box-title">OST 与 OSD 后端存储落盘引擎</text>
      <text x="10" y="42" class="box-sub">• OFD (Object Filter Device) 并发读写与预分配中枢</text>
      <text x="10" y="58" class="box-sub">• osd-ldiskfs (极致性能) 与 osd-zfs (企业级校验快照) 双后端</text>
    </g>

    <!-- Ch 14: Striping & PFL/FLR -->
    <g transform="translate(12, 118)">
      <rect x="0" y="0" width="410" height="70" rx="5" fill="#0f172a"/>
      <rect x="0" y="0" width="410" height="70" rx="5" fill="rgba(76, 29, 149, 0.35)" stroke="#8b5cf6" stroke-width="1.2"/>
      <rect x="8" y="8" width="55" height="16" rx="3" fill="#7c3aed"/>
      <text x="35" y="20" fill="#ffffff" class="box-tag" text-anchor="middle">第14章</text>
      <text x="70" y="21" class="box-title">条带化演进、PFL 阶梯布局与 FLR 镜像</text>
      <text x="10" y="42" class="box-sub">• 静态条带化 (RAID-0) 局限与 PFL (渐进式复合条带) 革命</text>
      <text x="10" y="58" class="box-sub">• DoM (数据内联至 MDT) 与 FLR (文件级多副本冗余镜像)</text>
    </g>

    <!-- Ch 15: IO Pipeline & Grant -->
    <g transform="translate(12, 198)">
      <rect x="0" y="0" width="410" height="72" rx="5" fill="#0f172a"/>
      <rect x="0" y="0" width="410" height="72" rx="5" fill="rgba(76, 29, 149, 0.35)" stroke="#8b5cf6" stroke-width="1.2"/>
      <rect x="8" y="8" width="55" height="16" rx="3" fill="#7c3aed"/>
      <text x="35" y="20" fill="#ffffff" class="box-tag" text-anchor="middle">第15章</text>
      <text x="70" y="21" class="box-title">分布式 IO 流水线与缓存 Grant 机制</text>
      <text x="10" y="42" class="box-sub">• 4MB 超大物理 RPC 聚合 (RPC Chunking &amp; Packing)</text>
      <text x="10" y="58" class="box-sub">• Grant 信用额度防穿透超卖体系、Extent Tax 与 Direct IO</text>
    </g>
  </g>

  <!-- ==================== BOTTOM BANNER: PRODUCTION & AI FRONTIERS (卷八) ==================== -->
  <g transform="translate(40, 840)">
    <rect x="0" y="0" width="1600" height="205" rx="10" fill="rgba(59, 130, 246, 0.12)" stroke="#60a5fa" stroke-width="1.2" stroke-dasharray="6,4"/>
    <text x="20" y="24" fill="#60a5fa" class="region-title">【第八卷：生产调优、容灾救援与前沿演进】 PRODUCTION ENGINEERING &amp; FUTURE FRONTIERS</text>

    <!-- Ch 22: Performance Tuning 50 -->
    <g transform="translate(20, 38)">
      <rect x="0" y="0" width="500" height="150" rx="6" fill="#0f172a"/>
      <rect x="0" y="0" width="500" height="150" rx="6" fill="rgba(59, 130, 246, 0.25)" stroke="#60a5fa" stroke-width="1.5"/>
      <rect x="10" y="10" width="55" height="18" rx="3" fill="#2563eb"/>
      <text x="37" y="23" fill="#ffffff" class="box-tag" text-anchor="middle">第22章</text>
      <text x="75" y="24" class="box-title">全栈性能调优 50 条黄金法则</text>
      <text x="10" y="52" class="box-sub">① 网络流控: LNet 信用配额 / peer_credits / Multi-Rail 聚合</text>
      <text x="10" y="70" class="box-sub">② 元数据面: MDS reint 线程亲和 / Inode 缓存配额 / DNE 目录哈希</text>
      <text x="10" y="88" class="box-sub">③ 数据存储面: max_pages_per_rpc 4MB 黄金尺寸 / dirty_mb 水位控制</text>
      <text x="10" y="106" class="box-sub">④ 客户端优化: max_read_ahead_mb 顺序预读 / Stride 智能侦测</text>
      <text x="10" y="128" font-size="9" fill="#34d399">✓ 交付物: 全链路 50 条可直接投产的 sysctl / lctl 调优速查矩阵表</text>
    </g>

    <!-- Ch 23: Disaster Recovery SOP -->
    <g transform="translate(540, 38)">
      <rect x="0" y="0" width="520" height="150" rx="6" fill="#0f172a"/>
      <rect x="0" y="0" width="520" height="150" rx="6" fill="rgba(136, 19, 55, 0.35)" stroke="#fb7185" stroke-width="1.5"/>
      <rect x="10" y="10" width="55" height="18" rx="3" fill="#e11d48"/>
      <text x="37" y="23" fill="#ffffff" class="box-tag" text-anchor="middle">第23章</text>
      <text x="75" y="24" class="box-title">真实生产灾难排查与应急救援手册</text>
      <text x="10" y="52" class="box-sub">① 重大事故 1: 网络分区重试风暴引发 MDT 内存雪崩 (100% 根因排查)</text>
      <text x="10" y="70" class="box-sub">② 重大事故 2: MDT 坏道物理只读，用 debugfs 抢救百亿目录树全纪实</text>
      <text x="10" y="88" class="box-sub">③ 终极容灾: OI Scrub (对象索引擦洗器) 自动侦测并修补 FID 孤儿对象</text>
      <text x="10" y="106" class="box-sub">④ 内核分析: lctl dk 内存转储与 Crash Dump 诊断 panic 堆栈</text>
      <text x="10" y="128" font-size="9" fill="#f43f5e">⚡ 核心交付: 生产止血四步黄金应急 SOP 与抢修工具集</text>
    </g>

    <!-- Ch 24: AI Frontiers & DAOS -->
    <g transform="translate(1080, 38)">
      <rect x="0" y="0" width="500" height="150" rx="6" fill="#0f172a"/>
      <rect x="0" y="0" width="500" height="150" rx="6" fill="rgba(20, 184, 166, 0.25)" stroke="#2dd4bf" stroke-width="1.5"/>
      <rect x="10" y="10" width="55" height="18" rx="3" fill="#0d9488"/>
      <text x="37" y="23" fill="#ffffff" class="box-tag" text-anchor="middle">第24章</text>
      <text x="75" y="24" class="box-title">面向 AI 万卡时代的演进与前沿架构</text>
      <text x="10" y="52" class="box-sub">① 大模型训练痛点: 万卡 Checkpoint 爆发与海量 Token 读取瓶颈</text>
      <text x="10" y="70" class="box-sub">② Lustre GDS (GPU Direct Storage): 绕过 CPU 内存，NVMe 直通显存</text>
      <text x="10" y="88" class="box-sub">③ 架构横评: Lustre (成熟生态/超大规模) vs DAOS (全用户态/PMEM/元数据巅峰)</text>
      <text x="10" y="106" class="box-sub">④ 前沿演进: Lustre 客户端零拷贝、RDMA 软硬件卸载与云原生 CSI</text>
      <text x="10" y="128" font-size="9" fill="#38bdf8">🚀 展望: 构建支撑十万卡超级算力池的下一代统一存储基座</text>
    </g>
  </g>

  <!-- ==================== FOOTER & LEGEND ==================== -->
  <g transform="translate(40, 1065)">
    <!-- Legend Items -->
    <g transform="translate(0, 5)">
      <text x="0" y="14" fill="#64748b" font-size="10" font-weight="600">图例说明:</text>

      <rect x="70" y="3" width="12" height="12" rx="2" fill="rgba(8,51,68,0.4)" stroke="#22d3ee"/>
      <text x="88" y="13" fill="#94a3b8" font-size="9.5">客户端与POSIX层 (卷六)</text>

      <rect x="235" y="3" width="12" height="12" rx="2" fill="rgba(120,53,15,0.4)" stroke="#fb923c"/>
      <text x="253" y="13" fill="#94a3b8" font-size="9.5">通信与并发控制 (卷一/二)</text>

      <rect x="415" y="3" width="12" height="12" rx="2" fill="rgba(76,29,149,0.4)" stroke="#a78bfa"/>
      <text x="433" y="13" fill="#94a3b8" font-size="9.5">对象抽象与寻址 (卷三/五)</text>

      <rect x="605" y="3" width="12" height="12" rx="2" fill="rgba(6,78,59,0.4)" stroke="#34d399"/>
      <text x="623" y="13" fill="#94a3b8" font-size="9.5">元数据集群DNE (卷四)</text>

      <rect x="770" y="3" width="12" height="12" rx="2" fill="rgba(136,19,55,0.4)" stroke="#fb7185"/>
      <text x="788" y="13" fill="#94a3b8" font-size="9.5">管控与高可用HA (卷七)</text>

      <rect x="940" y="3" width="12" height="12" rx="2" fill="rgba(59,130,246,0.3)" stroke="#60a5fa"/>
      <text x="958" y="13" fill="#94a3b8" font-size="9.5">调优容灾与前沿 (卷八)</text>

      <line x1="1100" y1="9" x2="1130" y2="9" stroke="#22d3ee" stroke-width="1.5" stroke-dasharray="3,3" marker-end="url(#arrow-cyan)"/>
      <text x="1138" y="13" fill="#94a3b8" font-size="9.5">RPC 控制流 / 意向协商</text>

      <line x1="1280" y1="9" x2="1310" y2="9" stroke="#a78bfa" stroke-width="2" marker-end="url(#arrow-violet)"/>
      <text x="1318" y="13" fill="#94a3b8" font-size="9.5">Bulk RDMA 极速数据流</text>
    </g>

    <!-- Right info -->
    <text x="1600" y="19" fill="#475569" font-size="9.5" text-anchor="end">GitHub: https://github.com/lilinji/lustre-book | Lustre Architecture Team</text>
  </g>

</svg>
`;

const outputPath = path.resolve('architecture.svg');
fs.writeFileSync(outputPath, svg, 'utf8');
console.log(`[SUCCESS] 全局架构图已成功生成至: ${outputPath}`);
console.log(`文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
