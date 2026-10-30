import './styles/main.css';
import mpCodeUrl from './assets/wxacode.jpg';
import { PALETTES, PALETTE_BY_ID } from './data/palettes';
import { SIZES, DEFAULT_SIZE } from './data/sizes';
import { store } from './state/store';
import type { AppState, ViewMode } from './state/store';
import { installMemStorageFallback, saveProgress, loadProgress, saveBlueprint, loadBlueprint, saveSrcImg, loadSrcImg } from './persist/storage';
import { restoreFromEmbedded, saveFileExport } from './persist/saveFile';
import { decodeLinkPayload } from './persist/linkImport';
import { initI18n, t, getLang, setLang, onLangChange } from './i18n';
import { track } from './analytics';
import { GridRenderer } from './render/grid2d';
import { StageRenderer } from './render/stage3d';
import { generateFromImage } from './ui/upload';
import { Editor } from './ui/editor';
import { setupPoster } from './ui/poster';
import { setupGridExport } from './ui/gridExport';
import { setupPhoneLink } from './ui/phoneLink';
import { setupCompare } from './ui/compare';
import { setupPaletteSearch } from './ui/paletteSearch';
import { setupBatch } from './ui/batch';
import type { Palette } from './core/types';
import type { Tool } from './state/store';

installMemStorageFallback();
initI18n();
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
let baseCodes: (string | null)[] | null = null; // 生成底稿：供「恢复初始图纸」
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
  syncIsland();
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
  // 工具操作提示：没激活工具时教怎么开始，激活后教怎么用
  $('edHint').textContent = !s.tool
    ? (s.editColor ? t('t.hintIdlePick') : t('t.hintIdleNoPick'))
    : t(`hint.${s.tool}`);
}

// ---- UI build ----
function buildSizeGrid() {
  const wrap = $('sizeGrid');
  wrap.innerHTML = '';
  for (const s of SIZES) {
    const el = document.createElement('div');
    el.className = 'size-card' + (String(s.w) === String(store.get().size) ? ' active' : '');
    el.innerHTML = `<div class="n">${s.w}×${s.h}</div><div class="meta">${t('list.beads', { n: s.w * s.h })}</div>`;
    el.onclick = () => selectSize(s.w);
    wrap.appendChild(el);
  }
}

function selectSize(n: number) {
  store.set({ size: n });
  buildSizeGrid();
  track('size', String(n));
  if (currentFile) regen();
}

function buildPaletteList() {
  const wrap = $('palList');
  wrap.innerHTML = '';
  for (const p of PALETTES) {
    const el = document.createElement('button');
    el.className = 'pal-btn' + (p.id === store.get().paletteId ? ' active' : '');
    el.innerHTML = `<span>${p.label}</span><span class="sub">${t('list.colors', { n: p.colors.length })}</span>`;
    el.onclick = () => { store.set({ paletteId: p.id }); buildPaletteList(); track('palette', p.id); regen(); };
    wrap.appendChild(el);
  }
}

function buildColorList() {
  const wrap = $('colorList');
  wrap.innerHTML = '';
  const arr = [...usedMap.entries()].sort((a, b) => b[1] - a[1]);
  const dn = arr.filter(([c]) => store.get().done.has(c)).length;
  $('colorHint').textContent = dn
    ? t('list.usageDone', { n: arr.length, m: dn })
    : t('list.usage', { n: arr.length });
  const pm = PALETTE_BY_ID[store.get().paletteId];
  for (const [code, count] of arr) {
    const c = pm?.colors.find((x) => x.code === code);
    const el = document.createElement('div');
    el.className = 'color-item' + (store.get().highlight === code ? ' hl' : '') + (store.get().done.has(code) ? ' done' : '') + (store.get().editColor === code ? ' ed' : '');
    el.title = t('item.colorTip');
    const hex = c?.hex ?? '#ccc';
    el.innerHTML = `<span class="sw" style="background:${hex}"></span>
      <span class="cd">${code}</span><span class="nm">${c?.name ?? ''}</span>
      <span class="ct">${count}</span><button class="ok" title="${t('item.doneTip')}">✓</button>`;
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
  const s = store.get();
  const done = new Set(s.done);
  if (done.has(code)) done.delete(code); else done.add(code);
  store.set({ done });
  // 剩余 = 用到的颜色总数 - 已标记完成色数（按色计数，不是按珠）
  const left = usedMap.size - [...usedMap.keys()].filter((c) => done.has(c)).length;
  toast(done.has(code) ? t('t.doneMark', { code, left }) : t('t.undoneMark', { code, left }));
  saveProgress(store.get()); buildColorList();
}

// ---- 孤立像素检测 / 一键清除 ----
/** 四邻域全空的散珠索引（单颗珠实操要单独固定，建议清掉） */
function findIsolated(): number[] {
  const bp = store.get().blueprint; if (!bp) return [];
  const { w, h, codes } = bp;
  const out: number[] = [];
  const at = (x: number, y: number) => (x < 0 || x >= w || y < 0 || y >= h ? null : codes[y * w + x] ?? null);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (codes[i] === null || codes[i] === undefined) continue;
      if (at(x - 1, y) === null && at(x + 1, y) === null && at(x, y - 1) === null && at(x, y + 1) === null) out.push(i);
    }
  }
  return out;
}
function syncIsland() {
  const n = findIsolated().length;
  $('islandSec').hidden = n === 0;
  $('islandHint').textContent = t('ui.islandN', { n });
}
$('islandAllBtn').addEventListener('click', () => {
  const s = store.get(); if (!s.blueprint) return;
  const idx = findIsolated(); if (!idx.length) { syncIsland(); return; }
  for (const i of idx) s.blueprint.codes[i] = null;
  usedMap = countUsed(s);
  editor.reset();
  saveBlueprint(s); saveProgress(s);
  renderActive(); buildColorList(); syncIsland();
  toast(t('t.islandCleared', { n: idx.length }));
  track('island-clear');
});

// ---- 恢复初始图纸 ----
$('edRestore').addEventListener('click', () => {
  const s = store.get();
  if (!s.blueprint || !baseCodes) return;
  if (!confirm(t('t.confirmRestore'))) return;
  s.blueprint.codes = baseCodes.slice();
  usedMap = countUsed(s);
  editor.reset();
  saveBlueprint(s); saveProgress(s);
  renderActive(); buildColorList(); syncIsland(); syncToolUI();
  toast(t('t.restored'));
  track('reset');
});

// ---- 用量清单：全部标记已拼 / 清除 ----
$('doneAllBtn').addEventListener('click', () => {
  const s = store.get(); if (!s.blueprint) return;
  const all = new Set(s.blueprint.codes.filter((c): c is string => !!c));
  const allDone = all.size > 0 && s.done.size >= all.size && [...all].every((c) => s.done.has(c));
  store.set({ done: allDone ? new Set<string>() : all });
  toast(allDone ? t('t.allCleared') : t('t.allMarked'));
  saveProgress(store.get()); buildColorList();
});

// ---- generation ----
async function onUpload(file: File) {
  currentFile = file;
  store.set({ title: file.name.replace(/\.[^.]+$/, '') });
  $('taskTitle').textContent = store.get().title;
  await regen();
  toast(t('t.generated'));
  track('upload', `${store.get().size}/${store.get().paletteId}`);
}

async function regen() {
  if (!currentFile) return;
  const s = store.get();
  const res = await generateFromImage(currentFile, s.size, pal(), s.maxColors);
  usedMap = res.used;
  store.set({ blueprint: res.blueprint });
  baseCodes = res.blueprint.codes.slice();
  editor.reset();
  saveBlueprint(s);
  // 源图预览 + 缩略图入档（导出单文件时随档带走）
  const dataUrl = await fileToThumbDataUrl(currentFile);
  saveSrcImg(s, dataUrl);
  hydrateSrcPreview(dataUrl);
  renderActive();
  buildColorList();
  syncToolUI();
  syncIsland();
}

/** 源图压成 ≤512px JPEG dataURL（预览展示 + 持久化两用） */
async function fileToThumbDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((ok, err) => { img.onload = () => ok(); img.onerror = () => err(new Error('img')); img.src = url; });
    const max = 512, r = Math.min(max / img.width, max / img.height, 1);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.width * r));
    cv.height = Math.max(1, Math.round(img.height * r));
    cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}

/** 用 dataURL 渲染左下角源图预览 */
function hydrateSrcPreview(dataUrl: string) {
  const sp = $('srcPreview'), sc = $<HTMLCanvasElement>('srcCanvas');
  const img = new Image();
  img.onload = () => {
    const max = 160, r = Math.min(max / img.width, max / img.height, 1);
    sc.width = img.width * r; sc.height = img.height * r;
    sc.getContext('2d')!.drawImage(img, 0, 0, sc.width, sc.height);
  };
  img.src = dataUrl;
  sp.hidden = false;
}

/** 打开存档时还原源图：预览显示 + 重建 File（让「改规格/色板重新生成」和批量导出重新量化可用） */
async function restoreSrcImg() {
  const dataUrl = loadSrcImg(store.get());
  if (!dataUrl) return;
  hydrateSrcPreview(dataUrl);
  try {
    const blob = await (await fetch(dataUrl)).blob();
    currentFile = new File([blob], `${store.get().title || t('file.photo')}.jpg`, { type: blob.type || 'image/jpeg' });
  } catch { /* 重建失败只影响重新生成，预览已恢复 */ }
}

// ---- 视图 / 效果 ----
function setView(v: ViewMode) {
  store.set({ view: v });
  track('view', v);
  $('view-grid').classList.toggle('active', v === 'grid');
  $('view-stage').classList.toggle('active', v === 'stage');
  // 3D 画布刚从 display:none 变可见：重算尺寸 + 机位，否则找不到图
  if (v === 'stage' && stage) stage.refit(store.get());
}
$('topViewBtn').addEventListener('click', () => stage?.topView());

// ---- 缩放百分比（相对适配窗口的倍数） ----
function updateZoomPct() {
  const s = store.get();
  const el = $('zoomPct');
  if (!s.blueprint) { el.hidden = true; return; }
  const base = grid.fitScale || s.scale || 1;
  el.textContent = Math.round(((s.scale || base) / base) * 100) + '%';
}
function renderActive() {
  const s = store.get();
  grid.setPalette(pal());
  if (s.scale === 0) grid.fit(s);
  grid.render(s);
  if (stage) { stage.setPalette(pal()); if (s.blueprint) stage.setBlueprint(s); }
  updateZoomPct();
}

// ---- events ----
$('uploadBtn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; if (f) onUpload(f); });
$('titleEdit').addEventListener('click', () => {
  const v = prompt(t('t.renamePrompt'), store.get().title); if (v) { store.set({ title: v }); $('taskTitle').textContent = v; }
});
$('flowExpBtn').addEventListener('click', () => {
  if (import.meta.env.DEV) { toast(t('t.devExport')); return; }
  saveFileExport(store.get());
});
$('edSave').addEventListener('click', () => { saveProgress(store.get()); saveBlueprint(store.get()); saveFileExport(store.get()); });

document.querySelectorAll('.view-btn').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.view-btn').forEach((x) => x.classList.remove('active'));
  b.classList.add('active'); setView(b.getAttribute('data-view') as ViewMode);
}));
/** 视图/操作区开关按钮状态（镜像/色号/像素图/立体分层），统一从 store 同步 */
function syncViewOps() {
  const s = store.get();
  $('mirrorBtn').classList.toggle('active', s.mirror);
  $('codesBtn').classList.toggle('active', s.showCodes);
  $('pixelBtn').classList.toggle('active', s.pixelView);
  $('depthBtn').classList.toggle('active', s.depth3d);
}
$('mirrorBtn').addEventListener('click', () => { store.set({ mirror: !store.get().mirror }); syncViewOps(); track('mirror'); renderActive(); });
$('codesBtn').addEventListener('click', () => {
  store.set({ showCodes: !store.get().showCodes });
  syncViewOps();
  track('codes');
  renderActive();
});
$('pixelBtn').addEventListener('click', () => {
  store.set({ pixelView: !store.get().pixelView });
  syncViewOps();
  track('pixel');
  renderActive();
});
$('depthBtn').addEventListener('click', () => {
  const on = !store.get().depth3d;
  store.set({ depth3d: on });
  syncViewOps();
  track('depth');
  renderActive();
  if (on && store.get().view !== 'stage') toast(t('t.depthHint'));
});

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
  updateZoomPct();
}
function fitGrid() {
  const s = store.get(); if (!s.blueprint) return;
  s.scale = 0; grid.fit(s); grid.render(s);
  updateZoomPct();
}

// 滚轮缩放（以鼠标位置为中心，桌面端）
gridCanvas.addEventListener('wheel', (e) => {
  if (!store.get().blueprint) return;
  e.preventDefault();
  const rect = gridCanvas.getBoundingClientRect();
  zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
}, { passive: false });

// ---- 指针手势（Pointer Events 统一鼠标/触摸）：单指平移，双指捏合缩放 ----
// 与编辑器的分工：编辑工具激活时，单指左键/触摸归编辑器绘制；其余单指 = 平移。
const pointers = new Map<number, { x: number; y: number }>();
let panning = false, panX = 0, panY = 0;
let pinchDist = 0, pinchMidX = 0, pinchMidY = 0;
// 双击/双击轻点 = 适配窗口（替代已移除的 ⊡ 按钮）
let lastTapT = 0, lastTapX = 0, lastTapY = 0;

gridCanvas.addEventListener('pointerdown', (e) => {
  const s = store.get();
  if (!s.blueprint) return;
  if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { gridCanvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  if (pointers.size === 1) {
    const now = performance.now();
    if (!s.tool && now - lastTapT < 300 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 24) {
      lastTapT = 0; pointers.delete(e.pointerId);
      fitGrid();
      e.preventDefault();
      return;
    }
    lastTapT = now; lastTapX = e.clientX; lastTapY = e.clientY;  }
  if (pointers.size === 2) {
    // 第二根手指上屏：取消绘制/停止单指平移，进入捏合
    editor.cancelDraw(); panning = false;
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    pinchMidX = (a.x + b.x) / 2; pinchMidY = (a.y + b.y) / 2;
  } else if (pointers.size === 1) {
    const isToolClick = s.tool && (e.pointerType !== 'mouse' || e.button === 0);
    if (isToolClick) return; // 编辑器接管
    panning = true; panX = e.clientX; panY = e.clientY;
  }
  e.preventDefault();
});
gridCanvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const s = store.get();
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    // 捏合缩放（以两指中点为锚）
    if (pinchDist > 0 && Math.abs(d - pinchDist) > 0.5) {
      const rect = gridCanvas.getBoundingClientRect();
      zoomAt(mx - rect.left, my - rect.top, d / pinchDist);
    }
    // 双指整体平移
    const cur = store.get();
    cur.ox += mx - pinchMidX; cur.oy += my - pinchMidY;
    pinchDist = d; pinchMidX = mx; pinchMidY = my;
    grid.render(cur);
  } else if (panning) {
    s.ox += e.clientX - panX; s.oy += e.clientY - panY;
    panX = e.clientX; panY = e.clientY;
    grid.render(s);
  }
});
const endPointer = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
  if (pointers.size === 0) panning = false;
};
gridCanvas.addEventListener('pointerup', endPointer);
gridCanvas.addEventListener('pointercancel', endPointer);

// ---- 编辑模式：工具条 + 快捷键 ----
const TOOLS: Tool[] = ['brush', 'fill', 'eraser', 'picker'];
const TOOL_KEYS: Record<string, Tool> = { b: 'brush', g: 'fill', x: 'eraser', i: 'picker' };
const NEEDS_COLOR = (t: Tool) => t === 'brush' || t === 'fill';
function setTool(tool: Tool) {
  const s = store.get();
  if (NEEDS_COLOR(tool) && !s.editColor) {
    // 没选色不再卡死流程：自动选用量最多的色，用户可随时点色块换
    const top = [...usedMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!top) { toast(t('t.emptyBoard')); return; }
    store.set({ editColor: top, highlight: top });
    buildColorList();
    toast(t('t.autoPick', { code: top }));
  }
  store.set({ tool: store.get().tool === tool ? null : tool });
  track('tool', store.get().tool ?? 'off');
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
  const k = TOOL_KEYS[e.key.toLowerCase()];
  if (k && store.get().blueprint) setTool(k);
});

// ---- 批量导出 / 海报导出 / 全色号搜索 ----
setupBatch({
  openBtn: $('batchBtn'),
  shareBtn: $('batchShareBtn'),
  getFile: () => currentFile,
  getUsed: () => usedMap,
  toast,
});
setupCompare({
  openBtn: $('compareBtn'),
  overlay: $('compareOverlay'),
  closeBtn: $('compareClose'),
  stage: $('cmpStage'),
  divider: $('cmpDivider'),
  srcCanvas: $<HTMLCanvasElement>('cmpSrc'),
  bpCanvas: $<HTMLCanvasElement>('cmpBp'),
  bpLabel: $('cmpBpLabel'),
  hint: $('compareHint'),
  palette: pal,
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
setupGridExport({
  openBtn: $('gridDlBtn'),
  getDone: () => store.get().done,
  toast,
});
setupPhoneLink({
  openBtn: $('phoneBtn'),
  overlay: $('phoneOverlay'),
  codeArea: $('phoneCodeArea'),
  codeEl: $('phoneCode'),
  stepsEl: $('phoneSteps'),
  input: $<HTMLInputElement>('phoneUrl'),
  noteEl: $('phoneNote'),
  copyBtn: $('phoneCopy'),
  closeBtn: $('phoneClose'),
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
  $('budgetHint').textContent = v === 0 ? t('ui.unlimited') : t('ui.budgetN', { n: v });
  if (currentFile) regen();
});
// 松手才上报，避免拖动过程连发
bs.addEventListener('change', () => track('budget', String(bs.value)));

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
  loadProgress(s); // 先跑一次兜底空值
  loadBlueprint(s);
  if (s.blueprint) {
    // 进度键含规格/色板：先从图纸对齐参数再读一次，否则键位错位读不到进度
    s.size = s.blueprint.w;
    s.paletteId = s.blueprint.paletteId;
    loadProgress(s);
    baseCodes = s.blueprint.codes.slice(); usedMap = countUsed(s); buildColorList(); syncToolUI(); syncIsland();
  }
  restoreSrcImg(); // 异步：还原源图预览 + 重建 currentFile
})();

function countUsed(s: AppState): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of s.blueprint!.codes) if (c) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}

// ---- 中 / EN 语言切换 ----
/** 未被用户改过（仍是两语言默认值之一）的标题跟随语言；改过名的尊重用户命名 */
function applyDefaultTitle() {
  const s = store.get();
  if (!s.title || s.title === '拼豆图纸' || s.title === 'Perler Blueprint') {
    store.set({ title: t('app.title') });
  }
  $('taskTitle').textContent = store.get().title || t('app.title');
}
function syncLangBtn() { $('langBtn').textContent = getLang() === 'zh' ? 'EN' : '中'; }
$('langBtn').addEventListener('click', () => {
  const target = getLang() === 'zh' ? 'en' : 'zh';
  setLang(target);
  track('lang', target);
});
syncLangBtn();
onLangChange(() => {
  syncLangBtn();
  applyDefaultTitle();
  buildSizeGrid(); buildPaletteList(); buildColorList();
  syncToolUI(); syncIsland(); syncViewOps();
  const mc = store.get().maxColors;
  $('budgetHint').textContent = mc === 0 ? t('ui.unlimited') : t('ui.budgetN', { n: mc });
  renderActive();
});

/** URL 导入：#p= 链接（小程序「复制电脑端链接」生成），导入后清掉 hash 防刷新重复导入 */
function importFromHash() {
  const m = location.hash.match(/^#p=(.+)$/);
  if (!m) return;
  let bp = null;
  try {
    // v1 时代浏览器可能对 hash 做百分号编码，兜底解一次；v2 的 %XXXX 是名称自有编码，绝不能再解
    const frag = m[1].startsWith('1.') ? decodeURIComponent(m[1]) : m[1];
    bp = decodeLinkPayload(frag);
  } catch (e) { /* 坏编码按无效处理 */ }
  history.replaceState(null, '', location.pathname + location.search);
  if (!bp) { toast(t('t.importBad')); return; }
  let title = bp.title || t('t.importTitle');
  let k = 2;
  while (localStorage.getItem(`perler-blueprint-${encodeURIComponent(title)}`)) title = `${bp.title || t('t.importTitle')} ${k++}`;
  store.set({ title, paletteId: bp.paletteId, blueprint: bp, done: new Set() });
  $('taskTitle').textContent = title;
  usedMap = countUsed(store.get());
  baseCodes = bp.codes.slice();
  editor.reset();
  saveBlueprint(store.get());
  renderActive();
  buildColorList();
  syncToolUI();
  syncIsland();
  toast(t('t.imported'));
  track('import-link', `${bp.w}x${bp.h}`);
}

// ---- init ----
buildSizeGrid();
buildPaletteList();
$('budgetHint').textContent = t('ui.unlimited');
$('taskTitle').textContent = store.get().title || t('app.title');
syncViewOps();
importFromHash();
if (store.get().blueprint) { renderActive(); }
else { grid.setPalette(pal()); grid.render(store.get()); }
window.addEventListener('resize', () => { const s = store.get(); if (s.blueprint) { s.scale = 0; grid.fit(s); renderActive(); } });

// 画布容器尺寸变化（如移动端编辑工具条出现/收起改变文档流高度）时重渲染
// 保持用户缩放：适配模式下重新 fit，手动缩放过的只重绘
let lastCw = 0, lastCh = 0;
new ResizeObserver(() => {
  const s = store.get();
  const cw = gridCanvas.clientWidth, ch = gridCanvas.clientHeight;
  if (!s.blueprint || (cw === lastCw && ch === lastCh)) return;
  lastCw = cw; lastCh = ch;
  if (s.scale === 0) grid.fit(s);
  grid.render(s);
}).observe(gridCanvas);

// 小程序推广弹层（footer 入口）
const mpOverlay = $('mpOverlay');
$('mpEntry').addEventListener('click', () => {
  $('mpCodeImg').setAttribute('src', mpCodeUrl);
  mpOverlay.hidden = false;
  track('mp-overlay');
});
$('mpClose').addEventListener('click', () => { mpOverlay.hidden = true; });
mpOverlay.addEventListener('click', (e) => { if (e.target === mpOverlay) mpOverlay.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') mpOverlay.hidden = true; });
