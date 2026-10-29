(() => {
  'use strict';

  const utils = globalThis.MaimemoShortcutUtils;
  if (!utils) return;

  const HOST = 'maimemo-keyboard-helper';
  const DEFAULTS = Object.freeze({
    enabled: true,
    shortcuts: {
      reveal: ' ',
      familiar: '1',
      vague: '2',
      forget: '3',
      wellFamiliar: '4'
    }
  });
  const ACTIONS = ['reveal', 'familiar', 'vague', 'forget', 'wellFamiliar'];
  const ACTION_LABELS = {
    reveal: '显示答案',
    familiar: '认识',
    vague: '模糊',
    forget: '忘记',
    wellFamiliar: '熟知'
  };

  const state = {
    settings: structuredClone(DEFAULTS),
    observer: null,
    keyHandler: null,
    routeTimer: null,
    lastRoute: location.href,
    pendingClicks: new Set(),
    suppressedKeyups: new Set(),
    settingsReady: false
  };

  function isStudyPage() {
    return location.hash.includes('/pages/home/index') || document.querySelector('.rev-root');
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    return target.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
      || Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
  }

  function currentAction(shortcutEvent) {
    for (const action of ACTIONS) {
      if (utils.matchShortcut(shortcutEvent, state.settings.shortcuts[action])) return action;
    }
    return null;
  }

  function visible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function clickElement(element) {
    if (!element || !visible(element)) return false;
    element.click();
    return true;
  }

  function findTextElement(text, selectors = '*') {
    return [...document.querySelectorAll(selectors)]
      .filter(visible)
      .find((element) => element.childElementCount === 0 && element.textContent.trim() === text);
  }

  function clickFeedback(text) {
    const button = [...document.querySelectorAll('taro-button-core, button, [role="button"]')]
      .find((element) => visible(element) && element.classList.contains('reset-button') && element.textContent.trim().startsWith(text));
    return clickElement(button);
  }

  function clickWellFamiliar() {
    const shortcut = document.querySelector('.rev-shortcut');
    return clickElement(shortcut);
  }

  function runAction(action) {
    if (!state.settingsReady || !state.settings.enabled || !isStudyPage()) return false;

    if (action === 'reveal') {
      const hint = findTextElement('点击屏幕显示答案');
      if (hint) return clickElement(hint);
      const recallMask = document.querySelector('.rev-recall-mask-partial');
      return clickElement(recallMask);
    }
    if (action === 'familiar') return clickFeedback('认识');
    if (action === 'vague') return clickFeedback('模糊') || clickFeedback('不确定');
    if (action === 'forget') return clickFeedback('忘记') || clickFeedback('不认识');
    if (action === 'wellFamiliar') return clickWellFamiliar();
    return false;
  }

  function onKeyUp(event) {
    if (!state.settingsReady || event.isComposing || isEditableTarget(event.target)) return;
    const action = currentAction(event);
    if (!action) return;
    if (isStudyPage()) {
      runAction(action);
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function normalizeSettings(input) {
    const shortcuts = { ...DEFAULTS.shortcuts, ...(input?.shortcuts ?? {}) };
    return {
      enabled: input?.enabled !== false,
      shortcuts: Object.fromEntries(ACTIONS.map((action) => [action, String(shortcuts[action] ?? DEFAULTS.shortcuts[action])]))
    };
  }

  async function loadSettings() {
    try {
      const stored = await browser.storage.local.get('maimemoKeyboardSettings');
      state.settings = normalizeSettings(stored.maimemoKeyboardSettings);
    } catch {
      state.settings = structuredClone(DEFAULTS);
    }
    state.settingsReady = true;
  }

  function attach() {
    if (state.keyHandler) return;
    state.keyHandler = onKeyUp;
    document.addEventListener('keyup', state.keyHandler, true);
  }

  function watchRoute() {
    if (state.lastRoute === location.href) return;
    state.lastRoute = location.href;
    window.clearTimeout(state.routeTimer);
    state.routeTimer = window.setTimeout(attach, 0);
  }

  function init() {
    attach();
    state.observer = new MutationObserver(watchRoute);
    state.observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('hashchange', watchRoute, true);
    loadSettings();
    browser.storage?.onChanged?.addListener((changes, area) => {
      if (area !== 'local' || !changes.maimemoKeyboardSettings) return;
      state.settings = normalizeSettings(changes.maimemoKeyboardSettings.newValue);
    });
  }

  init();
})();
