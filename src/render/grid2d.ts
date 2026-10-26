import type { AppState } from '../state/store';
import type { BeadColor, Palette } from '../core/types';

/** 2D 拼豆图纸渲染：每格一个珠子色块，支持镜像、模拟烫豆、高亮/已完成标记。 */
export class GridRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = Math.max(1, window.devicePixelRatio || 1);
  private colorMap = new Map<string, BeadColor>();
  private bg = '#F5F2EA';
  /** 最近一次 fit 得到的每格像素，用于缩放百分比基准 */
  fitScale = 6;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  setPalette(p: Palette) {
    this.colorMap.clear();
    for (const c of p.colors) this.colorMap.set(c.code, c);
  }

  /** 自动按画布适配每格像素（居中） */
  fit(s: AppState) {
    const bp = s.blueprint; if (!bp) return;
    const w = this.canvas.clientWidth || this.canvas.getBoundingClientRect().width;
    const h = this.canvas.clientHeight || this.canvas.getBoundingClientRect().height;
    if (w < 10 || h < 10) return; // 布局未就绪，跳过（等 rAF 后再 fit）
    const pad = 12;
    const cell = Math.floor(Math.min((w - pad * 2) / bp.w, (h - pad * 2) / bp.h));
    s.scale = Math.max(1, cell);
    this.fitScale = s.scale;
    s.ox = Math.round((w - cell * bp.w) / 2);
    s.oy = Math.round((h - cell * bp.h) / 2);
  }

  render(s: AppState) {
    const bp = s.blueprint; if (!bp) { this.clear(); return; }
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    const W = Math.round(rect.width * this.dpr), H = Math.round(rect.height * this.dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = this.bg; ctx.fillRect(0, 0, rect.width, rect.height);

    const cell = s.scale || 6;
    const ox = s.ox, oy = s.oy;
    const { w, h, codes } = bp;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const code = codes[idx];
        if (code === null || code === undefined) continue;
        const color = this.colorMap.get(code);
        if (!color) continue;
        // 镜像：水平翻转
        const px = s.mirror ? (w - 1 - x) : x;
        const gx = ox + px * cell, gy = oy + y * cell;

        if (s.meltOn) {
          // 模拟烫豆：珠子融成圆润凸起，带高光
          const cx = gx + cell / 2, cy = gy + cell / 2, r = cell * (0.5 + s.melt * 0.12);
          const grd = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
          grd.addColorStop(0, lighten(color.hex, 0.25));
          grd.addColorStop(1, color.hex);
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = color.hex;
          ctx.fillRect(gx, gy, cell, cell);
          // 轻微立体感
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fillRect(gx, gy, cell, Math.max(1, cell * 0.18));
          ctx.fillStyle = 'rgba(0,0,0,0.10)';
          ctx.fillRect(gx, gy + cell - Math.max(1, cell * 0.18), cell, Math.max(1, cell * 0.18));
          ctx.strokeStyle = 'rgba(0,0,0,0.06)';
          ctx.strokeRect(gx + 0.5, gy + 0.5, cell - 1, cell - 1);
        }

        if (s.highlight === code) {
          ctx.strokeStyle = '#00C8C8'; ctx.lineWidth = 2;
          ctx.strokeRect(gx + 1, gy + 1, cell - 2, cell - 2);
        }
        if (s.done.has(code)) {
          ctx.strokeStyle = 'rgba(0,200,200,0.9)'; ctx.lineWidth = Math.max(1, cell * 0.12);
          ctx.beginPath();
          ctx.moveTo(gx + cell * 0.28, gy + cell * 0.52);
          ctx.lineTo(gx + cell * 0.45, gy + cell * 0.68);
          ctx.lineTo(gx + cell * 0.74, gy + cell * 0.32);
          ctx.stroke();
        }
      }
    }
  }

  clear() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

function lighten(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const r = Math.min(255, parseInt(h.slice(0, 2), 16) + 255 * amt);
  const g = Math.min(255, parseInt(h.slice(2, 4), 16) + 255 * amt);
  const b = Math.min(255, parseInt(h.slice(4, 6), 16) + 255 * amt);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
