#!/usr/bin/env node
/**
 * convert_links_to_github.mjs
 * 
 * 将所有本地 file:/// 链接进行工程化重构：
 * 1. 源码链接：转换为 GitHub 官方仓库链接 (https://github.com/lustre/lustre-release/blob/master/...)
 * 2. 跨章节链接：转换为标准 Markdown 相对路径 (如 ../part-01-foundation/01-libcfs.md)
 */

import fs from 'fs';
import path from 'path';

const GITHUB_PREFIX = 'https://github.com/lustre/lustre-release/blob/master/';
const BOOK_ROOT = path.resolve('.');  // d:\lustre-release\lustre-book

function glob(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    if (['dist', 'node_modules', '.git', 'book'].includes(d.name)) return [];
    const full = path.join(dir, d.name);
    return d.isDirectory() ? glob(full) : [full];
  });
}

const allMdFiles = glob('.').filter(f => f.endsWith('.md'));
let totalSourceConverted = 0;
let totalInternalConverted = 0;
let modifiedFilesCount = 0;

for (const file of allMdFiles) {
  const content = fs.readFileSync(file, 'utf8');
  let modified = false;

  // 正则匹配所有以 file:/// 开头或包含 file:///d:/lustre-release 的 markdown 链接
  // 例如 [text](file:///d:/lustre-release/...)
  const newContent = content.replace(/\[([^\]]*)\]\((file:\/\/\/d:\/lustre-release[^\)]*)\)/gi, (match, linkText, url) => {
    // 处理路径斜杠
    const cleanUrl = url.replace(/\\/g, '/');

    // 情况 1: 书内章节链接 file:///d:/lustre-release/lustre-book/...
    if (cleanUrl.includes('/lustre-book/')) {
      const idx = cleanUrl.indexOf('/lustre-book/');
      const afterBook = cleanUrl.slice(idx + '/lustre-book/'.length); // 如 part-01-foundation/01-libcfs.md#section
      
      const [targetRelPath, anchor] = afterBook.split('#');
      const targetAbsPath = path.resolve(BOOK_ROOT, targetRelPath);
      const currentDir = path.dirname(path.resolve(file));
      
      let relPath = path.relative(currentDir, targetAbsPath).replace(/\\/g, '/');
      if (anchor) {
        relPath += '#' + anchor;
      }
      
      totalInternalConverted++;
      modified = true;
      return `[${linkText}](${relPath})`;
    }

    // 情况 2: 指向仓库根目录 file:///d:/lustre-release
    if (cleanUrl === 'file:///d:/lustre-release' || cleanUrl === 'file:///d:/lustre-release/') {
      totalSourceConverted++;
      modified = true;
      return `[${linkText}](https://github.com/lustre/lustre-release)`;
    }

    // 情况 3: 源码链接 file:///d:/lustre-release/<path>
    const matchPrefix = cleanUrl.match(/^file:\/\/\/d:\/lustre-release\/(.*)$/i);
    if (matchPrefix) {
      let codePath = matchPrefix[1];
      totalSourceConverted++;
      modified = true;
      return `[${linkText}](${GITHUB_PREFIX}${codePath})`;
    }

    return match;
  });

  if (modified) {
    fs.writeFileSync(file, newContent, 'utf8');
    modifiedFilesCount++;
    console.log(`[CONVERTED] ${file}`);
  }
}

console.log('====================================================');
console.log(`转换完成！`);
console.log(`修改文件数: ${modifiedFilesCount} 个`);
console.log(`源码链接转换为 GitHub 链接: ${totalSourceConverted} 处`);
console.log(`跨章节链接转换为相对路径: ${totalInternalConverted} 处`);
console.log('====================================================');
