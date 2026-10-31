# Hermes 接管与 GitHub 发布交接

## 配色调整：0.3.3（本地待提交、发布）

用户要求去掉右侧渐变并保留上一版的颜色。现恢复 0.3.1 的浅色／暗色表面色值，工作区使用均匀白灰／深灰蓝背景，保留左侧青色渐变和 0.3.2 的玻璃采样修正。当前工作树与新包版本为 0.3.3。

## 后续修正：0.3.2（本地待提交、发布）

用户在 Chrome 实测后报告玻璃效果不可见。现已将真实组件的 SVG 位移滤镜接到面板自身的 `backdrop-filter`，移除阻隔背景采样的内层模糊与 12% 透明度；新增完整玻璃、跟随系统和纯色模式，保留旧设置及图标。默认完整模式不会被 Windows 的“降低透明度”报告自动覆盖。

Chrome for Testing 156.0.8078.4 的真实扩展测试已加入像素对照：17 处背景条纹边界发生位移、最大 14px；正文和面板外像素保持一致。快捷键、布局和设置回归继续保留。源码、构建版本和交付包已更新为 0.3.2；本轮不修改已发布的 v0.3.1 Release，也不自动推送 GitHub。后续维护者审阅当前 diff 后提交并按需发布 v0.3.2。

下方保留 v0.3.1 的接管及首次发布记录。

日期：2026-10-30。版本：0.3.1。以当前工作树为完整开发源，不以旧 ZIP 或初始 Git 提交代替。

## 先读哪些文件

1. `AGENTS.md`：协作、权限、数据与验证规则。
2. `README.md`：用户功能、双版本安装和常用命令。
3. `docs/PROJECT.md`：架构、已实现内容、验证边界和下一步。
4. `CONTRIBUTING.md` 与 `CHANGELOG.md`：开发流程和版本变更。
5. `docs/brand-assets.md`、`docs/integrated-userscripts.md`、`docs/liquid-glass.md`、`docs/third-party-licenses.txt`：第三方来源与许可。

## 接管时的 Git 状态

- 接管前仅有初始提交 `697cab8`（`feat: add MaiMemo keyboard helper extension`）。
- 接管后已将完整源码、测试、文档、许可证和第三方资源说明提交为 `c24e524`（`feat: add MaiMemo keyboard helper extension`），当前本地分支为 `main`。
- 已创建公开远程仓库 `https://github.com/TUNTIANHAMMA-2/maimemo-keyboard-helper`，`origin/main` 与本地 `main` 已核对为同一提交。
- 工作树当前应保持干净；`node_modules`、生成目录、浏览器用户目录、账号信息和缓存不提交。`package.json` 的 `private: true` 仅防止意外发布到 npm，不妨碍 GitHub 公开仓库。

## 构建和交付

需要 Node.js 22.15+。在仓库根目录运行：

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run build
npm run zip
```

生成目录为 `dist/firefox`、`dist/chromium`；生成包为 `releases/maimemo-keyboard-helper-firefox-0.3.1.zip` 和 `releases/maimemo-keyboard-helper-chromium-0.3.1.zip`。Chrome 与 Edge 载入同一个 Chromium 目录，不能直接将 ZIP 拖入浏览器作为商店安装包。

`dist` 与 `releases` 已忽略，不提交 Git。源码、`package-lock.json`、`ui/liquid-glass-entry.js`、预编译的 `content/liquid-glass.js`、图标和第三方说明都属于项目文件。修改玻璃源代码后必须重新构建。根目录 `manifest.json` 保留 Firefox 身份，Chromium 清单由脚本自动派生。

## 发布前的具体工作

1. 审核整个工作树并完成本地测试，包含新的未跟踪文件。浏览器命令见 `CONTRIBUTING.md`。
2. 项目所有者已确定项目自身采用 MIT License，根目录已增加 `LICENSE`；组件和官网图标仍分别按各自来源与权利说明处理。
3. 官网猫头鹰图片来自 MaiMemo，使用者要求扩展在页面内保留原貌并进行位置复用；用户已确认它不作为 GitHub 仓库头像、仓库标识或项目自有 Logo。2026-10-30 已查阅官网《产品与服务使用协议》第 6.3 条；图片不属于项目自身 MIT 许可，公开发布时必须保留来源、用途和权利边界说明，不要修改本地原图后又声称是项目原创。详情见 `docs/brand-assets.md`。
4. 对照 `git status --short` 检查待提交清单。不要提交 `node_modules`、生成目录、浏览器用户目录、账号信息、缓存或真实学习记录。测试夹具全部是模拟数据。
5. 已使用 GitHub 账号 `TUNTIANHAMMA-2` 创建公开仓库 `maimemo-keyboard-helper`，默认分支为 `main`，远程地址为 `https://github.com/TUNTIANHAMMA-2/maimemo-keyboard-helper`。
6. `v0.3.1` Release 已发布，包含 Firefox 与 Chromium 两个 ZIP；发布后已核对两个资产名称、大小和下载 URL。
7. Release URL：`https://github.com/TUNTIANHAMMA-2/maimemo-keyboard-helper/releases/tag/v0.3.1`；Release 标签指向提交 `49701afe1a0e91d73c950bf3953ee72bc06e5557`。扩展商店上架不在本次已完成范围内。

## 本轮验证记录

- 单元测试已覆盖 `browser` / `chrome` 设置、快捷键以及双版本清单和权限一致性。
- 两种 API 的完整模拟浏览器回归均已通过，包含 320 / 390 / 800 / 1440 / 1880 像素布局、记忆历史、输入保护与路由恢复。
- 在手动下载的 Chrome for Testing 156.0.8078.4 中成功加载 Chromium 目录，验证了真实扩展 API、持久化设置、`storage.onChanged`、CSP、本地图标与组件、自动注入、快捷键和打开设置页。
- `npx playwright install chromium` 曾因下载通道 TLS 错误失败；改用同一 Chrome for Testing 构建的代理下载后，原生扩展测试通过。
- 浏览器测试使用本地模拟页面，不访问现有浏览器用户目录，不登录墨墨，也不提交真实学习记录。
- Google Chrome、Microsoft Edge、Firefox / Zen 的真实账号学习页仍需人工复核。不要把 Chromium 自动化或 Firefox 用户代理模拟称作所有品牌浏览器已实测。

交接文档记录的是 2026-10-30 的本地状态。接管后请先复核当前 Git 与版本状态，再把新的验收结果写入版本记录。
