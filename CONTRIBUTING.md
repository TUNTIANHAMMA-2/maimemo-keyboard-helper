# 开发与验证

## 环境和入口

Node.js 22.15+、npm。先读本仓库的 `README.md`。运行 `npm ci --ignore-scripts` 安装锁定依赖；所有扩展运行代码本地打包，不从 CDN 加载脚本。

网站交互保持原生 JavaScript；React 只绘制装饰背景。不要将网站 DOM 交给本项目 React 管理，也不要直接调用网站内部 React 状态或未公开 API。

## 日常命令

```sh
npm test
npm run check
npm run build
npm run zip
```

- `build` 生成两个浏览器目录；`build:firefox`、`build:chromium` 可单独生成。
- `zip` 生成两个 ZIP；`zip:firefox`、`zip:chromium` 可单独打包。
- `npm run zip -- --output-dir /path/to/outputs` 可以指定交付位置。
- 版本同时维护根目录 `manifest.json`、`package.json` 和 `package-lock.json`，构建会检查前两者一致。
- `dist/<目标>` 每次构建都会重建，不在其中手工开发或保存其他文件。

## 浏览器回归

Playwright 仅用于开发测试，不进入扩展 ZIP。可在开发环境安装：

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:browser
npm run test:browser:chromium
npm run build:chromium
npm run test:extension
```

已有 Playwright 环境可以通过以下变量复用，无需加入项目依赖：

| 环境变量 | 用途 |
| --- | --- |
| `MAIMEMO_PLAYWRIGHT_MODULE` | Playwright `index.mjs` 的绝对路径 |
| `MAIMEMO_BROWSER_EXECUTABLE` | 模拟页测试所用 Chromium 可执行文件，允许 headless-shell |
| `MAIMEMO_EXTENSION_BROWSER_EXECUTABLE` | 原生扩展测试所用完整 Chromium 可执行文件，不能使用 headless-shell |
| `MAIMEMO_SCREENSHOT_DIR` | 可选截图输出目录，建议使用仓库外的临时目录 |

`test:browser` 只提供 Firefox 风格 `browser` API；`test:browser:chromium` 只提供 `chrome` API。两者覆盖自动进入、主题、三色按钮、输入保护、去重、记忆历史、路由恢复和多尺寸布局。Firefox 用户代理分支模拟不等于原生 Gecko 测试。

`test:extension` 真正加载 `dist/chromium`，验证清单、原生存储、设置同步、内容脚本和样式自动注入、扩展 CSP、图标、弹窗与设置页。使用随机临时用户目录并在结束时清理，网页请求由测试夹具本地响应，不操作真实账号。自动化建议使用 Playwright 分发的 Chromium；品牌 Chrome / Edge 的侧载限制可能不同，按 README 人工载入核验。

控件与弹窗的回归还包括：回忆／释义界面三色按钮和统计位置不变，禁用状态不提交，关闭三色按钮收回左侧空位；弹窗录制与重复键校验、失败后保留编辑、常用开关不覆盖快捷键草稿，以及原生扩展存储重载、快捷键实时同步和页面重新应用。

玻璃回归还会加载 `tests/fixtures/glass-optics.html`，对比启用与关闭 SVG 位移时的截图像素：背景条纹必须实际移动，前景正文和面板外像素必须保持一致。`tests/png-reader.mjs` 只解码 Chromium 的测试截图，不加入扩展包。修改玻璃滤镜、透明度或合成层次时，不能用“SVG 元素存在”代替该光学检查。

## 提交与版本交付

提交前运行必需检查并检查 `git status --short`，特别注意未跟踪文件。保持 `content/liquid-glass.js` 与源代码一致，保留 `docs/third-party-licenses.txt`。不要提交依赖、安装目录、ZIP 或浏览器用户数据。

发布说明应写清：改动原因、浏览器目标、测试的实际层次、已知限制。网站 DOM 更新后，先在本地夹具复现，再由维护者用真实页面复核；不要以自动复习提交来测试功能。
