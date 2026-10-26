import type { BeadColor, Blueprint, Palette, RGB } from './types';
import { deltaE, labOf } from './color';

export interface QuantizeOptions {
  palette: Palette;
  isEmpty: Uint8Array;       // 1 = 背景，输出 null
  maxColors?: number;        // 色数上限（预算档位）：超出则只保留用量最高的若干色
  dither?: boolean;          // Floyd–Steinberg 抖动
}

export interface QuantizeResult {
  codes: (string | null)[];
  used: Map<string, number>; // 色号 -> 用量
}

/** 把逐像素 RGB 量化到拼豆色板，输出每格色号数组。 */
export function quantizeGrid(
  raster: { w: number; h: number; data: Uint8ClampedArray },
  opts: QuantizeOptions
): QuantizeResult {
  const { w, h, data } = raster;
  const pal = opts.palette.colors;
  // 预计算 lab
  const labs = pal.map((c) => (c.lab ?? labOf(c.rgb)));

  const n = w * h;
  const px: (RGB | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (opts.isEmpty[i]) { px[i] = null; continue; }
    px[i] = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
  }

  // 抖动版本：在 RGB 上做误差扩散
  if (opts.dither) {
    const buf = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      if (px[i]) { buf[i * 3] = px[i]![0]; buf[i * 3 + 1] = px[i]![1]; buf[i * 3 + 2] = px[i]![2]; }
    }
    const nearestByRgb = (r: number, g: number, b: number): number => {
      let bi = 0, bd = Infinity;
      for (let k = 0; k < pal.length; k++) {
        const c = pal[k].rgb;
        const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
        if (d < bd) { bd = d; bi = k; }
      }
      return bi;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!px[i]) continue;
        const bi = nearestByRgb(buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]);
        const c = pal[bi].rgb;
        const er = buf[i * 3] - c[0], eg = buf[i * 3 + 1] - c[1], eb = buf[i * 3 + 2] - c[2];
        const spread = (dx: number, dy: number, f: number) => {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) return;
          const j = yy * w + xx; if (!px[j]) return;
          buf[j * 3] += er * f; buf[j * 3 + 1] += eg * f; buf[j * 3 + 2] += eb * f;
        };
        spread(1, 0, 7 / 16); spread(-1, 1, 3 / 16); spread(0, 1, 5 / 16); spread(1, 1, 1 / 16);
      }
    }
    // 把扩散后的 RGB 写回（用于后面统一取色号）
    for (let i = 0; i < n; i++) if (px[i]) px[i] = [clamp(buf[i * 3]), clamp(buf[i * 3 + 1]), clamp(buf[i * 3 + 2])];
  }

  // 取最近色（lab 距离）
  const codes: (string | null)[] = new Array(n);
  const used = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const p = px[i];
    if (!p) { codes[i] = null; continue; }
    let bi = 0, bd = Infinity;
    const pl = labOf(p);
    for (let k = 0; k < pal.length; k++) {
      const d = deltaE(pl, labs[k]);
      if (d < bd) { bd = d; bi = k; }
    }
    const code = pal[bi].code;
    codes[i] = code;
    used.set(code, (used.get(code) ?? 0) + 1);
  }

  // 色数上限：只保留用量最高的 N 色，其余重映射到保留色中最近者
  const max = opts.maxColors;
  if (max && used.size > max) {
    const top = [...used.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map((e) => e[0]);
    const keepLabs = top.map((code) => labs[pal.findIndex((c) => c.code === code)]);
    const newUsed = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const code = codes[i];
      if (code === null) continue;
      if (top.includes(code)) { newUsed.set(code, (newUsed.get(code) ?? 0) + 1); continue; }
      const pl = labOf(pal[pal.findIndex((c) => c.code === code)].rgb);
      let bi = 0, bd = Infinity;
      for (let k = 0; k < top.length; k++) {
        const d = deltaE(pl, keepLabs[k]);
        if (d < bd) { bd = d; bi = k; }
      }
      codes[i] = top[bi];
      newUsed.set(top[bi], (newUsed.get(top[bi]) ?? 0) + 1);
    }
    return { codes, used: newUsed };
  }

  return { codes, used };
}

function clamp(v: number) { return Math.max(0, Math.min(255, Math.round(v))); }

export function makeBlueprint(
  w: number, h: number, paletteId: string, codes: (string | null)[], sourceName?: string
): Blueprint {
  return { w, h, paletteId, codes, sourceName };
}
