import type { AppState } from '../state/store';
import { store } from '../state/store';

// [SAVE-FILE] 存档随文件走
// 「保存」把本任务的全部本地存档（进度、图纸）写进一份新的单文件 HTML 交给用户。
// 打开这份新文件时，页面先把文件里带的存档写回本地，再按存档渲染。
//
// 注意：自导出依赖「整页 DOM 可序列化 + 脚本已内联」。Vite 开发模式下脚本是 /src/main.ts（无法独立运行），
// 所以该能力在 `npm run build`（vite-plugin-singlefile，产出单文件 HTML）后使用才完整。开发模式点保存会提示用构建版。
//
// 坑（已踩过）：不要用正则在整页 HTML 字符串里替换存档节点——bundle 压缩源码里就含有
// `<script id="perlerSaved">` 模板字符串，正则会先匹配到它，把大段初始化代码替换成 JSON，
// 导出文件直接语法报错白屏。必须走 DOM：改写真实节点的 textContent 后再序列化 outerHTML。
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
  // 标题必须先还原：blueprintKey/progressKey/srcImgKey 全部按标题查，
  // 不还原的话 loadBlueprint 会拿默认标题「拼豆图纸」去查档 → 键位错位 → 白屏（已踩坑）
  const t = decodeURIComponent(taskKeyFromSnap(snap) || '');
  if (t) {
    store.set({ title: t });
    const h1 = document.getElementById('taskTitle');
    if (h1) h1.textContent = t;
  }
  const stampKey = SAVE_STAMP_KEY(taskKeyFromSnap(snap));
  try {
    if (Number(localStorage.getItem(stampKey) || 0) >= snap.savedAt) return;
    for (const k of saveFileKeysFromSnap(snap)) if (!(k in snap.items)) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(snap.items)) localStorage.setItem(k, v as string);
    localStorage.setItem(stampKey, String(snap.savedAt));
  } catch (e) { /* ignore */ }
}

function taskKeyFromSnap(snap: any): string {
  // 存档键里含标题编码，优先取 blueprint 键推断（srcimg/progress 等键次之）
  const keys = Object.keys(snap.items);
  const k = keys.find((x) => x.startsWith('perler-blueprint-')) || keys.find((x) => x.startsWith('perler-'));
  if (!k) return '';
  const m = k.match(/perler-(?:blueprint|progress|srcimg)-(.+?)(?:-|$)/);
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

  // 克隆整棵树操作（不污染活页面）：更新存档节点 + 剥离外部注入脚本（CDN beacon 等，file:// 打开只会报错）
  // 绝不能用正则替换 HTML 字符串，会误伤 bundle 源码，见文件头注释
  const root = document.documentElement.cloneNode(true) as HTMLElement;
  let node = root.querySelector('#perlerSaved') as HTMLScriptElement | null;
  if (!node) {
    node = document.createElement('script');
    node.id = 'perlerSaved';
    node.type = 'application/json';
    (root.querySelector('body') || root).appendChild(node);
  }
  node.textContent = json;
  root.querySelectorAll('script[src]').forEach((x) => x.remove());
  // outerHTML 不含 doctype，补上避免 quirks 模式
  const html = '<!DOCTYPE html>\n' + root.outerHTML;

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
