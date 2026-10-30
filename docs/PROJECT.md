# 项目总览与计划

## 定位与当前版本

墨墨学习助手是为 MaiMemo 网页学习页提供键盘操作和桌面阅读布局的 Manifest V3 扩展。当前工作树版本为 **0.3.1**，支持 Firefox / Zen 与 Chrome / Edge 两个构建目标。开发源目录以本文件上级的仓库根目录为准。

用户入口与安装方法在 `README.md`；协作规则在 `AGENTS.md`；开发命令在 `CONTRIBUTING.md`；接管和首次 GitHub 发布步骤在 `docs/HERMES_HANDOFF.md`。

## 已实现

- 五个可配置学习快捷键，长按抑制、输入与 IME 保护、原生操作去重。
- 公测页自动勾选与进入、官网外层导航和页脚净化、学习框架铺满窗口。
- 稳定的左右阅读布局、左侧原生导航、释义下方的记忆历史、内部滚动。
- 官网原始猫头鹰图标、左侧青色渐变、Arial 常规字体、红色例句目标词。
- Mac 风格三色操作按钮，悬停提示当前快捷键和原生复习间隔。
- 浅色、暗色、跟随系统；真实 Liquid Glass React 背景组件。
- Firefox / Chromium 清单生成、统一源码、独立安装目录与 ZIP。

## 代码职责

| 路径 | 职责 |
| --- | --- |
| `manifest.json` | Firefox 源清单、最小权限和网站匹配范围 |
| `core/settings.js` | 设置默认值、旧数据兼容、局部更新、两种扩展 API |
| `core/shortcut-utils.js` | 快捷键解析、输入识别和重复设置校验 |
| `content/maimemo-shortcuts.js` | 找到网页现有控件并触发正常点击 |
| `content/maimemo-page.js` | 布局状态、自动进入、图标、主题、历史镜像和三色按钮 |
| `content/maimemo-page.css` | 网站布局、字体、渐变、主题与响应式规则 |
| `ui/liquid-glass-entry.js` | React 仅管理自有的装饰背景，不接管网站 DOM |
| `content/liquid-glass.js` | esbuild 生成的本地组件包，随扩展分发 |
| `core/liquid-glass.css` | 玻璃表面、透明度、降低动态效果及高对比模式 |
| `options/`、`popup/` | 完整设置与快速开关 |
| `scripts/`、`tests/` | 双目标构建、打包、语法检查与回归测试 |

## 数据边界

只持久化 `maimemoKeyboardSettings` 下的开关、主题和快捷键。记忆历史从当页原生 DOM 显示为临时镜像，不写入扩展存储，也不记录词汇、账号凭证、页面 token 或真实学习日志。所有反馈动作通过网站现有按钮，不请求未公开接口。

## 验证层次

1. 单元测试：设置、按键事件和双目标清单。
2. 浏览器模拟页：分别只提供 `browser` 或 `chrome` API，验证布局、设置、路由和交互。
3. 原生扩展测试：在隔离的 Chromium 用户目录中真正加载生成的扩展，测试存储、CSP、注入和弹窗。网页内容仍是本地模拟数据。
4. 实际学习页：仍需维护者在自己的浏览器中复核，尤其是网站更新 DOM 后。没有用测试结果代替真实复习记录，也不自动提交账号下的学习操作。

## 接下来

| 优先级 | 事项 | 状态 |
| --- | --- | --- |
| P0 | Hermes 审阅全部未提交及未跟踪源码，确定项目自身开源协议 | 已审阅；MIT License 已加入根目录 |
| P0 | 处理官网图标公开再分发条件并保留第三方说明 | 已按用途区分：保留为扩展运行时资源，不作为仓库 Logo；需随公开发布保留来源和权利边界 |
| P0 | 建立公开 GitHub 仓库、首个完整提交和双版本 Release | 仓库与 `main` 已创建，源码已推送；双版本 ZIP 已生成并通过完整性检查，待上传 Release |
| P1 | Google Chrome / Microsoft Edge 品牌浏览器与 Firefox / Zen 的真实学习页人工回归 | 待人工验证 |
| P1 | 为 GitHub 增加自动测试与双目标打包流水线 | 待维护者安排 |
| P2 | 收集实际网站结构变化并维护 DOM 选择器 | 持续维护 |

Chrome / Edge 共用 Chromium 构建；浏览器商店上架与 GitHub 开源发布是独立事项。Firefox / Zen 的折射位移受上游限制，详见 `docs/liquid-glass.md`。
