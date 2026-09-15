#!/usr/bin/env node
/**
 * export_pdf.mjs - 自动化将 mdBook 编译导出为出版级高保真 PDF
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// 1. 寻找可用的 Chromium 核心浏览器
const candidatePaths = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

let browserPath = candidatePaths.find(p => fs.existsSync(p));
if (!browserPath) {
  browserPath = 'msedge';
}

// 2. 检查 dist/print.html 是否存在，不存在则自动执行 mdbook build
const printHtmlPath = path.resolve('dist/print.html');
if (!fs.existsSync(printHtmlPath)) {
  console.log('[PDF-Exporter] 未发现 dist/print.html，正在自动执行 mdbook build...');
  const buildRes = spawnSync('mdbook', ['build'], { stdio: 'inherit' });
  if (buildRes.status !== 0) {
    console.error('[PDF-Exporter] 错误：mdbook build 失败！');
    process.exit(1);
  }
}

// 3. 读取书名或生成 PDF 名称
let pdfTitle = 'Lustre-Architecture-Book';
const bookTomlPath = path.resolve('book.toml');
if (fs.existsSync(bookTomlPath)) {
  const content = fs.readFileSync(bookTomlPath, 'utf8');
  const m = content.match(/title\s*=\s*"([^"]+)"/);
  if (m && m[1]) {
    pdfTitle = m[1].replace(/[\s\/:*?"<>|]/g, '_');
  }
}

const htmlFile = 'file:///' + printHtmlPath.replace(/\\/g, '/');
const tempPdfFile = path.resolve(`.tmp_print_${Date.now()}.pdf`);
const finalPdfFile = path.resolve(`${pdfTitle}.pdf`);

console.log('[PDF-Exporter] 待打印源文档:', htmlFile);
console.log('[PDF-Exporter] 目标输出文件:', finalPdfFile);
console.log('[PDF-Exporter] 正在通过 Chromium/Edge Headless 进行全本排版渲染...');

const args = [
  '--headless=new',
  '--disable-gpu',
  '--run-all-compositor-stages-before-draw',
  '--no-pdf-header-footer',
  `--print-to-pdf=${tempPdfFile}`,
  htmlFile
];

const result = spawnSync(browserPath, args, { stdio: 'inherit' });

if (fs.existsSync(tempPdfFile)) {
  let targetFile = finalPdfFile;
  try {
    // 尝试安全重命名覆盖
    if (fs.existsSync(finalPdfFile)) {
      fs.unlinkSync(finalPdfFile);
    }
    fs.renameSync(tempPdfFile, finalPdfFile);
  } catch (err) {
    // 如果主文件被阅读器占用锁定，则输出为 -latest.pdf
    targetFile = path.resolve(`${pdfTitle}-latest.pdf`);
    console.warn(`[PDF-Exporter] 提示：${finalPdfFile} 正被其他软件占用打开，已自动保存为最新版本：${targetFile}`);
    try {
      if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
      fs.renameSync(tempPdfFile, targetFile);
    } catch (e) {
      fs.copyFileSync(tempPdfFile, targetFile);
      fs.unlinkSync(tempPdfFile);
    }
  }

  const stats = fs.statSync(targetFile);
  console.log(`[PDF-Exporter] ✅ PDF 导出成功！\n文件路径: ${targetFile}\n文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
} else {
  console.error('[PDF-Exporter] ❌ PDF 导出失败，返回值:', result.status);
  process.exit(1);
}
