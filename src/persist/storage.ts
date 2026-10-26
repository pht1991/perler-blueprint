import type { AppState } from '../state/store';

// [STORAGE] 本地存储兜底：部分内嵌浏览器（微信内置、沙盒 iframe、隐私模式）访问 localStorage 即报错，
// 这里在所有模块之前试写一次；不能用就换成内存版，页面开着期间照常可用，关掉后由「保存」另存文件带走。

export function installMemStorageFallback(): void {
  try {
    const s = window.localStorage, k = '__perler_probe__';
    s.setItem(k, '1'); s.removeItem(k);
    return;
  } catch (e) { /* ignore */ }
  function MemStorage() { }
  Object.defineProperties(MemStorage.prototype, {
    getItem: { value(k: string) { return Object.prototype.hasOwnProperty.call(this, k) ? (this as any)[k] : null; } },
    setItem: { value(k: string, v: string) { (this as any)[String(k)] = String(v); } },
    removeItem: { value(k: string) { delete (this as any)[k]; } },
    clear: { value() { Object.keys(this).forEach((k) => delete (this as any)[k]); } },
    key: { value(i: number) { const ks = Object.keys(this); return i < ks.length ? ks[i] : null; } },
    length: { get() { return Object.keys(this).length; } },
  });
  try {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: new (MemStorage as any)() });
  } catch (e) { /* ignore */ }
}

function enc(s: string): string { return encodeURIComponent(s); }

/** 进度键：同一浏览器里多份图纸共用 localStorage，用标题+规格+色板+色数区分，避免互相串档 */
export function progressKey(s: AppState): string {
  const base = enc(s.title);
  const b = s.maxColors ? `-b${s.maxColors}` : '';
  return `perler-progress-${base}-${s.size}-${s.paletteId}${b}`;
}

export function saveProgress(s: AppState): void {
  try {
    localStorage.setItem(progressKey(s), JSON.stringify({ cur: s.highlight, done: [...s.done] }));
  } catch (e) { /* ignore */ }
}

export function loadProgress(s: AppState): void {
  try {
    const p = JSON.parse(localStorage.getItem(progressKey(s)) || 'null');
    s.highlight = (p && p.cur) || null;
    s.done = new Set(p && p.done || []);
  } catch (e) { s.highlight = null; s.done = new Set(); }
}

/** 当前图纸（网格色号）也存本地，这样「保存」导出的单文件才带得走图纸本身 */
export function blueprintKey(s: AppState): string { return `perler-blueprint-${enc(s.title)}`; }

export function saveBlueprint(s: AppState): void {
  if (!s.blueprint) return;
  try { localStorage.setItem(blueprintKey(s), JSON.stringify(s.blueprint)); } catch (e) { /* ignore */ }
}

export function loadBlueprint(s: AppState): void {
  try {
    const raw = localStorage.getItem(blueprintKey(s));
    s.blueprint = raw ? JSON.parse(raw) : null;
  } catch (e) { s.blueprint = null; }
}
