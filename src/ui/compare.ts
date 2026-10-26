import { store } from '../state/store';
import type { Palette } from '../core/types';
import { loadSrcImg } from '../persist/storage';

// [COMPARE] 原图对比视图：左原图（存档里的缩略图 dataURL）、右图纸（按色板 RGB 平铺纯色块）。
// 同一显示高度并排，方便核对量化选色是否跑偏（尤其限色档位低时）。

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function setupCompare(opts: {
  openBtn: HTMLButtonElement;
  overlay: HTMLElement;
  closeBtn: HTMLButtonElement;
  srcCanvas: HTMLCanvasElement;
  bpCanvas: HTMLCanvasElement;
  bpLabel: HTMLElement;
  hint: HTMLElement;
  palette: () => Palette;
  toast: (msg: string) => void;
}) {
  const { openBtn, overlay, closeBtn, srcCanvas, bpCanvas, bpLabel, hint, palette, toast } = opts;
  let lastDataUrl: string | null = null;

  openBtn.addEventListener('click', () => {
    const s = store.get();
    if (!s.blueprint) { toast('先上传图片生成图纸'); return; }
    const dataUrl = loadSrcImg(s);
    if (!dataUrl) { toast('这份存档没带原图（旧档），重新上传一次即可'); return; }
    lastDataUrl = dataUrl;
    hint.textContent = s.title;
    bpLabel.textContent = `${s.blueprint.w}×${s.blueprint.h} · ${palette().label}`;
    overlay.hidden = false;
    // 等布局生效后再画（拿得到容器尺寸）
    requestAnimationFrame(() => { drawSrc(dataUrl); drawBlueprint(); });
  });

  closeBtn.addEventListener('click', () => { overlay.hidden = true; });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.hidden = true; });

  /** figure 内可用高度 = figure 高度 − figcaption 占位 */
  function figInner(fig: HTMLElement): number {
    const cap = fig.querySelector('figcaption') as HTMLElement | null;
    return Math.max(120, fig.clientHeight - (cap ? cap.offsetHeight + 6 : 0));
  }

  /** 左侧：原图缩略图，按容器高度适配 */
  function drawSrc(dataUrl: string) {
    const img = new Image();
    img.onload = () => {
      const fig = srcCanvas.parentElement!;
      const boxH = figInner(fig);
      const r = boxH / img.height;
      const w = Math.max(1, Math.round(img.width * r));
      srcCanvas.width = img.width; srcCanvas.height = img.height;
      srcCanvas.style.width = `${w}px`; srcCanvas.style.height = `${Math.round(boxH)}px`;
      const ctx = srcCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, srcCanvas.width, srcCanvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = dataUrl;
  }

  /** 右侧：图纸纯色块平铺（跟随镜像），与原图同高 */
  function drawBlueprint() {
    const s = store.get();
    const bp = s.blueprint; if (!bp) return;
    const cm = new Map<string, string>();
    for (const c of palette().colors) cm.set(c.code, c.hex);
    // 目标：显示高度 = 左图高度（用同一容器高度），cell 向上取整保证铺满
    const boxH = figInner(bpCanvas.parentElement!);
    const cell = Math.max(1, Math.round(boxH / bp.h));
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    bpCanvas.width = bp.w * dpr; bpCanvas.height = bp.h * dpr;
    bpCanvas.style.width = `${bp.w * cell}px`; bpCanvas.style.height = `${bp.h * cell}px`;
    const ctx = bpCanvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, bp.w, bp.h);
    for (let y = 0; y < bp.h; y++) {
      for (let x = 0; x < bp.w; x++) {
        const code = bp.codes[y * bp.w + x];
        if (!code) continue;
        const hex = cm.get(code); if (!hex) continue;
        ctx.fillStyle = hex;
        ctx.fillRect(s.mirror ? bp.w - 1 - x : x, y, 1, 1);
      }
    }
  }
}
