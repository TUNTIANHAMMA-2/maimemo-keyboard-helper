# Liquid Glass 接入记录

- 用户指定项目：<https://github.com/rdev/liquid-glass-react>
- 阅读的上游提交：`ac48eab18d1f7f444ae30002d240cae29c863a21`。
- 实际分发组件：`liquid-glass-react@1.1.1`，固定在 package.json 和 package-lock.json。
- React / React DOM：`19.3.1`。npm 分发包声明 peer dependency 为 `>=19`，与所读 GitHub package.json 的 `>=18` 不同，按实际包要求配置。
- 构建：`esbuild@0.25.12`。运行 `npm ci --ignore-scripts`、`npm run build:glass` 可重建。
- 完整第三方版权与 MIT 许可：`third-party-licenses.txt`，随扩展包分发。

## 实现

`ui/liquid-glass-entry.js` 直接导入真实的 LiquidGlass 组件，只将 React 根节点挂在自有的装饰层中。原网站的文本、Taro 组件、按钮、输入框和点击处理不交给 React 管理。装饰层忽略鼠标输入，玻璃滤镜只作用于背景，正文不会被模糊或扭曲。

参数使用 standard 模式、`displacementScale=70` 和 `elasticity=0`，保留边缘高光但不让学习区、文字或按钮随指针移动。ResizeObserver 负责尺寸变化；内部滚动时，装饰层跟随滚动视口。离开页面、切换选项或销毁原节点时清理装饰根节点。

0.3.2 通过 `GlassBackdrop` 将真实组件生成的 SVG 滤镜用于原生面板的 `backdrop-filter`。原内层 `.glass__warp` 的独立 `filter` 和模糊关闭，移除父装饰层的额外模糊，避免 Chromium 合成边界隔断真实背景。滤镜 URL 使用当前文档的完整地址和实际 SVG ID，兼容学习 iframe、路由片段和页面 base URL；不对正文使用 `filter`。不再把折射透明度限制在 12%。

每个自有 React 根都使用 `mm-glass-` 标识前缀，避免与网站自己的 React `useId` 或其他组件 ID 冲突。光学夹具也预置原网站可能使用的 ID 来检查这一边界。

半透明底色位于自有装饰层；导航只对外层玻璃应用折射，避免嵌套采样。装饰层不对宽高和位移做过渡，防止首次显示或调整窗口时出现短暂的小尺寸边框。

0.3.3 按用户要求恢复 0.3.1 的表面配色，右侧背景使用均匀白灰／深灰蓝，移除新增蓝紫渐变。左侧青色渐变、SVG 背景采样与玻璃模式保持原实现。

这是根据本次明确要求，为原生 JavaScript 扩展添加的独立 React 视觉适配层。业务逻辑和快捷键继续使用原生代码；不访问网站内部 React 状态、未公开接口或学习数据。

## 浏览器支持与验证

上游 README 明确说明 Safari / Firefox 仅部分支持，折射位移不可见；组件源码在 Firefox 用户代理下跳过 SVG 位移滤镜。适配层同样在 Firefox 只保留背景模糊与组件高光，不把 Chromium 的完整折射效果声称为 Zen / Firefox 的实际效果。

浏览器测试使用本地模拟页面，覆盖实际组件渲染、原生点击与键盘操作、文字清晰度、位置不动、内部滚动、记忆历史同步、组件清理和明暗主题；额外模拟 Firefox 用户代理验证上游兼容分支。该测试不是原生 Gecko 渲染验收，也不提交真实复习记录。

原生 Chrome for Testing 测试另加载条纹夹具：对比真实折射与关闭 SVG 位移后的截图像素，要求至少五处背景边界移动，正文像素和面板外像素保持一致。0.3.2 在 156.0.8078.4 中测得 17 处边界移动、最大 14px，弥补此前仅检查组件存在而漏掉实际光学效果的问题。

玻璃模式保存在 `appearance.glass`：`full` 默认完整效果；`system` 尊重系统降低透明度；`solid` 使用实色底并关闭背景滤镜。Windows 可通过 Chrome 报告降低透明度，此时完整模式仍按用户在扩展中的选择显示。“降低动态效果”继续关闭过渡；强制高对比度模式始终使用系统颜色。
