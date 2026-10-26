# perler-blueprint · 项目记忆（AGENTS/MEMORY）

> 本文件给「开新对话」时快速建立上下文。改了架构/约定请同步更新这里。

## 它是什么
拼豆（Perler / Fuse Bead）**交互图纸生成器**：用户上传一张图片 → 客户端栅格化 → 量化到拼豆色板 → 生成 2D 图纸 + 3D 豆板，支持换色板、限色、镜像、模拟烫豆、进度标记，**并能把当前图纸「保存为随身的单文件 HTML」**。

## 来源与血缘
- 原型是 `D:\Projects\demos\workbuddy-records\perler-zero\output\【拼豆专家】零的谍影-...html`（4.8MB 内联单文件，Valorant 视觉风）。那个文件是**预烘焙查看器**：像素→色号矩阵（DEMO_DATA.matrix）由外部 AI 流水线生成，客户端无上传入口。
- 本工程是**路线 A 的模块化重建**：从原型抽取真实资产（色板）+ 新增「上传图片→生成」流水线。原型注释里出现过 `js/style-picker.js`、`js/save-file.js`、`assets/style_guide.json`，说明原型本就是模块化 js 工程被内联——本工程把它正式落成可维护结构。

## 工程结构（D:\Projects\demos\front_end\perler-blueprint）
```
package.json        vite + three + typescript + vite-plugin-singlefile
vite.config.ts      单文件构建（保证「保存为单文件」可用）
index.html          含 #perlerSaved 存档注入点 + 上传/导出/保存按钮
src/
  main.ts           编排根：装配 UI / 渲染器 / 持久化 / 事件
  styles/main.css   暗色 Valorant 风设计系统
  core/
    types.ts        BeadColor / Palette / SizeSpec / Blueprint
    color.ts        rgb<->lab、ΔE76、hex 工具
    rasterize.ts    图片→离屏 canvas 缩放裁切→逐像素 RGB
    quantize.ts     RGB→最近色板色（lab 距离）+ 可选 Floyd–Steinberg 抖动 + 限色上限
  data/
    palettes.ts     从原型抽取的真实色板（25 板 / 3759 色）⚠️ 自动生成勿手改
    sizes.ts        板规格 36/52/78/104/156
  render/
    grid2d.ts       2D 图纸 canvas（镜像/烫豆/高亮/已完成标记）
    stage3d.ts      Three.js 实例化珠子 3D 豆板（OrbitControls）
  state/store.ts    轻量可观察状态机（subscribe）
  persist/
    storage.ts      localStorage 兜底(MemStorage) + 进度 + 图纸持久化
    saveFile.ts     [SAVE-FILE] 自导出单文件 HTML（存档随文件走）
  ui/
    upload.ts       核心新能力：generateFromImage(file,size,palette,maxColors)
    editor.ts       [EDIT-MODE] 画笔/填充/橡皮/取色 + diff 版撤销重做栈（同批同格合并、batch 上限100）
    poster.ts       [POSTER] 导出海报：弹层预览 + 下载 PNG / PDF（依赖 jspdf）
    paletteSearch.ts [ALL-COLORS] 全部色号搜索面板（色号/名称/HEX），点选设为编辑色
  render/
    poster.ts      drawPoster()：标题 + 图纸预览 + 色号对照表，返回离屏 canvas
  deps: vite, three, typescript, vite-plugin-singlefile, @types/three, jspdf
scripts/
  extract-palettes.mjs  从原型 HTML 抽 palettes → src/data/palettes.ts
```

## 数据模型
- `Blueprint { w, h, paletteId, codes: (string|null)[], sourceName? }` —— `codes` 行优先，长度 w*h，null=背景留白。
- `Palette { id, label, colors: {code,name,rgb,hex,lab?}[] }`。
- 色板匹配用 Lab+ΔE76（比 RGB 欧氏更准）；`dither` 为可选抖动。

## 命令
- `npm install`
- `npm run dev`       开发（Vite，HMR）
- `npm run build`     tsc + vite 构建 → **单文件 HTML**（带内联 JS，saveFile 自导出依赖此产物）
- `npm run preview`

## 关键约定 / 坑
1. **「保存为单文件 HTML」只在 `npm run build` 后的产物里完整可用**：开发模式脚本是 `/src/main.ts`，序列化 DOM 无法独立运行，导出会提示用构建版。
2. `src/data/palettes.ts` 由 `scripts/extract-palettes.mjs` 生成，**不要手改**；要加色板重新跑脚本。
3. three 类型用 `@types/three`；若升级 three 大版本需同步 @types/three。
4. 3D 视图是「2D 网格挤出成豆板」，不是原型那种手工堆叠 7 层立体雕塑——单张照片推导不出深度（见下）。

## 与原型的功能对照（保留 / 新增 / 暂未搬）
- ✅ 保留：多视图(平面/3D)、色板切换、规格(含自定义 N)、限色档位、镜像、模拟烫豆、颜色用量列表、进度(高亮/已完成)持久化、自导出单文件、Valorant 视觉、**编辑模式(画笔/填充/橡皮/取色+撤销重做)**、**海报导出(PNG/PDF)**、**全色号搜索选色面板**。
- ✅ 新增：上传图片→自动生成图纸（原型无）。
- ❌ 已砍：style-picker 画风提示词库（老板确认不要；它只做「复制提示词回对话重做」，依赖外部 AI，与「上传图→量化成拼豆」核心闭环无关）。
- ⚠️ 暂未搬：原型特有的 7 层 3D 雕塑坐标（非单图可推导，需单目深度估计）、海报的「保存 PDF 到相册」移动端原生能力（当前用浏览器下载，已满足分享）。

## 后续可做的增强（待老板拍板）
- 加「编辑模式」画笔/填充/橡皮复刻原型。
- 3D 升级：单目深度估计(MiDaS) 把 2D 挤出变真·立体。
- 批量导出：一图生成多规格合集、配色统计 CSV。
- 限色时改用语义聚类(k-means)而非纯按用量截断。
