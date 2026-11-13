import mpCodeUrl from '../assets/wxacode.jpg';

let cached: Promise<HTMLImageElement | null> | null = null;

/**
 * 小程序码图（data URI → HTMLImageElement），导出物绘制共用，模块内缓存。
 * 加载失败返回 null（调用方跳过绘制，不阻塞导出）。
 */
export function loadMpCode(): Promise<HTMLImageElement | null> {
  if (!cached) {
    cached = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = mpCodeUrl;
    });
  }
  return cached;
}
