'use strict';
const utils = globalThis.MaimemoShortcutUtils;
const config = globalThis.MaimemoSettings;
const descriptions = { reveal: '先显示当前单词释义', familiar: '认识 · 绿色按钮', vague: '模糊 · 黄色按钮', forget: '忘记 · 红色按钮', wellFamiliar: '熟知 · 原网页顶部操作' };
const flags = ['cleanPage', 'hideToasts', 'redesign', 'trafficLights'];
let settings;

function setStatus(message, error = false) {
  const node = document.querySelector('#status');
  node.textContent = message;
  node.classList.toggle('error', error);
}

function render() {
  document.querySelector('#enabled').checked = settings.enabled;
  document.querySelector('#autoStart').checked = settings.autoStart;
  for (const flag of flags) document.querySelector(`#${flag}`).checked = settings.appearance[flag];
  document.querySelector('#theme').value = settings.appearance.theme;
  document.querySelector('#glass').value = settings.appearance.glass;
  document.documentElement.dataset.theme = settings.appearance.theme;
  document.documentElement.dataset.glass = settings.appearance.glass;
  const container = document.querySelector('#shortcut-fields');
  container.replaceChildren();
  for (const action of config.ACTIONS) {
    const row = document.createElement('div');
    row.className = 'field';
    const label = document.createElement('label');
    label.htmlFor = `shortcut-${action}`;
    label.textContent = config.LABELS[action];
    const description = document.createElement('small');
    description.textContent = descriptions[action];
    label.append(description);
    const input = document.createElement('input');
    input.id = label.htmlFor;
    input.type = 'text';
    input.readOnly = true;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = settings.shortcuts[action];
    input.setAttribute('aria-label', `${config.LABELS[action]}快捷键`);
    input.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229 || event.key === 'Process') {
        setStatus('录制字母快捷键时，请先切换为英文输入模式。', true);
        return;
      }
      if (['Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
      event.preventDefault();
      const formatted = utils.formatEventShortcut(event);
      if (formatted) input.value = formatted;
    });
    row.append(label, input);
    container.append(row);
  }
}

function collect() {
  return config.normalize({
    enabled: document.querySelector('#enabled').checked,
    autoStart: document.querySelector('#autoStart').checked,
    appearance: { ...Object.fromEntries(flags.map((flag) => [flag, document.querySelector(`#${flag}`).checked])), theme: document.querySelector('#theme').value, glass: document.querySelector('#glass').value },
    shortcuts: Object.fromEntries(config.ACTIONS.map((action) => [action, document.querySelector(`#shortcut-${action}`).value]))
  });
}

document.querySelector('#theme').addEventListener('change', (event) => {
  document.documentElement.dataset.theme = event.target.value;
});
document.querySelector('#glass').addEventListener('change', (event) => {
  document.documentElement.dataset.glass = event.target.value;
});
document.querySelector('#save').addEventListener('click', async () => {
  const next = collect();
  const duplicates = utils.findDuplicateShortcuts(next.shortcuts);
  if (duplicates.length) {
    setStatus(`快捷键重复：${duplicates.map((group) => group.map((action) => config.LABELS[action]).join('、')).join('；')}`, true);
    return;
  }
  const save = document.querySelector('#save');
  save.disabled = true;
  try {
    settings = await config.update(next);
    render();
    setStatus('已保存，打开的学习页会自动应用。');
  } catch { setStatus('保存失败，请重试。', true); }
  finally { save.disabled = false; }
});
document.querySelector('#reset').addEventListener('click', () => {
  settings = config.normalize();
  render();
  setStatus('已恢复默认值，点击“保存设置”后生效。');
});
(async () => {
  try {
    settings = await config.read();
    render();
    document.querySelector('#save').disabled = false;
    document.querySelector('#reset').disabled = false;
  } catch { setStatus('设置读取失败，请重新打开此页。', true); }
})();
