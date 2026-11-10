import { t } from '../i18n';
import { encodeBlueprintLink } from '../persist/linkExport';
import { store } from '../state/store';

// 「手机打开」弹层：优先云端传输码（5 位码，24h 过期），失败降级为完整链接
// 云端走云开发 HTTP 网关（*.app.tcloudbase.com 默认域，无需备案）

const TRANSFER_API = 'https://cloud1-d6g66b4ru53fc2f55-1521186861.ap-shanghai.app.tcloudbase.com/transfer';

interface Opts {
  openBtn: HTMLElement;
  overlay: HTMLElement;
  codeArea: HTMLElement;
  codeEl: HTMLElement;
  stepsEl: HTMLElement;
  input: HTMLInputElement;
  noteEl: HTMLElement;
  copyBtn: HTMLElement;
  closeBtn: HTMLElement;
  // 小程序 → PC 反向导入：输码取 payload
  codeInput: HTMLInputElement;
  codeImportBtn: HTMLElement;
  onImport: (payload: string) => void;
  toast: (msg: string) => void;
}

async function fetchCode(payload: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(TRANSFER_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', payload }),
      signal: ctrl.signal,
    });
    const out = await res.json();
    return out && out.ok ? String(out.code) : null;
  } catch (err) {
    // file:// 打开（浏览器禁 fetch）/ 浏览器跟踪防护 / 代理拦截都会走到这里，具体原因看此日志
    console.warn('[phoneLink] 传输服务请求失败:', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 输码取 payload；返回 null 表示网络失败，{err} 为服务端错误码，成功返回纯 payload（#p= 后段） */
export async function fetchPayload(code: string): Promise<string | { err: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(TRANSFER_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get', code }),
      signal: ctrl.signal,
    });
    const out = await res.json();
    if (out && out.ok && out.payload) return String(out.payload);
    if (out && out.err) return { err: String(out.err) };
    return null;
  } catch (err) {
    console.warn('[phoneLink] 输码取图请求失败:', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function setupPhoneLink(opts: Opts): void {
  const { overlay, input, toast } = opts;

  const close = () => { overlay.hidden = true; };
  opts.closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) close(); });

  opts.openBtn.addEventListener('click', () => {
    const s = store.get();
    if (!s.blueprint) { toast(t('t.needBlueprint')); return; }
    const url = encodeBlueprintLink(s.blueprint, s.title);
    if (!url) { toast(t('t.linkTooManyColors')); return; }
    input.value = url;
    // 打开弹层，码区先进入 loading 态
    overlay.hidden = false;
    opts.codeArea.hidden = false;
    opts.stepsEl.hidden = true;
    opts.codeEl.textContent = '·····';
    opts.noteEl.textContent = t('ui.phoneNoteCode');
    // payload 去掉站点前缀，只传 "#p=" 后段（约省 30 字符，且云端不必存域名）
    const payload = url.split('#p=')[1] || '';
    fetchCode(payload).then((code) => {
      if (overlay.hidden) return; // 用户已关闭
      if (code) {
        opts.codeEl.textContent = code;
      } else {
        // 降级：传输服务不可用，展示链接方式
        opts.codeArea.hidden = true;
        opts.stepsEl.hidden = false;
        opts.noteEl.textContent = t('t.transferFallback');
      }
    });
  });

  opts.copyBtn.addEventListener('click', async () => {
    const url = input.value;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast(t('t.linkCopied'));
    } catch {
      input.select();
      document.execCommand('copy');
      toast(t('t.linkCopied'));
    }
  });

  // ---- 小程序 → PC：输码导入 ----
  const doImport = async () => {
    // 滤出码字符：整段粘贴「传输码 XXXXX」这类带前缀的文本也能识别
    const code = opts.codeInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) { toast(t('t.codeBad')); return; }
    opts.codeImportBtn.setAttribute('disabled', '');
    const out = await fetchPayload(code);
    opts.codeImportBtn.removeAttribute('disabled');
    if (out === null) { toast(t('t.codeGetFail')); return; }
    if (typeof out === 'object') {
      toast(out.err === 'expired' ? t('t.codeExpired')
        : out.err === 'not_found' ? t('t.codeNotFound')
        : t('t.codeGetFail'));
      return;
    }
    opts.codeInput.value = '';
    close();
    opts.onImport(out);
  };
  opts.codeImportBtn.addEventListener('click', doImport);
  opts.codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doImport(); });
}
