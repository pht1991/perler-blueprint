// 从原单文件 HTML 抽取 DEMO_DATA.palettes，生成 src/data/palettes.ts
// 用法: node scripts/extract-palettes.mjs <原文件> <输出ts>
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = resolve(process.argv[2]);
const out = resolve(process.argv[3]);
const html = readFileSync(src, 'utf8');

const key = '"palettes":';
const start = html.indexOf(key);
if (start < 0) throw new Error('palettes not found');
let i = start + key.length;
while (html[i] === ' ' || html[i] === '\n' || html[i] === '\t') i++;
if (html[i] !== '[') throw new Error('expected [');

// 括号匹配
let depth = 0, j = i, end = -1;
for (; j < html.length; j++) {
  const c = html[j];
  if (c === '[') depth++;
  else if (c === ']') { depth--; if (depth === 0) { end = j; break; } }
}
const arrText = html.slice(i, end + 1);
const palettes = JSON.parse(arrText);

// 精简字段
const clean = palettes.map((p) => ({
  id: p.id, label: p.label, group: p.group, sub: p.sub,
  colors: p.colors.map((c) => ({ code: c.code, name: c.name, rgb: c.rgb, hex: c.hex, lab: c.lab })),
}));

const ts = `// 自动生成（scripts/extract-palettes.mjs）。来源：原【拼豆专家】单文件 HTML 的 DEMO_DATA.palettes
import type { Palette } from '../core/types';

export const PALETTES: Palette[] = ${JSON.stringify(clean, null, 2)};

export const PALETTE_BY_ID: Record<string, Palette> = Object.fromEntries(
  PALETTES.map((p) => [p.id, p])
);
`;
writeFileSync(out, ts, 'utf8');
console.log(`wrote ${clean.length} palettes, ${clean.reduce((s, p) => s + p.colors.length, 0)} colors -> ${out}`);
