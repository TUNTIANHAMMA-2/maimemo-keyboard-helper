'use strict';
const config = globalThis.MaimemoSettings;
const utils = globalThis.MaimemoShortcutUtils;
const extensionAPI = globalThis.browser ?? globalThis.chrome;
const themeButtons = [...document.querySelectorAll('[data-theme-value]')];
const flags = ['trafficLights', 'redesign', 'cleanPage', 'hideToasts'];
const drafts = new Map();
let settings;
let saving = false;

function status(message, error = false) {
  const node = document.querySelector('#status');
  node.textContent = message;
  node.classList.toggle('error', error);
}

function render() {
  for (const node of document.querySelectorAll('[data-setting-control]')) node.disabled = !settings || saving;
  document.querySelector('#reload-settings').disabled = saving;
  document.querySelector('#save-shortcuts').disabled = !settings || saving || !drafts.size;
  if (!settings) return;
  document.documentElement.dataset.theme = settings.appearance.theme;
  document.documentElement.dataset.glass = settings.appearance.glass;
  for (const name of ['enabled', 'autoStart']) document.querySelector(`#${name}`).checked = settings[name];
  for (const flag of flags) document.querySelector(`#${flag}`).checked = settings.appearance[flag];
  document.querySelector('#glass').value = settings.appearance.glass;
  for (const button of themeButtons) button.setAttribute('aria-pressed', String(button.dataset.themeValue === settings.appearance.theme));
  for (const action of config.ACTIONS) {
    const input = document.querySelector(`#shortcut-${action}`);
    input.value = drafts.get(action) ?? settings.shortcuts[action];
    input.classList.toggle('edited', drafts.has(action));
  }
}

function edit(action, value) {
  if (value === settings.shortcuts[action]) drafts.delete(action);
  else drafts.set(action, value);
  for (const input of document.querySelectorAll('#shortcut-fields input')) input.removeAttribute('aria-invalid');
  render();
  status(drafts.size ? '快捷键尚未保存。' : '快捷键与已保存的设置一致。');
}

for (const action of config.ACTIONS) {
  const label = document.createElement('label');
  label.className = 'shortcut-field';
  const text = document.createElement('span');
  text.textContent = config.LABELS[action];
  const input = document.createElement('input');
  input.id = `shortcut-${action}`;
  input.type = 'text';
  input.readOnly = true;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = '未设置';
  input.setAttribute('aria-label', `${config.LABELS[action]}快捷键`);
  input.setAttribute('data-setting-control', '');
  input.disabled = true;
  input.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229 || ['Process', 'Dead'].includes(event.key)) {
      status('录制字母时，请先切换为英文输入模式。', true);
      return;
    }
    if (['Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
    event.preventDefault();
    if (event.repeat || !settings || saving) return;
    const plain = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
    if (plain && event.key === 'Escape') return edit(action, settings.shortcuts[action]);
    if (plain && ['Delete', 'Backspace'].includes(event.key)) return edit(action, '');
    const key = utils.formatEventShortcut(event);
    if (key) edit(action, key);
  });
  label.append(text, input);
  document.querySelector('#shortcut-fields').append(label);
}

async function update(patch, onSaved = () => {}) {
  if (saving || !settings) return;
  saving = true;
  render();
  status('正在保存…');
  try {
    settings = await config.update(patch);
    onSaved();
    status(drafts.size ? '开关已保存；快捷键编辑仍待保存。' : '已保存，学习页会自动应用。');
  } catch { status('保存失败，编辑已保留，请重试。', true); }
  finally { saving = false; render(); }
}

for (const name of ['enabled', 'autoStart']) document.querySelector(`#${name}`).addEventListener('change', (event) => update({ [name]: event.target.checked }));
for (const flag of flags) document.querySelector(`#${flag}`).addEventListener('change', (event) => update({ appearance: { [flag]: event.target.checked } }));
document.querySelector('#glass').addEventListener('change', (event) => update({ appearance: { glass: event.target.value } }));
for (const button of themeButtons) button.addEventListener('click', () => update({ appearance: { theme: button.dataset.themeValue } }));

document.querySelector('#save-shortcuts').addEventListener('click', () => {
  if (!settings || !drafts.size) return;
  const shortcuts = { ...settings.shortcuts, ...Object.fromEntries(drafts) };
  const duplicates = utils.findDuplicateShortcuts(shortcuts);
  if (duplicates.length) {
    for (const action of duplicates.flat()) document.querySelector(`#shortcut-${action}`).setAttribute('aria-invalid', 'true');
    status(`快捷键重复：${duplicates.map((group) => group.map((action) => config.LABELS[action]).join('、')).join('；')}`, true);
    return;
  }
  update({ shortcuts: Object.fromEntries(drafts) }, () => drafts.clear());
});

document.querySelector('#reset-shortcuts').addEventListener('click', () => {
  for (const action of config.ACTIONS) edit(action, config.DEFAULTS.shortcuts[action]);
  status(drafts.size ? '已填入默认快捷键，点击“保存快捷键”后生效。' : '当前已是默认快捷键。');
});

document.querySelector('#open-options').addEventListener('click', async () => {
  try { await extensionAPI.runtime.openOptionsPage(); }
  catch {
    try { await extensionAPI.tabs.create({ url: extensionAPI.runtime.getURL('options/options.html') }); }
    catch { status('无法打开完整设置，请从扩展管理页打开“扩展选项”。', true); }
  }
});

document.querySelector('#reapply-page').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  status('正在重新应用…');
  try {
    const [tab] = await extensionAPI.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');
    const result = await extensionAPI.tabs.sendMessage(tab.id, { type: 'maimemo:reapply' });
    if (!result?.ok) throw new Error('Page did not reapply');
    status('已重新应用页面外观和控件，设置保持不变。');
  } catch { status('页面未连接。请打开并刷新墨墨学习页后重试。', true); }
  finally { button.disabled = false; }
});

async function reload() {
  if (saving) return;
  const button = document.querySelector('#reload-settings');
  button.disabled = true;
  try {
    settings = await config.read();
    render();
    status(drafts.size ? '已读取设置，未保存的快捷键编辑已保留。' : '已读取设置，可以直接修改。');
  } catch { status('设置读取失败，点击“重新读取设置”重试。', true); }
  finally { button.disabled = false; }
}
document.querySelector('#reload-settings').addEventListener('click', reload);
config.watch((next) => { settings = next; render(); });
reload();
