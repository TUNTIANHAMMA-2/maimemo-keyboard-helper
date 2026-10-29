const DEFAULTS = {
  enabled: true,
  shortcuts: { reveal: ' ', familiar: '1', vague: '2', forget: '3', wellFamiliar: '4' }
};
const labels = {
  reveal: '显示答案', familiar: '认识', vague: '模糊', forget: '忘记', wellFamiliar: '熟知'
};

function displayShortcut(value) {
  return value === ' ' ? 'Space' : value || '未设置';
}

async function getSettings() {
  const stored = await browser.storage.local.get('maimemoKeyboardSettings');
  return {
    enabled: stored.maimemoKeyboardSettings?.enabled !== false,
    shortcuts: { ...DEFAULTS.shortcuts, ...(stored.maimemoKeyboardSettings?.shortcuts ?? {}) }
  };
}

async function save(settings) {
  await browser.storage.local.set({ maimemoKeyboardSettings: settings });
}

async function render() {
  const settings = await getSettings();
  document.querySelector('#enabled').checked = settings.enabled;
  document.querySelector('#shortcut-list').innerHTML = Object.entries(settings.shortcuts)
    .map(([action, shortcut]) => `<div><dt>${labels[action]}</dt><dd>${displayShortcut(shortcut)}</dd></div>`)
    .join('');
}

document.querySelector('#enabled').addEventListener('change', async (event) => {
  const settings = await getSettings();
  settings.enabled = event.target.checked;
  await save(settings);
  document.querySelector('#status').textContent = event.target.checked ? '已启用' : '已停用';
});

document.querySelector('#open-options').addEventListener('click', () => browser.runtime.openOptionsPage());
render();
