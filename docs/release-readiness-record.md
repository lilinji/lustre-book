# 出版交付与发布门禁记录 (Release Readiness Record)

本记录用于跟踪《Lustre 分布式文件系统：内核架构、协议演进与工程实战》在打 Tag、版本交付与导出出版级 PDF 前的质量状态。

---

## 1. 发布候选基准信息 (Candidate Contract)

- **当前专著版本**：v1.0.0-RC1
- **目标载体**：GitBook / mdBook 静态站点 + 出版级 A4/Letter 高保真 PDF
- **主源码仓库**：`lustre-release/lustre-book`
- **对应内核版本**：Lustre 2.16+ (Linux Kernel 5.x/6.x)

---

## 2. 四级质量门禁审查矩阵 (Gate Check Matrix)

### [ Gate 0: 版本冻结与结构基准 ]
- [x] 全书 8 卷 24 章拓扑结构已完全稳定，且 `SUMMARY.md` 索引 100% 对应物理文件。
- [x] 确立排除编译中间件产物（排除 `dist/` 与 `book/` 临时目录）。

### [ Gate 1: 文本规范、去水与死链扫描 ]
- [x] 运行 `node scripts/verify_links.mjs`，确保全书 Markdown 超链接 0 死链 (277 链接 100% 连通)。
- [x] 彻底消除本地绝对路径链接（禁止 `file:///`），全部源码引用转为 GitHub 官方仓库链接 (`https://github.com/lustre/lustre-release/blob/master/...`)，跨章节引用全部转为规范相对路径。
- [x] 消除 Buzzwords 抢结论词（`显然`、`很清楚`、`真正意义上`、`闭环` 等口语黑话）。
- [x] 检查全书 24 章是否均补齐：**「生产运维与调优 Checklist」** 与 **「真实生产事故复盘 (Postmortem)」** (已 100% 达成)。
- [x] 检查盘古之白（中英文空格）与中文直角引号 `「」` 规范。

### [ Gate 2: 静态网站全量编译验证 ]
- [x] 执行 `mdbook build`，实现 0 错误、0 配置告警。
- [x] 检查生成的 `dist/index.html` 与 `dist/print.html` 代码高亮、数学公式 MathJax 渲染正常。

### [ Gate 3: 出版级 PDF 导出与排版抽查 ]
- [x] 执行 `node scripts/export_pdf.mjs`，成功生成 `Lustre-Architecture-Book.pdf`。
- [x] 产物大小在 6MB ~ 15MB 之间，矢量图表清晰。
- [x] 随机抽查包含复杂 ASCII 架构拓扑图与 C 结构体代码块的章节，确认在 PDF 纸张分页处无断行破损。
