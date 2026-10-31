# 墨墨学习助手（Firefox / Zen / Chrome / Edge）

面向墨墨背单词网页版的 Manifest V3 扩展。提供可配置键盘操作、自动进入学习、全屏净化、阅读卡片、Mac 风格三色按钮和明暗主题。网页操作使用原生 JavaScript，玻璃背景单独使用 `liquid-glass-react`，不接管网站组件。

项目文档：[项目总览与待办](docs/PROJECT.md) · [Hermes 接管说明](docs/HERMES_HANDOFF.md) · [开发与测试](CONTRIBUTING.md) · [版本记录](CHANGELOG.md)。

## 0.3.3 浏览器版本

同一份源码生成两个版本：`firefox` 用于 Firefox / Zen，`chromium` 用于 Chrome / Edge。设置、图标和打开设置页的操作同时支持 `browser` 与 `chrome` API；Chromium 清单去掉 Gecko 专用字段，最低 Chromium 版本设为 120。

| 浏览器 | 开发载入目录 | 分发文件 |
| --- | --- | --- |
| Firefox / Zen | `dist/firefox` | `maimemo-keyboard-helper-firefox-0.3.3.zip` |
| Chrome / Edge | `dist/chromium` | `maimemo-keyboard-helper-chromium-0.3.3.zip` |

0.3.3 恢复上一版的白灰／深灰蓝配色，右侧使用均匀底色，撤销新增的蓝紫渐变；左侧青色渐变和已修正的玻璃背景采样保留。

0.3.2 修正 Chrome 中只有磨砂底色、没有实际背景折射的问题：将库生成的 SVG 接到面板自身的背景采样，移除内层叠加模糊和 12% 的折射层透明度限制。增加背景纹理位移与前景文字不变的像素回归。

## 外观与布局

官网猫头鹰图标按透明原貌等比例显示，移除额外添加的绿色背景、内边距、圆角和阴影。图像随扩展打包，来源记录见 [官网图标](docs/brand-assets.md)。

将原新拟态外观替换为指定的 [Liquid Glass React](https://github.com/rdev/liquid-glass-react) 组件，应用于导航、释义、记忆历史、阅读区、主题按钮和扩展界面。玻璃单独渲染在背景层，正文、原生按钮和事件保留；关闭弹性位移，保持单词与控件的位置稳定。左侧青色渐变、Arial 常规字重、红色目标词和记忆历史位置沿用。

上游说明 Firefox / Safari 只能部分支持效果：不显示折射位移，仍保留模糊和边缘高光。设置页新增“玻璃效果”：默认“完整 Liquid Glass”，也可选“跟随系统”或“纯色背景”。“跟随系统”会在系统启用“降低透明度”时使用更实的底色；完整模式按扩展中的明确选择显示。具体接入方式、版本与许可证见 [Liquid Glass 接入记录](docs/liquid-glass.md)。

顶部两段文字保持移除，主题按钮整合在页内工具栏。学习区铺满可用宽高，原生导航位于左侧；单词和音标保持固定位置。长释义、记忆历史和例句可在内部滚动，滚动条隐藏。

## 功能

- 将“自动跳过网页版公测说明”和“Web 学习页净化”两个用户脚本的功能整合进同一个扩展，来源与迁移说明见 [整合记录](docs/integrated-userscripts.md)。
- 自动进入：检查“我已阅读”的状态，勾选后等待页面渲染再点击“开始学习”；不反复点击，也不处理登录。
- 专注布局：隐藏官网导航和页脚，将学习 iframe 铺满窗口；没有学习框架时保留官网布局。
- 阅读卡片：重排单词、音标、释义、例句、助记与词典区域，支持窄屏和内容滚动。
- 三色按钮：左上角依次是红色 **忘记**、黄色 **模糊**、绿色 **认识**。悬停或键盘聚焦时显示动作、当前快捷键和网页提供的复习间隔；Tab 可聚焦，Enter / Space 可激活。
- 主题：**跟随系统 / 浅色 / 深色**。学习页工具栏右侧的主题按钮按此顺序切换；扩展弹窗和设置页也支持明暗主题。
- 可独立关闭自动进入、全屏净化、隐藏 toast、阅读卡片、三色按钮和快捷键。

## 默认快捷键

| 按键 | 动作 |
| --- | --- |
| Space | 显示答案 |
| 1 | 认识 |
| 2 | 模糊 / 不确定 |
| 3 | 忘记 / 不认识 |
| 4 | 熟知 |

反馈动作需要先显示答案；按住按键只触发一次，并抑制网页内置按键的重复提交。输入框、选择框、可编辑文本和中文输入法组合输入中不拦截按键。

点击扩展图标 → 设置，在对应输入框中按单键或组合键后保存。重复的按键不会保存；录制字母时请使用英文输入模式。旧版本的自定义按键会保留。停用自定义快捷键后，网站自己的快捷键仍按网站设置工作。

## 载入与更新

### Firefox / Zen

打开 `about:debugging#/runtime/this-firefox`，选择“临时载入附加组件”，载入 `dist/firefox/manifest.json` 或 Firefox ZIP。开发时也可继续使用根目录的 `manifest.json`。更新后点击“重新载入”，再刷新学习页。临时扩展在浏览器重启后需要重新载入。

### Chrome / Edge

1. 使用生成的 `dist/chromium`，或先将 Chromium ZIP 解压到一个固定文件夹。
2. Chrome 打开 `chrome://extensions`；Edge 打开 `edge://extensions`，开启“开发者模式”。
3. 选择“加载已解压的扩展程序”，选择包含 `manifest.json` 的 Chromium 文件夹。
4. 更新后在扩展管理页点击“重新加载”，再刷新学习页。请保留该文件夹，以便浏览器下次继续读取。

Chrome / Edge 的本地安装流程见 [Chrome 官方教程](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) 和 [Edge 官方教程](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading)。这两个浏览器共用 Chromium 包；不要选择仓库根目录作为 Chromium 安装目录。

两个版本都应停用 Tampermonkey 中原来的两个脚本，然后打开 `https://www.maimemo.com/home/web_study` 或 `https://tc-apis.maimemo.com/webstudy/app`，正常登录使用。ZIP 尚未经过扩展商店签名或上架。各浏览器分别保存设置，不会跨浏览器自动迁移。请从当前扩展入口打开设置，旧的扩展内部地址可能失效。

## 开发与验证

需要 Node.js 22.15 或更新版本。运行文件已经包含预编译的玻璃组件；开发和重新打包时才需要 npm。

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run check
npm run zip
# 只生成 Chrome / Edge 版
npm run build:chromium
npm run zip:chromium
# 指定 ZIP 输出目录
npm run zip -- --output-dir /path/to/outputs
```

- `npm test`：快捷键解析、两种扩展 API 的设置迁移、配置局部更新、五个动作、重复抑制、输入保护、组合键、路由范围、双版本清单和权限。
- `npm run check`：检查所有 JavaScript 语法。
- `npm run build:glass`：将 React 与 Liquid Glass 组件打包到 `content/liquid-glass.js`，生成第三方许可证。预编译文件已包含在项目和扩展 ZIP 内，载入扩展时无需运行 npm 或访问 CDN。
- `npm run build`：重建玻璃背景与 `dist/firefox`、`dist/chromium`。`dist` 是可重复生成的安装目录，构建时会重建对应子目录。
- `npm run zip`：生成两个安装目录与两个 ZIP，默认写入本仓库的 `releases` 目录。打包使用 Node 标准库，支持 Windows、macOS 和 Linux，不再依赖 PowerShell；只打包运行文件与使用说明。

可选浏览器测试：安装开发用 Playwright 和其 Chromium 后运行 `npm run test:browser`。已有 Playwright 环境可通过 `MAIMEMO_PLAYWRIGHT_MODULE` 指向其 `index.mjs`，并可通过 `MAIMEMO_BROWSER_EXECUTABLE` 指定浏览器可执行文件。设置 `MAIMEMO_SCREENSHOT_DIR` 可导出浅色、深色、窄屏与设置页截图。此测试不属于扩展运行时。

`npm run test:browser:chromium` 使用仅有 `chrome` API 的模拟环境执行同一套回归。`npm run test:extension` 则将 `dist/chromium` 作为真实扩展加载，测试原生存储、内容脚本注入、扩展页面 CSP、弹窗和设置同步；另用背景条纹的实际像素验证折射位移、文字清晰度和作用范围，避免只检查组件是否存在。需要完整 Chromium，不能使用 headless-shell，可通过 `MAIMEMO_EXTENSION_BROWSER_EXECUTABLE` 指定路径。详见 [开发与测试](CONTRIBUTING.md)。

浏览器测试用本地拦截的模拟页面验证初始加载、异步勾选、仅进入一次、净化恢复、三色按钮、悬停提示、真实键盘事件、路由切换、主题、设置页和弹窗。布局覆盖 320 / 390 / 800 / 1440 / 1880 像素宽度，检查释义出现前后的单词与音标坐标、满高满宽、头部控件不重叠、原生侧栏切换、长释义与例句内部滚动，以及离开学习路由后的布局还原。示例单词为测试数据；测试不登录墨墨，不提交实际复习记录。墨墨更新页面结构后，仍需在实际学习页复核兼容性。

## 项目结构

```text
core/        快捷键工具、统一设置模型、扩展界面公共样式
content/     网页键盘操作、自动进入、主题与学习页样式
options/     完整偏好设置
popup/       快速开关与主题切换
tests/       无依赖单元测试与可选浏览器模拟测试
scripts/     语法检查与扩展打包
ui/          Liquid Glass 背景适配层源代码
docs/        项目管理、交接、用户脚本与第三方资源说明
dist/        生成的双版本安装目录（不提交 Git）
releases/    生成的双版本 ZIP（不提交 Git）
```

## 数据与权限

只使用 `storage` 权限，并将匹配范围限制在墨墨官网学习页和学习应用。只从当前页面读取展示和控件识别所需的 DOM，持久化数据仅有开关、主题和快捷键；不读取账号凭证或页面 token，不持久化词汇、例句或记忆历史。扩展通过网页现有控件触发正常 DOM 点击，不调用墨墨接口或直接修改复习数据。

项目是独立的网页辅助工具，与墨墨官方无隶属关系。项目自身源码采用 MIT License，见根目录 `LICENSE`。组件许可证见 `docs/third-party-licenses.txt`；官网图标用于扩展页面内的视觉复用，不作为 GitHub 仓库头像或项目自有 Logo，来源和权利边界见 `docs/brand-assets.md`。
