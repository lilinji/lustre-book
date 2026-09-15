#!/usr/bin/env node
/**
 * verify_links.mjs - 扫描全书 SUMMARY.md 与所有 Markdown 正文内的超链接，检查死链
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

const allMdFiles = glob('.').filter(f => f.endsWith('.md'));
console.log(`[Link-Verifier] 开始扫描全书 ${allMdFiles.length} 个 Markdown 文档中的链接...`);

let deadLinksCount = 0;
let totalLinksCount = 0;

for (const file of allMdFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);

  // 匹配 Markdown 链接：[title](link)
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const rawLink = match[2].trim();
    totalLinksCount++;

    // 拦截违规本地 file:/// 路径
    if (rawLink.startsWith('file:///')) {
      console.error(`❌ 本地路径告警: 在 [${file}] 中发现本地绝对路径链接: ${rawLink} (上传至 GitHub 将失效，请转为 https://github.com/... 或相对路径)`);
      deadLinksCount++;
      continue;
    }

    // 忽略外部合法网络链接与页面内锚点
    if (rawLink.startsWith('http://') || rawLink.startsWith('https://') || rawLink.startsWith('#')) {
      continue;
    }

    // 处理内部相对路径
    const cleanLink = rawLink.split('#')[0]; // 去除页面内锚点
    if (!cleanLink) continue;

    const targetPath = path.resolve(dir, cleanLink);
    if (!fs.existsSync(targetPath)) {
      console.error(`❌ 死链告警: 在 [${file}] 中发现失效链接: ${rawLink} (解析为: ${targetPath})`);
      deadLinksCount++;
    }
  }
}

console.log('----------------------------------------------------');
console.log(`[Link-Verifier] 扫描完成！共检查链接: ${totalLinksCount} 个`);
if (deadLinksCount === 0) {
  console.log(`[Link-Verifier] ✅ 恭喜！全书 0 死链，所有相对引用均 100% 存在且可读！`);
} else {
  console.error(`[Link-Verifier] ❌ 警告：发现 ${deadLinksCount} 处死链，请优先修复！`);
  process.exit(1);
}
