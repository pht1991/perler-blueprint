import type { Blueprint } from '../core/types';
import { PALETTE_BY_ID } from '../data/palettes';

// 「手机打开」编码端：把当前图纸编码为小程序可导入的链接
// 格式 v2（与小程序 utils/web-link.js 保持一致，两端注释互指）：
//   v1: #p=1.<w>.<h>.<paletteId>.<色号表>.<rle>
//   v2: #p=2.<w>.<h>.<paletteId>.<名称>.<色号表>.<rle>   ← 带图纸名称
//   色号表：图纸中出现过的色号用 '-' 连接（最多 34 个，索引引用表位置）
//   rle：行优先行程编码，每段 3 字符 = 表内索引(36 进制 1 字符，空格用 z) + 段长(36 进制 2 字符，上限 1295)
//   名称：自定义转义——保留 [0-9a-zA-Z-]，其余字符按 UTF-16 码元转 %XXXX（4 位大写十六进制），
//         保证 payload 字符集始终为 [0-9a-zA-Z.%-]
// 解码端在 perler-miniprogram utils/web-link.js decodeLinkPayload
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
const RUN_MAX = 1295;
const TITLE_MAX = 24;
const SITE = 'https://perler.phtbyte.com/';

/** 名称转义（encode） */
function escTitle(t: string | undefined): string {
  return String(t || '').slice(0, TITLE_MAX).replace(/[^0-9a-zA-Z\-]/g, (ch) => {
    const h = ch.charCodeAt(0).toString(16).toUpperCase();
    return '%' + '000'.slice(h.length - 1) + h;
  });
}

/** 返回链接；调色板缺失或色号超过 34 种（需合并颜色）返回 null；title 为可选图纸名称 */
export function encodeBlueprintLink(bp: Blueprint, title?: string): string | null {
  const pal = PALETTE_BY_ID[bp.paletteId];
  if (!pal) return null;
  const valid = new Set(pal.colors.map((c) => c.code));
  const codeSet: string[] = [];
  const seen = new Set<string>();
  for (const c of bp.codes) {
    if (c && !seen.has(c)) {
      if (!valid.has(c) || codeSet.length >= 34) return null;
      seen.add(c);
      codeSet.push(c);
    }
  }
  const idxOf = new Map(codeSet.map((c, i) => [c, B36[i]]));
  const codes = bp.codes;
  const n = codes.length;
  let rle = '';
  let i = 0;
  while (i < n) {
    const ch = codes[i] ? idxOf.get(codes[i]!) : 'z';
    let run = 1;
    while (i + run < n && run < RUN_MAX) {
      const nx = codes[i + run] ? idxOf.get(codes[i + run]!) : 'z';
      if (nx !== ch) break;
      run++;
    }
    rle += ch + B36[Math.floor(run / 36)] + B36[run % 36];
    i += run;
  }
  return SITE + '#p=2.' + bp.w + '.' + bp.h + '.' + bp.paletteId + '.' + escTitle(title) + '.' + codeSet.join('-') + '.' + rle;
}
