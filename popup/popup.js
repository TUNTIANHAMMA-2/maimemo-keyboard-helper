'use strict';
const config = globalThis.MaimemoSettings;
const extensionAPI = globalThis.browser ?? globalThis.chrome;
const themeButtons = [...document.querySelectorAll('[data-theme-value]')];

function status(message, error = false) {
  const node = document.querySelector('#status');
  node.textContent = message;
  node.classList.toggle('error', error);
}

function render(settings) {
  document.documentElement.dataset.theme = settings.appearance.theme;
  document.querySelector('#enabled').checked = settings.enabled;
  document.querySelector('#enabled').disabled = false;
  for (const button of themeButtons) button.setAttribute('aria-pressed', String(button.dataset.themeValue === settings.appearance.theme));
  const list = document.querySelector('#shortcut-list');
  list.replaceChildren();
  for (const action of config.ACTIONS) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = config.LABELS[action];
    const description = document.createElement('dd');
    const key = document.createElement('kbd');
    key.textContent = settings.shortcuts[action] || '未设置';
    description.append(key);
    row.append(term, description);
    list.append(row);
  }
}

async function update(patch) {
  try {
    render(await config.update(patch));
    status('已保存，学习页会自动应用。');
  } catch { status('保存失败，请重试。', true); }
}
document.querySelector('#enabled').addEventListener('change', (event) => update({ enabled: event.target.checked }));
for (const button of themeButtons) button.addEventListener('click', () => update({ appearance: { theme: button.dataset.themeValue } }));
document.querySelector('#open-options').addEventListener('click', () => extensionAPI.runtime.openOptionsPage());
config.watch(render);
config.read().then(render).catch(() => status('设置读取失败，请重新打开。', true));
