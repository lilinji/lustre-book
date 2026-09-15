#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function glob(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    if (['dist', 'node_modules', '.git', 'book'].includes(d.name)) return [];
    const full = path.join(dir, d.name);
    return d.isDirectory() ? glob(full) : [full];
  });
}

const files = glob('.').filter(f => f.endsWith('.md'));
let findings = [];

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('file:///') || line.includes('d:/lustre-release') || line.includes('d:\\lustre-release')) {
      findings.push({ file: f, lineNum: idx + 1, line: line.trim() });
    }
  });
}

console.log('Total matches found in markdown files:', findings.length);
findings.forEach(item => {
  console.log(`${item.file}:${item.lineNum} -> ${item.line}`);
});
