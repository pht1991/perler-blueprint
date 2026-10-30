import type { Blueprint } from '../core/types';
import { PALETTE_BY_ID } from '../data/palettes';

// 「复制电脑端链接」解码端（与小程序 utils/web-link.js 保持一致，两端注释互指）：
//   v1: 1.<w>.<h>.<paletteId>.<色号表>.<rle>
//   v2: 2.<w>.<h>.<paletteId>.<名称>.<色号表>.<rle>   ← 带图纸名称
//   色号表：'-' 连接的色号列表（对应小程序图纸中出现过的色号，≤34 个）
//   rle：行优先行程编码，每段 3 字符 = 表内索引(36 进制 1 字符，空格 z) + 段长(36 进制 2 字符)
//   名称：自定义转义——保留 [0-9a-zA-Z-]，其余字符按 UTF-16 码元转 %XXXX（4 位大写十六进制）
// 编码端在 perler-blueprint src/persist/linkExport.ts 与小程序 utils/web-link.js，三处必须保持一致
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
const RUN_MAX = 1295;
const TITLE_MAX = 24;

/** 名称还原（decode）：去掉控制字符、限长 */
function unescTitle(s: string): string {
  return s.replace(/%([0-9A-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/[\x00-\x1f]/g, '').trim().slice(0, TITLE_MAX);
}

/** 解析 #p= 后的 payload（兼容 v1/v2），失败返回 null */
export function decodeLinkPayload(raw: string): Blueprint | null {
  const parts = raw.split('.');
  const isV2 = parts[0] === '2';
  if (parts[0] !== '1' && !isV2) return null;
  if (parts.length < (isV2 ? 7 : 6)) return null;
  const w = Number(parts[1]);
  const h = Number(parts[2]);
  const paletteId = parts[3];
  const pal = PALETTE_BY_ID[paletteId];
  if (!w || !h || !pal || w * h < 1 || w * h > 40000) return null;
  const title = isV2 ? unescTitle(parts[4]) : '';
  const tableSeg = isV2 ? parts[5] : parts[4];
  const table = tableSeg ? tableSeg.split('-') : [];
  for (const c of table) if (!pal.colors.some((cc) => cc.code === c)) return null; // 调色板不含此色号 → 拒绝
  const rle = parts.slice(isV2 ? 6 : 5).join('.');
  if (rle.length % 3 !== 0) return null;
  const codes: (string | null)[] = [];
  for (let i = 0; i < rle.length; i += 3) {
    const idx = B36.indexOf(rle[i]);
    const hi = B36.indexOf(rle[i + 1]);
    const lo = B36.indexOf(rle[i + 2]);
    if (idx < 0 || hi < 0 || lo < 0) return null;
    const run = hi * 36 + lo;
    if (run < 1 || run > RUN_MAX) return null;
    const code = idx === 35 ? null : (table[idx] ?? null);
    for (let k = 0; k < run; k++) {
      if (codes.length >= w * h) return null;
      codes.push(code);
    }
  }
  if (codes.length !== w * h) return null;
  return { w, h, paletteId, codes, title: title || undefined };
}
