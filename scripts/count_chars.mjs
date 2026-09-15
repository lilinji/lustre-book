#!/usr/bin/env node
/**
 * count_chars.mjs - 统计全书字数、代码行数与预算达成率
 */

import fs from 'fs';
import path from 'path';

function glob(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    if (['dist', 'book', 'node_modules', '.git'].includes(d.name)) return [];
    const full = path.join(dir, d.name);
    return d.isDirectory() ? glob(full) : [full];
  });
}

const allFiles = glob('.').filter(f => f.endsWith('.md') && !f.includes('SUMMARY') && !f.includes('README'));
allFiles.sort();

console.log('========================================================================================');
console.log(' 《Lustre 分布式文件系统》各章节字数、代码行数与篇幅审计表');
console.log('========================================================================================');
console.log('章节相对路径                                    | 纯文字符 | 代码行数 | 事故复盘 | 调优Checklist');
console.log('------------------------------------------------+----------+----------+----------+--------------');

let grandTotalChars = 0;
let grandTotalCodeLines = 0;

for (const f of allFiles) {
  const content = fs.readFileSync(f, 'utf8');
  const pureChars = content.replace(/\s+/g, '').length;
  grandTotalChars += pureChars;

  const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
  let codeLines = 0;
  for (const b of codeBlocks) {
    codeLines += b.split('\n').length - 2;
  }
  grandTotalCodeLines += codeLines;

  const hasPostmortem = /事故复盘|生产事故|灾难排查|Postmortem/i.test(content) ? '✅ 有' : '❌ 无';
  const hasChecklist = /Checklist|检查清单|调优清单/i.test(content) ? '✅ 有' : '❌ 无';

  const rel = f.replace(/\\/g, '/').replace(/^\.\//, '').padEnd(47);
  console.log(`${rel} | ${String(pureChars).padStart(8)} | ${String(codeLines).padStart(8)} |   ${hasPostmortem}   |     ${hasChecklist}`);
}

console.log('========================================================================================');
console.log(`全书总计: 24 核心章节 | 纯汉字与英文非空字符: ${grandTotalChars.toLocaleString()} 字 | 核心代码: ${grandTotalCodeLines.toLocaleString()} 行`);
console.log(`折合标准技术专著印刷页数 (以 400字/页计): 约 ${(grandTotalChars / 400).toFixed(0)} 页`);
console.log('========================================================================================\n');
