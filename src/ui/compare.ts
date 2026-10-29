import { store } from '../state/store';
import type { Palette } from '../core/types';
import { loadSrcImg } from '../persist/storage';
import { t } from '../i18n';
import { track } from '../analytics';

// [COMPARE] 原图对比滑块：原图与图纸两层画布同尺寸叠放，
// 中间一条可拖动分隔线（Pointer Events，鼠标/触屏通吃），
// 分隔线左侧露出原图、右侧是图纸，滑动核对量化选色是否跑偏。
// 对齐逻辑：图纸生成时源图按目标比例中心裁切，这里同样按 cover(居中) 绘制原图，两边内容一一对齐。

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function setupCompare(opts: {
  openBtn: HTMLButtonElement;
  overlay: HTMLElement;
  closeBtn: HTMLButtonElement;
  stage: HTMLElement;
  divider: HTMLElement;
  srcCanvas: HTMLCanvasElement;
  bpCanvas: HTMLCanvasElement;
  bpLabel: HTMLElement;
  hint: HTMLElement;
  palette: () => Palette;
  toast: (msg: string) => void;
}) {
  const { openBtn, overlay, closeBtn, stage, divider, srcCanvas, bpCanvas, bpLabel, hint, palette, toast } = opts;
  let lastDataUrl: string | null = null;
  let pct = 50; // 分隔线位置（%）：0 = 全图纸，100 = 全原图

  openBtn.addEventListener('click', () => {
    const s = store.get();
    if (!s.blueprint) { toast(t('t.needBlueprint')); return; }
    const dataUrl = loadSrcImg(s);
    if (!dataUrl) { toast(t('t.noSrcImg')); return; }
    lastDataUrl = dataUrl;
    track('compare');
    hint.textContent = s.title;
    bpLabel.textContent = `${t('ui.pattern')} ${s.blueprint.w}×${s.blueprint.h} · ${palette().label}`;
    setPct(50);
    overlay.hidden = false;
    // 等布局生效后再画（拿得到容器尺寸）
    requestAnimationFrame(() => { layout(); drawSrc(dataUrl); drawBlueprint(); });
  });

  closeBtn.addEventListener('click', () => { overlay.hidden = true; });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.hidden = true; });

  // ---- 分隔线拖拽（Pointer Events：鼠标/触屏/触控笔一套逻辑） ----
  let dragging = false;
  const applyPct = (clientX: number) => {
    const rect = stage.getBoundingClientRect();
    const p = ((clientX - rect.left) / rect.width) * 100;
    setPct(Math.min(98, Math.max(2, p)));
  };
  stage.addEventListener('pointerdown', (e) => {
    dragging = true;
    try { stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    applyPct(e.clientX);
  });
  stage.addEventListener('pointermove', (e) => { if (dragging) applyPct(e.clientX); });
  const stop = () => { dragging = false; };
  stage.addEventListener('pointerup', stop);
  stage.addEventListener('pointercancel', stop);

  function setPct(p: number) {
    pct = p;
    // 左侧露出原图：裁掉右侧 (100-pct)%
    srcCanvas.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    divider.style.left = `${pct}%`;
  }

  /** 舞台尺寸：按图纸宽高比适配到可视区，两层画布同尺寸叠放 */
  function layout() {
    const bp = store.get().blueprint; if (!bp) return;
    const maxW = Math.min(window.innerWidth * 0.88, 1100);
    const maxH = window.innerHeight * (window.innerWidth <= 820 ? 0.62 : 0.68);
    let w = maxW, h = w * (bp.h / bp.w);
    if (h > maxH) { h = maxH; w = h * (bp.w / bp.h); }
    stage.style.width = `${Math.round(w)}px`;
    stage.style.height = `${Math.round(h)}px`;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    for (const cv of [bpCanvas, srcCanvas]) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = `${Math.round(w)}px`;
      cv.style.height = `${Math.round(h)}px`;
    }
  }

  /** 底层：图纸纯色块平铺（跟随镜像），铺满舞台 */
  function drawBlueprint() {
    const s = store.get();
    const bp = s.blueprint; if (!bp) return;
    const cm = new Map<string, string>();
    for (const c of palette().colors) cm.set(c.code, c.hex);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const ctx = bpCanvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cw = bpCanvas.width / dpr, ch = bpCanvas.height / dpr;
    ctx.clearRect(0, 0, cw, ch);
    const cell = cw / bp.w;
    for (let y = 0; y < bp.h; y++) {
      for (let x = 0; x < bp.w; x++) {
        const code = bp.codes[y * bp.w + x];
        if (!code) continue;
        const hex = cm.get(code); if (!hex) continue;
        ctx.fillStyle = hex;
        ctx.fillRect((s.mirror ? bp.w - 1 - x : x) * cell, y * cell, cell + 0.5, cell + 0.5);
      }
    }
  }

  /** 顶层：原图按 cover(居中) 绘制——与图纸生成时的中心裁切对齐 */
  function drawSrc(dataUrl: string) {
    const img = new Image();
    img.onload = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const ctx = srcCanvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cw = srcCanvas.width / dpr, ch = srcCanvas.height / dpr;
      ctx.clearRect(0, 0, cw, ch);
      const scale = Math.max(cw / img.width, ch / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      drawBlueprint(); // 原图载入后确保底层图纸也在（首次打开顺序无关）
    };
    img.src = dataUrl;
  }
}
