(() => {
  'use strict';

  const extensionAPI = globalThis.browser ?? globalThis.chrome;
  const KEY = 'maimemoKeyboardSettings';
  const ACTIONS = Object.freeze(['reveal', 'familiar', 'vague', 'forget', 'wellFamiliar']);
  const LABELS = Object.freeze({ reveal: '显示答案', familiar: '认识', vague: '模糊', forget: '忘记', wellFamiliar: '熟知' });
  const DEFAULTS = Object.freeze({
    enabled: true,
    autoStart: true,
    shortcuts: Object.freeze({ reveal: 'Space', familiar: '1', vague: '2', forget: '3', wellFamiliar: '4' }),
    appearance: Object.freeze({ cleanPage: true, hideToasts: true, redesign: true, trafficLights: true, theme: 'system', glass: 'full' })
  });

  function normalize(input) {
    const appearance = {};
    for (const name of ['cleanPage', 'hideToasts', 'redesign', 'trafficLights']) {
      appearance[name] = input?.appearance?.[name] !== false;
    }
    appearance.theme = ['system', 'light', 'dark'].includes(input?.appearance?.theme) ? input.appearance.theme : 'system';
    appearance.glass = ['full', 'system', 'solid'].includes(input?.appearance?.glass) ? input.appearance.glass : 'full';
    return {
      enabled: input?.enabled !== false,
      autoStart: input?.autoStart !== false,
      shortcuts: Object.fromEntries(ACTIONS.map((action) => [action,
        globalThis.MaimemoShortcutUtils.canonicalizeShortcut(input?.shortcuts?.[action] ?? DEFAULTS.shortcuts[action])
      ])),
      appearance
    };
  }

  async function read() {
    const stored = await extensionAPI.storage.local.get(KEY);
    return normalize(stored[KEY]);
  }

  async function update(patch) {
    const current = await read();
    const next = normalize({
      ...current, ...patch,
      shortcuts: { ...current.shortcuts, ...patch.shortcuts },
      appearance: { ...current.appearance, ...patch.appearance }
    });
    await extensionAPI.storage.local.set({ [KEY]: next });
    return next;
  }

  function watch(listener) {
    extensionAPI.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[KEY]) listener(normalize(changes[KEY].newValue));
    });
  }

  function resolveTheme(theme, dark) {
    return theme === 'system' ? (dark ? 'dark' : 'light') : theme;
  }

  globalThis.MaimemoSettings = Object.freeze({ KEY, ACTIONS, LABELS, DEFAULTS, normalize, read, update, watch, resolveTheme });
})();
