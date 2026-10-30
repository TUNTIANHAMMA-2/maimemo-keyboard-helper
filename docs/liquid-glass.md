# Liquid Glass 接入记录

- 用户指定项目：<https://github.com/rdev/liquid-glass-react>
- 阅读的上游提交：`ac48eab18d1f7f444ae30002d240cae29c863a21`。
- 实际分发组件：`liquid-glass-react@1.1.1`，固定在 package.json 和 package-lock.json。
- React / React DOM：`19.3.1`。npm 分发包声明 peer dependency 为 `>=19`，与所读 GitHub package.json 的 `>=18` 不同，按实际包要求配置。
- 构建：`esbuild@0.25.12`。运行 `npm ci --ignore-scripts`、`npm run build:glass` 可重建。
- 完整第三方版权与 MIT 许可：`third-party-licenses.txt`，随扩展包分发。

## 实现

`ui/liquid-glass-entry.js` 直接导入真实的 LiquidGlass 组件，只将 React 根节点挂在自有的装饰层中。原网站的文本、Taro 组件、按钮、输入框和点击处理不交给 React 管理。装饰层忽略鼠标输入，玻璃滤镜只作用于背景，正文不会被模糊或扭曲。

参数使用 standard 模式、较低折射强度和 `elasticity=0`，保留边缘高光但不让学习区、文字或按钮随指针移动。ResizeObserver 负责尺寸变化；内部滚动时，背景层跟随滚动视口。离开页面、切换选项或销毁原节点时清理装饰根节点。

阅读面板的光学层使用较低不透明度，搭配独立的磨砂底色，避免大片折射层变灰、降低文字对比度。装饰层不对宽高和位移做过渡，防止首次显示或调整窗口时出现短暂的小尺寸边框。

这是根据本次明确要求，为原生 JavaScript 扩展添加的独立 React 视觉适配层。业务逻辑和快捷键继续使用原生代码；不访问网站内部 React 状态、未公开接口或学习数据。

## 浏览器支持与验证

上游 README 明确说明 Safari / Firefox 仅部分支持，折射位移不可见；组件源码在 Firefox 用户代理下跳过 SVG 位移滤镜，保留 backdrop blur 与高光。本项目沿用这一分支，不把 Chromium 的完整折射效果声称为 Zen / Firefox 的实际效果。

浏览器测试使用本地模拟页面，覆盖实际组件渲染、原生点击与键盘操作、文字清晰度、位置不动、内部滚动、记忆历史同步、组件清理和明暗主题；额外模拟 Firefox 用户代理验证上游兼容分支。该测试不是原生 Gecko 渲染验收，也不提交真实复习记录。

“降低动态效果”关闭过渡；“降低透明度”使用更实的底色；强制高对比度模式使用系统颜色。
