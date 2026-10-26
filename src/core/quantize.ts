import type { BeadColor, Blueprint, Palette, RGB, LAB } from './types';
import { deltaE, labOf } from './color';

export interface QuantizeOptions {
  palette: Palette;
  isEmpty: Uint8Array;       // 1 = 背景，输出 null
  maxColors?: number;        // 色数上限（预算档位）：超出则 k-means 语义聚类压缩
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

  /** 像素 Lab → 最近色板色号 */
  const nearestPalCode = (l: LAB): string => {
    let bi = 0, bd = Infinity;
    for (let k = 0; k < pal.length; k++) {
      const d = deltaE(l, labs[k]);
      if (d < bd) { bd = d; bi = k; }
    }
    return pal[bi].code;
  };

  const codes: (string | null)[] = new Array(n);
  const used = new Map<string, number>();
  const max = opts.maxColors;

  if (max && max > 0) {
    // —— 限色路径：k-means 语义聚类（Lab 空间聚出 K 个主色 → 各自映射到最近色板色）——
    // 比「先全量映射再按用量截断」更能保留语义结构（暗部/亮部/肤色各自成簇）。
    const idx: number[] = [];
    const pxLab: LAB[] = [];
    for (let i = 0; i < n; i++) {
      const p = px[i];
      if (!p) { codes[i] = null; continue; }
      idx.push(i);
      pxLab.push(labOf(p));
    }
    const k = Math.min(max, pxLab.length);
    if (k >= pxLab.length || pxLab.length === 0) {
      // 像素数不超过预算：逐像素直接取最近色
      for (const j of idx) {
        const code = nearestPalCode(pxLab[j]);
        codes[idx[j]] = code;
        used.set(code, (used.get(code) ?? 0) + 1);
      }
      return { codes, used };
    }
    const centers = kmeans(pxLab, k);
    // 聚类中心 → 最近色板色（不同簇可能映射到同色号，用量自动合并）
    const centerCodes = centers.map(nearestPalCode);
    for (let j = 0; j < idx.length; j++) {
      const pl = pxLab[j];
      let bi = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = deltaE(pl, centers[c]);
        if (d < bd) { bd = d; bi = c; }
      }
      const code = centerCodes[bi];
      codes[idx[j]] = code;
      used.set(code, (used.get(code) ?? 0) + 1);
    }
    return { codes, used };
  }

  // —— 不限色：逐像素取最近色板色 ——
  for (let i = 0; i < n; i++) {
    const p = px[i];
    if (!p) { codes[i] = null; continue; }
    const code = nearestPalCode(labOf(p));
    codes[i] = code;
    used.set(code, (used.get(code) ?? 0) + 1);
  }
  return { codes, used };
}

function clamp(v: number) { return Math.max(0, Math.min(255, Math.round(v))); }

export function makeBlueprint(
  w: number, h: number, paletteId: string, codes: (string | null)[], sourceName?: string
): Blueprint {
  return { w, h, paletteId, codes, sourceName };
}

/** k-means++ 初始化 + Lloyd 迭代（Lab 空间；固定种子 LCG，同图同参数结果稳定） */
function kmeans(points: LAB[], k: number, iters = 12): LAB[] {
  const rnd = mulberry32(0x9e3779b9);
  const n = points.length;
  // --- k-means++ init ---
  const centers: LAB[] = [points[Math.floor(rnd() * n)].slice() as LAB];
  const minD = new Float64Array(n).fill(Infinity);
  while (centers.length < k) {
    const last = centers[centers.length - 1];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const d = dist2(points[i], last);
      if (d < minD[i]) minD[i] = d;
      sum += minD[i];
    }
    let target = rnd() * sum, pick = n - 1;
    for (let i = 0; i < n; i++) { target -= minD[i]; if (target <= 0) { pick = i; break; } }
    centers.push(points[pick].slice() as LAB);
  }
  // --- Lloyd ---
  const assign = new Int32Array(n).fill(-1);
  const sums = new Float64Array(k * 3);
  const counts = new Int32Array(k);
  for (let it = 0; it < iters; it++) {
    sums.fill(0); counts.fill(0);
    let moved = false;
    for (let i = 0; i < n; i++) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist2(points[i], centers[c]);
        if (d < bd) { bd = d; bi = c; }
      }
      if (assign[i] !== bi) { assign[i] = bi; moved = true; }
      sums[bi * 3] += points[i][0]; sums[bi * 3 + 1] += points[i][1]; sums[bi * 3 + 2] += points[i][2];
      counts[bi]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) {
        // 空簇：挪到离所属中心最远的点
        let far = 0, fd = -1;
        for (let i = 0; i < n; i++) {
          const d = dist2(points[i], centers[assign[i]]);
          if (d > fd) { fd = d; far = i; }
        }
        centers[c] = points[far].slice() as LAB;
      } else {
        centers[c] = [sums[c * 3] / counts[c], sums[c * 3 + 1] / counts[c], sums[c * 3 + 2] / counts[c]];
      }
    }
    if (!moved && it > 0) break;
  }
  return centers;
}

function dist2(a: LAB, b: LAB): number {
  const dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  return dl * dl + da * da + db * db;
}

/** 确定性伪随机（mulberry32） */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
