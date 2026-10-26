/** Web Share 文件分享 + 下载降级（移动端「存相册/存文件」能力，桌面端自动回退下载） */

/** 当前环境能否以分享面板发送这些文件（需 HTTPS，file:// 下为 false 走下载） */
export function canShareFiles(files: File[]): boolean {
  try {
    return typeof navigator !== 'undefined'
      && typeof navigator.canShare === 'function'
      && navigator.canShare({ files });
  } catch {
    return false;
  }
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * 优先走系统分享面板（iOS：PNG 可「存储图像」进相册，PDF 可「存储到文件」；
 * Android：可选相册/微信）。不支持时自动回退浏览器下载。
 */
export async function shareOrDownload(file: File): Promise<ShareOutcome> {
  if (canShareFiles([file])) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (e) {
      // 用户取消分享面板不算失败，也不必再弹下载
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
      // 其他错误（如数据无效）继续走下载
    }
  }
  downloadFile(file);
  return 'downloaded';
}

/** 浏览器下载兜底（兼容桌面与不支持 Web Share 的移动浏览器） */
export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** canvas → PNG File（用于分享） */
export function canvasToPngFile(cv: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    cv.toBlob((blob) => {
      if (!blob) { reject(new Error('canvas toBlob 失败')); return; }
      resolve(new File([blob], name, { type: 'image/png' }));
    }, 'image/png');
  });
}
