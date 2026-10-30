import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

for (const namespace of ['browser', 'chrome']) {
  let stored = { enabled: false, shortcuts: { familiar: 'q', vague: 'w', forget: 'e' } };
  let watcher;
  const context = { [namespace]: { storage: {
    local: {
      get: async () => ({ maimemoKeyboardSettings: stored }),
      set: async (next) => { stored = next.maimemoKeyboardSettings; }
    },
    onChanged: { addListener: (listener) => { watcher = listener; } }
  } } };
  for (const path of ['core/shortcut-utils.js', 'core/settings.js']) {
    vm.runInNewContext(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), context);
  }
  const config = context.MaimemoSettings;
  const old = await config.read();
  assert.equal(old.enabled, false, 'upgrade preserves a disabled keyboard');
  assert.equal(old.shortcuts.familiar, 'Q', 'upgrade preserves custom shortcuts');
  assert.equal(old.autoStart, true);
  assert.equal(old.appearance.theme, 'system');
  await config.update({ appearance: { theme: 'dark', hideToasts: false } });
  assert.equal(stored.shortcuts.familiar, 'Q', 'appearance changes preserve keyboard preferences');
  assert.equal(stored.appearance.hideToasts, false);
  await config.update({ enabled: true });
  assert.equal(stored.appearance.theme, 'dark', 'popup keyboard toggle preserves the theme');
  assert.equal(stored.appearance.hideToasts, false);
  await config.update({ shortcuts: { familiar: 'Alt+q' }, autoStart: false });
  assert.equal(stored.shortcuts.vague, 'W', 'partial shortcut changes preserve the other keys');
  assert.equal(stored.shortcuts.familiar, 'Alt+Q');
  assert.equal(stored.autoStart, false);
  assert.equal(config.normalize({ appearance: { theme: 'invalid' } }).appearance.theme, 'system');
  assert.equal(config.resolveTheme('system', true), 'dark');
  assert.equal(config.resolveTheme('system', false), 'light');
  assert.equal(config.resolveTheme('light', true), 'light');
  let received;
  config.watch((value) => { received = value; });
  watcher({ maimemoKeyboardSettings: { newValue: stored } }, 'sync');
  assert.equal(received, undefined, 'changes to a different storage area are ignored');
  watcher({ maimemoKeyboardSettings: { newValue: stored } }, 'local');
  assert.equal(received.appearance.theme, 'dark');
  assert.equal(received.shortcuts.familiar, 'Alt+Q');
  console.log(`${namespace} API settings migration and persistence tests passed`);
}
