# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This is not a software project — it is the **source of a Chinese-language technical book** about the Lustre distributed filesystem, built with [mdBook](https://rust-lang.github.io/mdBook/). The "code" is Markdown prose, Mermaid and ASCII architecture diagrams, C source excerpts from the upstream [`lustre/lustre-release`](https://github.com/lustre/lustre-release) tree, and shell snippets (`lctl`/`lfs`) that must be syntactically plausible.

All book content is written in Simplified Chinese (zh-CN). Keep it that way when editing chapters.

- **Book title / metadata**: `book.toml`
- **Table of contents**: `SUMMARY.md` (8 parts, 24 chapters)
- **Chapters**: `part-0N-<slug>/NN-<slug>.md` (24 files)
- **Governance docs** (not rendered into the site): `docs/`

## Commands

All Node scripts are run from the repo root — each globs `.` and self-excludes `dist/`, `book/`, `node_modules/`, `.git/`. Node v26 and mdbook v0.5 are what this repo is developed against.

```bash
# Build the static site into dist/ (index.html, print.html, search index)
mdbook build

# Live preview while writing
mdbook serve

# Link gate — exits 1 on dead links or file:/// leakage. Run before committing.
node scripts/verify_links.mjs

# Audit: emit a per-file table of GitHub source links vs leftover file:/// links
node scripts/report_links_audit.mjs

# Printable scan for file:/// or d:/lustre-release paths in any Markdown file (reports only, always exits 0)
node scripts/check_all_links.mjs

# Word-count / code-line / per-chapter budget audit, compared against docs/page-allocation.md
node scripts/count_chars.mjs

# Export a print-quality PDF via headless Chromium/Edge
node scripts/export_pdf.mjs
```

There is no test suite, linter, or CI config. `verify_links.mjs` and `mdbook build` are the de facto gates.

### PDF export notes

`scripts/export_pdf.mjs` runs `mdbook build` itself if `dist/print.html` is absent, then drives headless Edge/Chrome (`--print-to-pdf`) over that file with no header/footer. It names the output from the `title` in `book.toml`, replacing `[ \ / : * ? " < > |]` with `_`.

If the target PDF is **locked by a PDF reader**, the script cannot rename over it and silently writes `<title>-latest.pdf` instead, printing a note. This has already happened in this repo — both `Lustre_分布式文件系统：...pdf` and `...-latest.pdf` exist at the root, and the `-latest` one is the newer build. Check which file you actually produced rather than assuming the primary name is current. PDFs are gitignored.

The exporter passes `--virtual-time-budget=30000` and this is **load-bearing, not decoration**. `--print-to-pdf` does not wait for async JS: a page whose Mermaid render is delayed by 3 s loses its diagrams from the PDF entirely while still producing a plausible-looking file (verified — same book, 1 page instead of 8 on a probe page). The virtual time budget fast-forwards pending timers so every diagram is laid out before the snapshot. Do not remove it.

## Content architecture and conventions

### mdBook wiring

`book.toml` sets `src = "."` and `create-missing = false`. Two consequences:

- **A file listed in `SUMMARY.md` must already exist, or the build fails.** Add the file first, then the summary entry.
- Every `.md` file in the tree is a build candidate, but only those reachable from `SUMMARY.md` are rendered. Files under `docs/` are deliberately excluded from `SUMMARY.md` and therefore from the published site.

`SUMMARY.md` uses Part headings (`## 第一卷：…`) with per-chapter bullet entries. Chapter titles in the summary and the `# 第 N 章：…` H1 inside each file must stay in sync.

### Chapter anatomy

Chapters are long-form (7,000–15,000 Chinese characters each; see `docs/page-allocation.md` for the per-chapter budget). The recurring structure, which new or rewritten chapters are expected to follow:

1. H1 `# 第 N 章：<title>` (matches `SUMMARY.md`)
2. An optional opening blockquote listing 本章核心源码文件 — only 2 of 24 chapters have this, so treat it as optional style, not a requirement
3. Numbered `## N.M` sections, opening with a production-pain-point framing section
4. A 生产实战 section containing a 真实生产事故复盘 (postmortem narrative)
5. A `## N.M … Checklist` section — a `- [ ]` list of concrete operational steps; present in all 24 chapters
6. A 核心源码对照表 table mapping symptoms/error codes to source locations and remediation
7. `## N.M 本章小结`, ending with a relative Markdown link forward to the next chapter

Sections are numbered `N.M`. Note that **several chapters have a duplicated final section number** (e.g. two `## 6.8`, two `## 14.7`, two `## 23.7`) where the 对照表 and 小结 sections collide. If you add a section, check the numbering of the sections after it.

### Link conventions (the main correctness hazard)

Two link classes coexist, and mixing them up breaks the published site or the GitHub mirror:

| Target | Form |
| --- | --- |
| Upstream Lustre source | absolute `https://github.com/lustre/lustre-release/blob/master/<path>#L<line>` |
| Another chapter in this book | relative path, e.g. `../part-05-data-storage/13-ost-osd.md` (optionally `#N.M-…`) |
| External | ordinary `https://…` |

**Never use `file:///` absolute local paths.** `verify_links.mjs` exits 1 on any that appear, and they are meaningless once the repo is on GitHub. `scripts/convert_links_to_github.mjs` was the one-time migration that rewrote them — it is idempotent and now a no-op on a clean tree; you normally do not need to run it.

Relative links are resolved from the containing file's directory, so a link from `part-03-…/07-obd-model.md` to chapter 13 must include the `../part-05-…/` prefix.

### Diagrams: Mermaid vs ASCII

The 7 flow/topology diagrams are ````mermaid` fences (README + `part-01-foundation`); everything else that is a diagram is an ASCII ````text` block, and **every non-diagram plain fence is tagged ````text`** so it renders consistently. Don't reintroduce bare ``` fences.

GitHub renders ````mermaid` natively. mdBook does not — it has no Mermaid preprocessor here and `mdbook-mermaid`/`cargo` are not installed. The bridge is two vendored files wired through `additional-js`:

- `js/mermaid.min.js` — Mermaid 11, committed (not a CDN link) so builds and PDF export work offline
- `js/mermaid-init.js` — rewrites mdBook's `<pre><code class="language-mermaid">` into `<div class="mermaid">` and calls `mermaid.run()`; it also re-renders on mdBook theme switches so diagrams stay legible in the dark themes

**Mermaid layout gotcha**: `direction LR` inside a `subgraph` is silently ignored, and two sibling nodes with no edges between them stack vertically into a narrow, badly-wrapped column. For a "container holds N parallel things" diagram, model the container as a **parent node with one arrow per child** (`flowchart TD`); Mermaid then lays the children out side by side. This is what the CPT and Tracefile diagrams do.

Keep memory-layout and struct field dumps as ASCII — Mermaid cannot express byte offsets, so converting them loses information.

### Math on GitHub (the other correctness hazard)

Two constructs render fine under mdBook/PDF but break on GitHub, because GitHub parses the Markdown with CommonMark *before* MathJax runs:

- **`\_`, `\%`, `\{`, `\}` inside `$…$`.** CommonMark consumes the backslash as a punctuation escape and hands MathJax `\text{threads_max}` → `'_' allowed only in math mode`. Never write `\text{a\_b}`. Use a math-mode subscript instead: `\text{a}_\text{b}` — valid in both renderers.
- **A bare `%` in inline math**, which TeX swallows as a comment. Write the literal `±20%` rather than `$\pm 20\%$` when the math markup isn't load-bearing.

When auditing formulas, search only *inside* math spans. A plain `grep '\_'` is useless here — this repo has thousands of literal `\_` in C and shell code blocks that are correct and must stay. Extract the `$…$` / `$$…$$` spans first, then flag `\_` / `\%` / `\{` / `\}` within them.

### Governance docs

`docs/` holds the contracts the book is held to. Update them when the book's shape changes, not just the prose:

- `docs/page-allocation.md` — per-chapter word budgets and actual counts; regenerate the numbers with `node scripts/count_chars.mjs`
- `docs/reader-personas.md` — target readers, the "免解释" prerequisite boundary, and exit criteria. Use it to decide how much background a new explanation owes the reader
- `docs/release-readiness-record.md` — the 4-gate release checklist (freeze → link/language audit → `mdbook build` → PDF export) with its checkboxes already marked complete for v1.0.0-RC1

### Prose standards captured in the release record

Gate 1 of `docs/release-readiness-record.md` records the editorial rules the manuscript was audited against — follow these when writing new prose:

- No buzzwords or conclusion-stealing filler: 显然, 很清楚, 真正意义上, 闭环, etc.
- Chinese full-width corner brackets `「」` for quoted terms, 盘古之白 spacing between Chinese and Latin/numerals
- Every chapter carries both a Checklist and a postmortem (currently 19 of 24 have an explicit 复盘 section; the rest cover remediation inline)

## Working with upstream source references

Every source citation points at the `master` branch of `lustre/lustre-release` (193 such links across the book), not at a pinned commit. When you edit a citation's line number, verify it still resolves — the book's stated baseline is Lustre 2.16+ / commit `47638add`, but `master` moves. Prefer linking to a function or file over a bare line anchor when the exact line is not load-bearing.
