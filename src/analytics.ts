// [ANALYTICS] GoatCounter 匿名事件埋点。
// 只上报「事件名 + 语言/设备维度」，不含图片内容、用户输入、精确路径。
// 说明：index.html 里的 gc.zgo.at 脚本是外部 script[src]，导出单文件时会被
// saveFile.ts 剥离——所以导出的本地单文件 HTML 不上报（file:// 下也无法上报）。

import { getLang } from './i18n';

declare global {
  interface Window {
    goatcounter?: { count?: (p: { event?: string; path?: string }) => void };
  }
}

interface Pending { event: string; path: string }

const queue: Pending[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function isMobile(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

/**
 * 记录匿名事件。path 编码环境维度，方便在 GoatCounter 按路径分组看：
 * /e/{事件}[/{细节}]/{语言}/{m|d}   例：/e/upload/104/mard48/zh/m
 * 事件名用小写字母和短横线（GoatCounter 事件名规范）。
 */
export function track(event: string, detail?: string): void {
  try {
    const path = `/e/${event}${detail ? '/' + detail : ''}/${getLang()}/${isMobile() ? 'm' : 'd'}`;
    const count = window.goatcounter?.count;
    if (count) {
      count({ event, path });
      return;
    }
    // count.js 是 async 的，可能还没就绪：排队轮询，20 秒后放弃（离线 / file:// 场景）
    queue.push({ event, path });
    if (!flushTimer) {
      let tries = 0;
      flushTimer = setInterval(() => {
        const c = window.goatcounter?.count;
        if (c) {
          clearInterval(flushTimer!); flushTimer = null;
          while (queue.length) {
            const p = queue.shift()!;
            c({ event: p.event, path: p.path });
          }
        } else if (++tries > 40) {
          clearInterval(flushTimer!); flushTimer = null;
          queue.length = 0;
        }
      }, 500);
    }
  } catch { /* 统计绝不影响功能 */ }
}
