const utils = globalThis.MaimemoShortcutUtils;
const DEFAULTS = {
  enabled: true,
  shortcuts: { reveal: ' ', familiar: '1', vague: '2', forget: '3', wellFamiliar: '4' }
};
const labels = {
  reveal: ['显示答案', '先显示当前单词释义'],
  familiar: ['认识', '提交“认识”反馈'],
  vague: ['模糊', '提交“模糊”反馈'],
  forget: ['忘记', '提交“忘记”反馈'],
  wellFamiliar: ['熟知', '提交“熟知”反馈']
};
const actions = Object.keys(labels);
let settings;

function readSettings(value) {
  return {
    enabled: value?.enabled !== false,
    shortcuts: { ...DEFAULTS.shortcuts, ...(value?.shortcuts ?? {}) }
  };
}

function render() {
  document.querySelector('#enabled').checked = settings.enabled;
  document.querySelector('#shortcut-fields').innerHTML = `<div class="fields">${actions.map((action) => `
    <div class="field">
      <label for="shortcut-${action}">${labels[action][0]}<small>${labels[action][1]}</small></label>
      <input id="shortcut-${action}" type="text" autocomplete="off" spellcheck="false" value="${escapeHtml(settings.shortcuts[action])}" aria-label="${labels[action][0]}快捷键">
    </div>`).join('')}</div>`;
  for (const action of actions) {
    document.querySelector(`#shortcut-${action}`).addEventListener('keydown', (event) => {
      if (['Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
      event.preventDefault();
      const formatted = utils.formatEventShortcut(event);
      if (formatted) event.currentTarget.value = formatted;
    });
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function collect() {
  return {
    enabled: document.querySelector('#enabled').checked,
    shortcuts: Object.fromEntries(actions.map((action) => [action, document.querySelector(`#shortcut-${action}`).value]))
  };
}

function setStatus(message, error = false) {
  const node = document.querySelector('#status');
  node.textContent = message;
  node.classList.toggle('error', error);
}

document.querySelector('#save').addEventListener('click', async () => {
  const next = collect();
  const duplicates = utils.findDuplicateShortcuts(next.shortcuts);
  if (duplicates.length) {
    setStatus(`快捷键重复：${duplicates.map((group) => group.join('、')).join('；')}`, true);
    return;
  }
  next.shortcuts = Object.fromEntries(actions.map((action) => [action, utils.canonicalizeShortcut(next.shortcuts[action])]));
  await browser.storage.local.set({ maimemoKeyboardSettings: next });
  settings = readSettings(next);
  render();
  setStatus('设置已保存。');
});

document.querySelector('#reset').addEventListener('click', () => {
  settings = readSettings(DEFAULTS);
  render();
  setStatus('已恢复默认值，点击“保存设置”后生效。');
});

(async () => {
  const stored = await browser.storage.local.get('maimemoKeyboardSettings');
  settings = readSettings(stored.maimemoKeyboardSettings);
  render();
})();
