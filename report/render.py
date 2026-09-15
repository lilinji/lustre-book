#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
机构级技术架构白皮书渲染器 (Playwright + PyMuPDF)
基于 huashu-report 渲染管线定制：
- 无条件编译数据表与图表 (build.py)
- Playwright Chromium 像素级精确生成 A4 双面专业版式 PDF
- PyMuPDF 进行机械化质量与图表自检
"""

import asyncio
import os
import re
import subprocess
import sys
import fitz  # PyMuPDF

REPORT_TITLE = "Lustre 生产级分布式文件系统机构级技术架构白皮书 (Ringi 专著特刊)"

FOOTER_TPL = """
<div style="width:100%;font-size:7.5pt;color:#6b6b6b;
     font-family:'PingFang SC','Source Han Sans CN',-apple-system,sans-serif;
     padding:0 19mm;display:flex;justify-content:space-between;border-top:0.5pt solid #d0d0d0;padding-top:2mm;">
  <span style="font-weight:600;letter-spacing:0.02em;">Lustre Architecture Whitepaper · Ringi & Team</span>
  <span>第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页</span>
</div>"""

HEADER_TPL = """
<div style="width:100%;font-size:7pt;color:#999;
     font-family:'PingFang SC','Source Han Sans CN',-apple-system,sans-serif;
     padding:0 19mm;display:flex;justify-content:space-between;">
  <span>机构级技术架构深度研报</span>
  <span>CONFIDENTIAL & PEER REVIEWED</span>
</div>"""


async def render_pdf(html_path, pdf_path):
    from playwright.async_api import async_playwright
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()
        abs_url = "file:///" + os.path.abspath(html_path).replace("\\", "/")
        print(f"[*] 加载报告 HTML: {abs_url}")
        await page.goto(abs_url, wait_until="networkidle")
        # 等待字体与 SVG 完全就绪
        await page.wait_for_timeout(1000)
        
        print(f"[*] 正在渲染 A4 机构级 PDF...")
        await page.pdf(
            path=pdf_path,
            format="A4",
            print_background=True,
            display_header_footer=True,
            header_template=HEADER_TPL,
            footer_template=FOOTER_TPL,
            margin={
                "top": "16mm",
                "bottom": "16mm",
                "left": "18mm",
                "right": "18mm"
            }
        )
        await browser.close()
    print(f"[SUCCESS] PDF 渲染完成: {pdf_path}")


def selfcheck(pdf_path):
    """使用 PyMuPDF 进行机械化排版与严谨性自检"""
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    print(f"[*] 执行白皮书机械化排版自检 (共 {total_pages} 页)...")
    
    issues = []
    full_text = ""
    for i, page in enumerate(doc):
        text = page.get_text()
        full_text += f"\n--- Page {i+1} ---\n" + text
        
        # 检查页内字符量，避免出现空白断页
        if i > 0 and len(text.strip()) < 80:
            issues.append(f"第 {i+1} 页字符极少 ({len(text.strip())} 字符)，疑似异常分页")
            
    # 图表编号检查
    figs = re.findall(r"(?:Figure|图)\s+([\d.]+)", full_text)
    if not figs:
        issues.append("未检索到任何 Figure / 图 编号")
    else:
        print(f"[*] 发现图表编号: {sorted(list(set(figs)))} (共 {len(figs)} 处)")
    if len(set(figs)) != len(figs):
        dup = [f for f in set(figs) if figs.count(f) > 1]
        issues.append(f"发现重复的 Figure 编号: {dup}")
        
    # 占位符残留自检
    for pat in (r"\bTODO\b", r"\bTBD\b", r"\bXXX\b", r"\[待补\]", r"【待补】"):
        if re.search(pat, full_text):
            issues.append(f"正文检测到占位符: {pat}")
            
    # 实证标注引用检查
    e_cites = re.findall(r"\[E\d+\]", full_text)
    print(f"[*] 发现实证数据点引用: {len(e_cites)} 处 (覆盖 {sorted(list(set(e_cites)))})")
    
    if issues:
        print("[WARNING] 发现排版缺陷:")
        for issue in issues:
            print(f"  - {issue}")
    else:
        print("[SUCCESS] 机械化自检 100% 通过！无占位符、图表连续、分页健康。")


def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    builder = os.path.join(base_dir, "build.py")
    html_out = os.path.join(base_dir, "白皮书.html")
    pdf_out = os.path.join(base_dir, "Lustre_分布式文件系统_机构级技术架构白皮书.pdf")
    
    # 步骤 1: 始终无条件先 build 最新 HTML
    print("[*] 正在执行 build.py 生成白皮书 HTML...")
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    res = subprocess.run([sys.executable, builder], cwd=base_dir, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
    if res.returncode != 0:
        print(f"[ERROR] build.py 失败:\n{res.stderr}")
        sys.exit(1)
    if res.stdout:
        print(res.stdout.strip())
    
    # 步骤 2: Playwright 异步渲染 PDF
    asyncio.run(render_pdf(html_out, pdf_out))
    
    # 步骤 3: 机械化质量自检
    selfcheck(pdf_out)


if __name__ == "__main__":
    main()
