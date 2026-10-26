import type { AppState } from '../state/store';

// [SAVE-FILE] 存档随文件走
// 「保存」把本任务的全部本地存档（进度、图纸）写进一份新的单文件 HTML 交给用户。
// 打开这份新文件时，页面先把文件里带的存档写回本地，再按存档渲染。
//
// 注意：自导出依赖「整页 DOM 可序列化 + 脚本已内联」。Vite 开发模式下脚本是 /src/main.ts（无法独立运行），
// 所以该能力在 `npm run build`（vite-plugin-singlefile，产出单文件 HTML）后使用才完整。开发模式点保存会提示用构建版。

const SAVED_TAG = /<script id="perlerSaved" type="application\/json">[\s\S]*?<\/script>/;
const SAVE_STAMP_KEY = (t: string) => `perler-saved-at-${t}`;

function taskKey(s: AppState): string {
  return encodeURIComponent(s.title);
}

function saveFileKeys(s: AppState): string[] {
  const tk = taskKey(s);
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('perler-') && (k.endsWith('-' + tk) || k.includes('-' + tk + '-') || k === `perler-blueprint-${tk}`)) keys.push(k);
    }
  } catch (e) { /* ignore */ }
  return keys;
}

/** 打开文件时调用：文件里的存档比本地新才写回（以 savedAt 判断） */
export function restoreFromEmbedded(): void {
  let snap: any = null;
  try { snap = JSON.parse(document.getElementById('perlerSaved')?.textContent || 'null'); } catch (e) { return; }
  if (!snap || !snap.savedAt || !snap.items) return;
  const stampKey = SAVE_STAMP_KEY(taskKeyFromSnap(snap));
  try {
    if (Number(localStorage.getItem(stampKey) || 0) >= snap.savedAt) return;
    for (const k of saveFileKeysFromSnap(snap)) if (!(k in snap.items)) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(snap.items)) localStorage.setItem(k, v as string);
    localStorage.setItem(stampKey, String(snap.savedAt));
  } catch (e) { /* ignore */ }
}

function taskKeyFromSnap(snap: any): string {
  // 存档键里含标题编码，取第一个 perler- 键推断
  const k = Object.keys(snap.items).find((x) => x.startsWith('perler-'));
  if (!k) return '';
  const m = k.match(/perler-(?:progress|blueprint)-(.+?)(?:-|$)/);
  return m ? m[1] : '';
}
function saveFileKeysFromSnap(snap: any): string[] { return Object.keys(snap.items); }

const isCoarse = () => window.matchMedia('(pointer:coarse)').matches;

export async function saveFileExport(s: AppState): Promise<'ok' | 'shared' | 'cancel' | 'noop'> {
  const savedAt = Date.now();
  const items: Record<string, string> = {};
  try {
    for (const k of saveFileKeys(s)) items[k] = localStorage.getItem(k) || '';
    localStorage.setItem(SAVE_STAMP_KEY(taskKey(s)), String(savedAt));
  } catch (e) { /* ignore */ }
  const json = JSON.stringify({ savedAt, items }).replace(/</g, '\\u003c');
  const html = document.documentElement.outerHTML.replace(SAVED_TAG, () => `<script id="perlerSaved" type="application/json">${json}<\/script>`);

  const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getMonth() + 1}月${d.getDate()}日_${p(d.getHours())}点${p(d.getMinutes())}分${p(d.getSeconds())}秒`;
  const name = (s.title || '拼豆图纸').replace(/[\\/:*?"<>|]/g, '').trim() || '拼豆图纸';
  const file = new File([html], `【拼豆图纸】${name}-${stamp}.html`, { type: 'text/html' });

  if (isCoarse()) {
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return 'shared'; }
    } catch (e: any) { if (e?.name === 'AbortError') return 'cancel'; }
  }
  // PC：直接下载
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'ok';
}
