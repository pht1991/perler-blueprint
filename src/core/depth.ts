import type { Blueprint } from './types';

/**
 * 客户端启发式深度估计：从图纸色号推导每格高度层级（0=空，1..layers）。
 *
 * 为什么不用 MiDaS：单文件 HTML 要保持离线可用，ONNX 跑模型包体爆炸。
 * 这里的启发式 = 亮度（越亮越凸，符合受光面视觉习惯）+ 画面居中加权
 * （主体通常在中部）+ 3×3 平滑去噪 + 等频量化（每层豆数接近，雕塑感均匀）。
 */
export function depthLayers(bp: Blueprint, layers = 7, paletteRgb: Map<string, [number, number, number]>): Int8Array {
  const { w, h, codes } = bp;
  const n = w * h;

  // 1) 亮度底图：空格 = 0
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const code = codes[i];
    if (!code) continue;
    const rgb = paletteRgb.get(code);
    if (!rgb) continue;
    f[i] = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255; // 0..1
  }

  // 2) 居中加权：画面中心 +，边缘 -
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const maxD = Math.hypot(cx, cy) || 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (f[i] <= 0) continue;
      const d = Math.hypot(x - cx, y - cy) / maxD;
      f[i] *= 0.72 + 0.28 * (1 - d);
    }
  }

  // 3) 平滑：2 轮 3×3 均值（只对非空格，忽略空邻居）
  let cur = f;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(cur);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (cur[i] <= 0) continue;
        let sum = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
            const v = cur[yy * w + xx];
            if (v <= 0) continue;
            sum += v; cnt++;
          }
        }
        if (cnt > 0) next[i] = sum / cnt;
      }
    }
    cur = next;
  }

  // 4) 等频量化到 1..layers 层：按值排序分桶，保证每层豆数接近
  const filled: number[] = [];
  for (let i = 0; i < n; i++) if (cur[i] > 0) filled.push(i);
  filled.sort((a, b) => cur[a] - cur[b]);

  const out = new Int8Array(n);
  const per = Math.ceil(filled.length / layers);
  for (let rank = 0; rank < filled.length; rank++) {
    const level = Math.min(layers, Math.floor(rank / per) + 1);
    out[filled[rank]] = level;
  }
  return out;
}
