import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 单文件构建：保证 `npm run build` 产出一份自带所有 JS 的 HTML，
// 这样应用内的「保存为单文件 HTML」(saveFile) 才能像原版那样靠
// document.documentElement.outerHTML 序列化 + 注入 #perlerSaved 实现「存档随文件走」。
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
});
