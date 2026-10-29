# 墨墨网页快捷键（Firefox / Zen Browser）

这是一个面向 Firefox / Zen Browser 的 Manifest V3 扩展，为墨墨背单词网页版复习页补充可配置键盘操作。

## 功能

- 空格：显示答案
- 可配置按键：认识、模糊、忘记、熟知
- 默认按键：`1` / `2` / `3` / `4`
- 设置页录制单键或组合键，并检查快捷键重复
- 输入框、拼写输入状态不拦截按键
- 仅匹配墨墨网页版及其学习 iframe，不访问其他网站

## 安装到 Zen Browser

1. 运行 `npm test` 和 `npm run check`。
2. 打开 `about:debugging#/runtime/this-firefox`。
3. 点击“临时载入附加组件”。
4. 选择本项目根目录下的 `manifest.json`。
5. 打开 `https://www.maimemo.com/home/web_study`，登录并进入学习页。
6. 点击扩展图标，进入设置即可修改按键。

临时扩展在浏览器重启后需要重新载入；正式发布时使用 `npm run zip` 生成压缩包，再按 Firefox 扩展发布/签名流程处理。

## 安全边界

扩展不会修改墨墨网页源码、调用墨墨接口或保存账号信息；它只在页面内定位现有控件并触发与鼠标点击等价的 DOM 点击。
