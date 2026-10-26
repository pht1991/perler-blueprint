import './styles/main.css';
import { PALETTES, PALETTE_BY_ID } from './data/palettes';
import { SIZES, DEFAULT_SIZE } from './data/sizes';
import { store } from './state/store';
import type { AppState, ViewMode } from './state/store';
import { installMemStorageFallback, saveProgress, loadProgress, saveBlueprint, loadBlueprint } from './persist/storage';
import { restoreFromEmbedded, saveFileExport } from './persist/saveFile';
import { GridRenderer } from './render/grid2d';
import { StageRenderer } from './render/stage3d';
import { generateFromImage } from './ui/upload';
import { Editor } from './ui/editor';
import { setupPoster } from './ui/poster';
import { setupPaletteSearch } from './ui/paletteSearch';
import { setupBatch } from './ui/batch';
import type { Palette } from './core/types';
import type { Tool } from './state/store';

installMemStorageFallback();
restoreFromEmbedded();
if (!store.get().paletteId) store.set({ paletteId: PALETTES[0].id, size: Number(DEFAULT_SIZE) });

// ---- refs ----
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const gridCanvas = $<HTMLCanvasElement>('gridCanvas');
const stageCanvas = $<HTMLCanvasElement>('stageCanvas');
const toastEl = $<HTMLDivElement>('toast');
const fileInput = $<HTMLInputElement>('fileInput');

let currentFile: File | null = null;
let usedMap = new Map<string, number>();
const pal = (): Palette => PALETTE_BY_ID[store.get().paletteId] ?? PALETTES[0];

function toast(msg: string) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout((toastEl as any)._t); (toastEl as any)._t = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

// ---- renderers ----
const grid = new GridRenderer(gridCanvas);
let stage: StageRenderer | null = null;
try { stage = new StageRenderer(stageCanvas); } catch (e) { console.warn('WebGL 不可用，3D 视图关闭', e); $('view-stage').remove(); }

// ---- editor ----
const editor = new Editor(gridCanvas);
editor.onPaint = () => grid.render(store.get());
editor.onCommit = () => {
  usedMap = countUsed(store.get());
  buildColorList();
  renderActive();
};
editor.onToolChange = () => syncToolUI();

function syncToolUI() {
  const s = store.get();
  const bar = $('edBar');
  bar.hidden = !s.blueprint;
  bar.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-tool') === s.tool);
  });
  const pm = PALETTE_BY_ID[s.paletteId];
  const c = s.editColor ? pm?.colors.find((x) => x.code === s.editColor) : null;
  ($('edCurSw') as HTMLElement).style.background = c?.hex ?? 'transparent';
  $('edCurCode').textContent = s.editColor ?? '';
}

// ---- UI build ----
function buildSizeGrid() {
  const wrap = $('sizeGrid');
  wrap.innerHTML = '';
  for (const s of SIZES) {
    const el = document.createElement('div');
    el.className = 'size-card' + (String(s.w) === String(store.get().size) ? ' active' : '');
    el.innerHTML = `<div class="n">${s.w}×${s.h}</div><div class="meta">${s.w * s.h} 颗</div>`;
    el.onclick = () => selectSize(s.w);
    wrap.appendChild(el);
  }
}

function selectSize(n: number) {
  store.set({ size: n });
  buildSizeGrid();
  if (currentFile) regen();
}

function buildPaletteList() {
  const wrap = $('palList');
  wrap.innerHTML = '';
  for (const p of PALETTES) {
    const el = document.createElement('button');
    el.className = 'pal-btn' + (p.id === store.get().paletteId ? ' active' : '');
    el.innerHTML = `<span>${p.label}</span><span class="sub">${p.colors.length}色</span>`;
    el.onclick = () => { store.set({ paletteId: p.id }); buildPaletteList(); regen(); };
    wrap.appendChild(el);
  }
}

function buildColorList() {
  const wrap = $('colorList');
  wrap.innerHTML = '';
  const arr = [...usedMap.entries()].sort((a, b) => b[1] - a[1]);
  $('colorHint').textContent = `${arr.length} 色`;
  const pm = PALETTE_BY_ID[store.get().paletteId];
  for (const [code, count] of arr) {
    const c = pm?.colors.find((x) => x.code === code);
    const el = document.createElement('div');
    el.className = 'color-item' + (store.get().highlight === code ? ' hl' : '') + (store.get().done.has(code) ? ' done' : '');
    const hex = c?.hex ?? '#ccc';
    el.innerHTML = `<span class="sw" style="background:${hex}"></span>
      <span class="cd">${code}</span><span class="nm">${c?.name ?? ''}</span>
      <span class="ct">${count}</span><button class="ok" title="标记已拼">✓</button>`;
    el.querySelector('.sw')!.addEventListener('click', () => selectEditColor(code));
    el.querySelector('.ok')!.addEventListener('click', (e) => { e.stopPropagation(); toggleDone(code); });
    wrap.appendChild(el);
  }
}

function toggleHighlight(code: string) {
  store.set({ highlight: store.get().highlight === code ? null : code });
  saveProgress(store.get()); buildColorList();
}
/** 编辑选色：点色块 = 设为当前编辑色（同时作为高亮），再点一次取消 */
function selectEditColor(code: string) {
  const s = store.get();
  const pick = s.editColor === code ? null : code;
  store.set({ editColor: pick, highlight: pick });
  saveProgress(store.get()); buildColorList(); syncToolUI();
}
function toggleDone(code: string) {
  const done = new Set(store.get().done);
  if (done.has(code)) done.delete(code); else done.add(code);
  store.set({ done });
  const left = (store.get().blueprint?.codes.filter((c) => c !== null).length ?? 0) - done.size;
  toast(`${code} 已完成 · 剩余 ${left} 色`);
  saveProgress(store.get()); buildColorList();
}

// ---- generation ----
async function onUpload(file: File) {
  currentFile = file;
  store.set({ title: file.name.replace(/\.[^.]+$/, '') });
  $('taskTitle').textContent = store.get().title;
  await regen();
  toast('已生成图纸');
}

async function regen() {
  if (!currentFile) return;
  const s = store.get();
  const res = await generateFromImage(currentFile, s.size, pal(), s.maxColors);
  usedMap = res.used;
  store.set({ blueprint: res.blueprint });
  saveBlueprint(s);
  // 源图预览
  const sp = $('srcPreview'), sc = $<HTMLCanvasElement>('srcCanvas');
  sp.hidden = false;
  const img = new Image(); img.onload = () => {
    const max = 160; const r = Math.min(max / img.width, max / img.height, 1);
    sc.width = img.width * r; sc.height = img.height * r;
    sc.getContext('2d')!.drawImage(img, 0, 0, sc.width, sc.height);
  }; img.src = URL.createObjectURL(currentFile);
  renderActive();
  buildColorList();
  syncToolUI();
}

// ---- view / effects ----
function setView(v: ViewMode) {
  store.set({ view: v });
  $('view-grid').classList.toggle('active', v === 'grid');
  $('view-stage').classList.toggle('active', v === 'stage');
}
function renderActive() {
  const s = store.get();
  grid.setPalette(pal());
  if (s.scale === 0) grid.fit(s);
  grid.render(s);
  if (stage) { stage.setPalette(pal()); if (s.blueprint) stage.setBlueprint(s); }
}

// ---- events ----
$('uploadBtn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; if (f) onUpload(f); });
$('titleEdit').addEventListener('click', () => {
  const t = prompt('图纸标题', store.get().title); if (t) { store.set({ title: t }); $('taskTitle').textContent = t; }
});
$('flowExpBtn').addEventListener('click', () => {
  if (import.meta.env.DEV) { toast('自导出请用 npm run build 后的单文件'); return; }
  saveFileExport(store.get());
});
$('edSave').addEventListener('click', () => { saveProgress(store.get()); saveBlueprint(store.get()); saveFileExport(store.get()); });

document.querySelectorAll('.view-btn').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.view-btn').forEach((x) => x.classList.remove('active'));
  b.classList.add('active'); setView(b.getAttribute('data-view') as ViewMode);
}));
$('mirrorBtn').addEventListener('click', () => { store.set({ mirror: !store.get().mirror }); renderActive(); });
$('depthBtn').addEventListener('click', () => {
  const on = !store.get().depth3d;
  store.set({ depth3d: on });
  $('depthBtn').classList.toggle('active', on);
  renderActive();
  if (on && store.get().view !== 'stage') toast('立体分层在「3D 豆板」视图生效');
});
$('meltBtn').addEventListener('click', () => {
  const on = !store.get().meltOn; store.set({ meltOn: on });
  $('meltRow').hidden = !on; renderActive();
});
$('meltSlider').addEventListener('input', (e) => { store.set({ melt: Number((e.target as HTMLInputElement).value) / 100 }); renderActive(); });
$('zoomIn').addEventListener('click', () => zoomAt(null, null, 1.25));
$('zoomOut').addEventListener('click', () => zoomAt(null, null, 1 / 1.25));
$('zoomFit').addEventListener('click', () => fitGrid());

/** 以画布坐标 (mx,my) 为锚点缩放；null = 以画布中心为锚 */
function zoomAt(mx: number | null, my: number | null, factor: number) {
  const s = store.get(); if (!s.blueprint) return;
  const rect = gridCanvas.getBoundingClientRect();
  const cx = mx ?? rect.width / 2, cy = my ?? rect.height / 2;
  const cell = s.scale || 6;
  const next = Math.min(64, Math.max(1, cell * factor));
  if (next === cell) return;
  const r = next / cell;
  s.scale = next;
  s.ox = cx - (cx - s.ox) * r;
  s.oy = cy - (cy - s.oy) * r;
  grid.render(s);
}
function fitGrid() {
  const s = store.get(); if (!s.blueprint) return;
  s.scale = 0; grid.fit(s); grid.render(s);
}

// 滚轮缩放（以鼠标位置为中心）
gridCanvas.addEventListener('wheel', (e) => {
  if (!store.get().blueprint) return;
  e.preventDefault();
  const rect = gridCanvas.getBoundingClientRect();
  zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
}, { passive: false });

// 拖拽平移：未激活编辑工具时左键拖动，或任意时刻中键拖动
let panning = false, panX = 0, panY = 0;
gridCanvas.addEventListener('mousedown', (e) => {
  const s = store.get();
  if (!s.blueprint) return;
  if (e.button === 0 && s.tool) return; // 编辑工具激活时左键归编辑器
  if (e.button !== 0 && e.button !== 1) return;
  panning = true; panX = e.clientX; panY = e.clientY;
  e.preventDefault();
});
window.addEventListener('mousemove', (e) => {
  if (!panning) return;
  const s = store.get();
  s.ox += e.clientX - panX; s.oy += e.clientY - panY;
  panX = e.clientX; panY = e.clientY;
  grid.render(s);
});
window.addEventListener('mouseup', () => { panning = false; });

// ---- 编辑模式：工具条 + 快捷键 ----
const TOOLS: Tool[] = ['brush', 'fill', 'eraser', 'picker'];
const TOOL_KEYS: Record<string, Tool> = { b: 'brush', g: 'fill', x: 'eraser', i: 'picker' };
const NEEDS_COLOR = (t: Tool) => t === 'brush' || t === 'fill';
function setTool(t: Tool) {
  if (NEEDS_COLOR(t) && !store.get().editColor) { toast('先在「颜色用量」里点色块选个颜色'); return; }
  store.set({ tool: store.get().tool === t ? null : t });
  syncToolUI();
}
$('edBar').querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => {
  b.addEventListener('click', () => setTool(b.getAttribute('data-tool') as Tool));
});
$('edUndo').addEventListener('click', () => editor.undo());
$('edRedo').addEventListener('click', () => editor.redo());
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? editor.redo() : editor.undo();
    return;
  }
  const t = TOOL_KEYS[e.key.toLowerCase()];
  if (t && store.get().blueprint) setTool(t);
});

// ---- 批量导出 / 海报导出 / 全色号搜索 ----
setupBatch({
  openBtn: $('batchBtn'),
  shareBtn: $('batchShareBtn'),
  getFile: () => currentFile,
  getUsed: () => usedMap,
  toast,
});
setupPoster({
  openBtn: $('posterBtn'),
  overlay: $('posterOverlay'),
  img: $<HTMLImageElement>('posterImg'),
  shareBtn: $('posterShare'),
  dlPng: $('posterDlPng'),
  dlPdf: $('posterDlPdf'),
  closeBtn: $('posterClose'),
  getUsed: () => usedMap,
  toast,
});
setupPaletteSearch({
  toggleBtn: $('palSearchToggle'),
  panel: $('palSearchPanel'),
  input: $<HTMLInputElement>('palSearchInput'),
  grid: $('palSearchGrid'),
  onPick: (code) => {
    store.set({ editColor: code, highlight: code });
    saveProgress(store.get()); syncToolUI(); buildColorList();
  },
});

// custom size
$('csGo').addEventListener('click', () => {
  const n = parseInt($<HTMLInputElement>('csN').value, 10);
  if (n >= 15 && n <= 156) selectSize(n);
});

// budget (max colors)
const bs = $<HTMLInputElement>('budgetSlider');
bs.min = '0'; bs.max = '64'; bs.value = '0'; bs.step = '1';
bs.addEventListener('input', (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  store.set({ maxColors: v });
  $('budgetHint').textContent = v === 0 ? '不限' : `≤${v}色`;
  if (currentFile) regen();
});

// store 订阅：标题/视图等轻量同步
store.subscribe((s, changed) => {
  if (changed.has('blueprint')) {
    grid.setPalette(pal());
    if (s.scale === 0) {
      // 下一帧再 fit：等布局稳定，避免测到中间态尺寸导致图纸偏出画布
      requestAnimationFrame(() => { if (store.get().scale === 0) { grid.fit(store.get()); grid.render(store.get()); } });
    }
    renderActive();
  }
});

// ---- 打开已保存文件时恢复图纸 ----
(function restoreBlueprint() {
  const s = store.get();
  loadProgress(s);
  loadBlueprint(s);
  if (s.blueprint) { usedMap = countUsed(s); buildColorList(); syncToolUI(); }
})();

function countUsed(s: AppState): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of s.blueprint!.codes) if (c) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}

// ---- init ----
buildSizeGrid();
buildPaletteList();
$('budgetHint').textContent = '不限';
if (store.get().blueprint) { renderActive(); }
else { grid.setPalette(pal()); grid.render(store.get()); }
window.addEventListener('resize', () => { const s = store.get(); if (s.blueprint) { s.scale = 0; grid.fit(s); renderActive(); } });
