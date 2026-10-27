# perler-blueprint · 项目记忆（AGENTS/MEMORY）

> 本文件给「开新对话」时快速建立上下文。改了架构/约定请同步更新这里。

## 它是什么
拼豆（Perler / Fuse Bead）**交互图纸生成器**：用户上传一张图片 → 客户端栅格化 → 量化到拼豆色板 → 生成 2D 图纸 + 3D 豆板，支持换色板、限色、镜像、中/EN 双语、进度标记，**并能把当前图纸「保存为随身的单文件 HTML」**。

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
  i18n.ts           [I18N] 中/EN 双语：字典 + t() 动态文案 + data-i18n 静态替换（localStorage 'perler-lang'，默认跟浏览器语言）
  styles/main.css   暗色 Valorant 风设计系统
  core/
    types.ts        BeadColor / Palette / SizeSpec / Blueprint
    color.ts        rgb<->lab、ΔE76、hex 工具
    rasterize.ts    图片→离屏 canvas 缩放裁切→逐像素 RGB
    quantize.ts     RGB→最近色板色（lab 距离）+ 可选 Floyd–Steinberg 抖动；限色用 k-means 语义聚类（Lab 空间、k-means++、固定种子确定性）
    depth.ts        [DEPTH-3D] 客户端启发式深度估计：亮度+居中加权+平滑→等频分 7 层，供 3D 立体分层
  data/
    palettes.ts     从原型抽取的真实色板（25 板 / 3759 色）⚠️ 自动生成勿手改
    sizes.ts        板规格 36/52/78/104/156
  render/
    grid2d.ts       2D 图纸 canvas（镜像/高亮/已完成标记）
    stage3d.ts      Three.js 3D 豆板（OrbitControls）：圆珠=圆柱+顶面环形假孔贴图（实例色染色），钉板底座=深蓝板+空位凸点（InstancedMesh）；[DEPTH-3D] depth3d=true 时按 depth.ts 分层堆叠（只渲染顶珠+侧露珠）。共享几何/材质在构造器创建，重建场景只释放新建部分
  state/store.ts    轻量可观察状态机（subscribe）
  persist/
    storage.ts      localStorage 兜底(MemStorage) + 进度 + 图纸持久化
    saveFile.ts     [SAVE-FILE] 自导出单文件 HTML（存档随文件走）
  ui/
    upload.ts       核心新能力：generateFromImage(file,size,palette,maxColors)
    editor.ts       [EDIT-MODE] 画笔/填充/橡皮/取色 + diff 版撤销重做栈（同批同格合并、batch 上限100）
    poster.ts       [POSTER] 导出海报：弹层预览 + 下载 PNG / PDF（依赖 jspdf）
    compare.ts      [COMPARE] 原图对比弹层：左原图缩略图（存档 dataURL）、右图纸色块平铺，同高并排核对量化
    paletteSearch.ts [ALL-COLORS] 全部色号搜索面板（色号/名称/HEX），点选设为编辑色
    batch.ts        [BATCH] 批量导出：全部标准规格合集 PDF（每规格一页海报）+ 配色统计 CSV（含 BOM）；有源图重新量化，无源图（存档）最近邻重采样
    share.ts        [SHARE] Web Share 文件分享 + 下载降级：PNG 分享可进相册（iOS「存储图像」），PDF 可存「文件」/发微信；canShare 探测，不支持/file:// 自动回退 a[download]（需 HTTPS）
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
5. **指针手势统一走 Pointer Events**（main.ts 平移/捏合 + editor.ts 绘制）：单指=平移或绘制（编辑工具激活时归编辑器），双指=捏合缩放（会调 editor.cancelDraw 让位），桌面滚轮缩放保留。改画布交互别再回退到 mouse 事件。
6. **移动端布局在 `main.css` 的 `@media (max-width: 820px)`**：上下结构（画布 flex:1 在上、aside 收成 ≤42vh 底部抽屉）、header 按钮换行、触控目标 ≥36px、输入框 16px 防 iOS 聚焦缩放、toast 抬到抽屉上方。
7. **单文件导出禁止用正则替换整页 HTML 字符串**（saveFile.ts，已踩坑出过线上事故）：bundle 压缩源码里就含有 `<script id="perlerSaved">` 模板字符串，正则会先匹配到它并把大段初始化代码替换成 JSON，导出文件直接语法报错白屏。必须走 DOM（cloneNode 后改写 `#perlerSaved` 节点 textContent，顺手剥离 `script[src]` 外部注入脚本），并手动补 `<!DOCTYPE html>` 前缀（outerHTML 不含 doctype，缺了会进 quirks 模式）。
8. **所有存档键（blueprint/progress/srcimg）都按标题编码**：打开导出文件时 restoreFromEmbedded 必须先从存档键解出标题回写 store，否则后续查询用默认标题「拼豆图纸」全部落空（白屏）；读进度前还要用 blueprint 的 w/paletteId 对齐 store.size/paletteId（进度键含这两项）。
9. **新增 UI 文案必须走 i18n**：静态 HTML 用 `data-i18n` / `data-i18n-title` / `data-i18n-ph` 属性；JS 动态文案用 `t('key', params)`（`{n}` 占位符），key 加进 `src/i18n.ts` 字典（`[zh, en]` 二元组）。切换语言时 main.ts 的 onLangChange 回调会重刷动态列表（尺寸/色板/用量/hint）。

## 与原型的功能对照（保留 / 新增 / 暂未搬）
- ✅ 保留：多视图(平面/3D)、色板切换、规格(含自定义 N)、限色档位、镜像、颜色用量列表、进度(高亮/已完成)持久化、自导出单文件、Valorant 视觉、**编辑模式(画笔/填充/橡皮/取色+撤销重做)**、**海报导出(PNG/PDF)**、**全色号搜索选色面板**。
- ✅ 新增：上传图片→自动生成图纸（原型无）；**限色 k-means 语义聚类**；**批量导出**（多规格合集 PDF + 配色统计 CSV）；**3D 立体分层**（启发式深度 7 层堆叠）；**圆珠+钉板 3D 视觉**（圆柱+环形假孔贴图，对标原型）；**Web Share 分享/存相册**（PNG 进相册、PDF 存文件，降级下载）；**移动端适配**（Pointer Events 手势+上下布局）；**孤立像素检测/一键清除**；**恢复初始图纸**；**3D 俯视按钮**；**缩放百分比角标**（双击画布=适配窗口）；**用量清单全选标记**；**中/EN 双语切换**（header 按钮，含海报画布/导出文件名/CSV 表头）。
- ❌ 已砍：style-picker 画风提示词库（老板确认不要；它只做「复制提示词回对话重做」，依赖外部 AI，与「上传图→量化成拼豆」核心闭环无关）；**模拟烫豆**（melt，2026-10-27 老板确认装饰性可有可无，全链路删除：store/grid2d/stage3d/main/HTML）。
- ⚠️ 原型尚未复刻（按价值排序待拍板）：套索/框选批量操作（建议降级为矩形框选）；编辑版本历史面板（现只有 100 步撤销栈）。像素视图+原图对比视图已做（store.pixelView 渲染档位 + ui/compare.ts）。
- ⚠️ 3D 立体的深度是**客户端启发式**（亮度+居中加权），不是 MiDaS 单目深度估计——为保单文件离线可用。要真深度得上 ONNX Runtime（包体+几十 MB）或服务端 API，待拍板。

## 后续可做的增强（待老板拍板）
- 3D 深度升级：MiDaS 真单目深度估计（ONNX Runtime Web 或服务端），替代当前启发式。
- 立体分层层级可调（当前固定 7 层）+ 层间配色方案。
- 批量导出加规格勾选 UI（当前固定全 5 档标准规格）。
