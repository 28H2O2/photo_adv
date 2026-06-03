# photo_adv

复现并超越 iPhone iOS 锁屏照片“智能裁剪 + 深度效果”的工具/引擎。

让普通随手拍的照片，在锁屏上呈现专业、美观、主体突出、构图精妙的视觉效果（类似或更好 iOS 16+ / iOS 26 Spatial Scenes）。

## 核心目标
- **输入**：用户普通照片（构图一般、主体不突出、边缘杂乱也可）。
- **输出**：推荐的裁剪版本 + 可选主体分离/分层合成 + 锁屏预览模拟（含时钟互动、视差）。
- **一键导出**适合 iPhone 设置的壁纸（支持不同机型安全区）。

## 为什么值得做
iOS 的“魔法”不是简单裁剪，而是：
- 高质量 class-agnostic salient object segmentation（主体任意物体，on-device）。
- 主体感知 + 锁屏 UI 感知的 framing。
- 分层渲染（Depth Effect / Spatial）让照片瞬间高级。

详见 `docs/research/20250603-iOS锁屏深度效果技术原理解析与开源替代方案.md`。

## 当前状态（已支持 Vercel 一键部署）
- **纯前端项目**：Vite + TypeScript + Tailwind + Canvas（完全客户端）。
- 核心功能：smartcrop.js 智能构图 + 实时 iPhone 锁屏交互编辑 + 动态 Depth Effect 分层模拟。
- 已提供 `vercel.json`，可**零配置直接部署到 Vercel**（推荐）。
- 旧 Python 代码已归档到 `legacy/python/`。
- 本地运行：`npm install && npm run dev`。

## 快速开始（立即可用）
```bash
npm install
npm run dev
```

浏览器会自动打开（默认 http://localhost:5173）。

**使用方式**：
1. 拖拽或点击上传一张照片（构图一般的也没关系）
2. 在 iPhone 锁屏模拟器里**拖动平移 / 滚轮缩放**照片
3. 点击「智能推荐」按钮，使用 smartcrop.js 自动给出好构图起点
4. 实时看到右侧其他尺寸结果跟随更新
5. 右侧「全部导出为 PNG」或点击单张下载

**核心亮点**：
- 纯前端 Canvas 实现 iPhone 锁屏交互（类似真机设置壁纸）
- 智能构图推荐（smartcrop.js）
- 动态 Depth Effect 模拟（时钟被主体“盖住”）
- 支持多种常用输出尺寸（iPhone 锁屏、壁纸、社交竖版、正方形等）

所有处理都在浏览器本地完成，照片不会上传到任何服务器。

## 目录结构
```
.
├── .gitignore
├── vercel.json              # Vercel 部署配置
├── package.json
├── vite.config.ts
├── CLAUDE.md
├── README.md
├── index.html
├── src/
│   ├── main.ts              # 应用入口 + UI 交互
│   ├── CropEngine.ts        # 核心：smartcrop + transform + Canvas 绘制 + depth 模拟
│   └── style.css
├── legacy/
│   └── python/              # 旧版 Python Gradio 实现（仅供算法参考）
├── docs/
│   └── research/            # 技术调研（iOS 机制 + 开源方案）
└── dist/                    # 构建产物（可直接部署）
```

## 部署到 Vercel（最方便的方式）
这个项目是标准的 Vite 静态站点，**零配置即可部署到 Vercel**，我们已提供 `vercel.json`。

### 最快方式（推荐）
1. 把当前代码 push 到 GitHub
2. 打开 https://vercel.com/new
3. 导入你的 GitHub 仓库
4. Vercel 自动检测为 Vite 项目，直接点击 Deploy

部署完成后：
- 每次 `git push` → 自动生产部署
- 每次 Pull Request → 自动生成 Preview 链接（可直接测试）

### 使用 Vercel CLI 本地部署
```bash
npx vercel
```

首次会引导登录和项目设置，之后：
```bash
npx vercel --prod   # 直接部署到生产环境
```

`vercel.json` 已配置好：
- 框架识别为 Vite
- 构建命令 `npm run build`
- 输出目录 `dist`
- 提供 SPA fallback（便于未来扩展）

部署后完全免费，支持自定义域名、边缘函数（如果以后需要）、全球加速。

### 本地构建验证（部署前建议）
```bash
npm run build
# 产物在 dist/ 目录，可用任意静态服务器预览
npx serve dist
```

## 下一步计划（按用户期望迭代）
- 集成真实浏览器端主体分割（@mediapipe/tasks-vision），让 Depth 效果更接近原生 iOS。
- 支持自定义输出尺寸和更多 iPhone 机型比例。
- 增加“视差预览”（鼠标/设备倾斜模拟 spatial 效果）。
- 添加导出时自动生成 iPhone 锁屏推荐设置提示。
- 持续用真实“一般照片”测试并优化 CropEngine 构图逻辑。

## 贡献与规则
严格遵守 `CLAUDE.md`（新项目规范第一）。所有变更必须更新文档 + 跑验证。
真实照片测试驱动 + 前端视觉检查优先（尤其是 iPhone mock 的时钟定位、分层效果、文字可读性）。

---

*用第一性原理做让用户“哇”一下的照片工具。*
