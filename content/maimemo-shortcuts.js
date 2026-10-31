(() => {
  'use strict';

  const utils = globalThis.MaimemoShortcutUtils;
  if (!utils) return;

  const config = globalThis.MaimemoSettings;
  if (!config) return;
  const ACTIONS = config.ACTIONS;

  const state = {
    settings: config.normalize(),
    attached: false,
    pressedKeys: new Set(),
    settingsReady: false
  };

  function isStudyPage() {
    return location.hash.split('?')[0] === '#/pages/home/index';
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    return target.isContentEditable
      || target.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
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
    if (element.closest('[hidden], [aria-hidden="true"]')) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function clickElement(element) {
    if (!element || typeof element.click !== 'function' || !visible(element) || element.disabled
      || (element.hasAttribute('disabled') && element.getAttribute('disabled') !== 'false')
      || element.getAttribute('aria-disabled') === 'true') return false;
    element.click();
    return true;
  }

  function findTextElement(text, selectors = '*') {
    return [...document.querySelectorAll(selectors)]
      .filter(visible)
      .find((element) => element.childElementCount === 0 && element.textContent.trim() === text);
  }

  function clickFeedback(action, ...labels) {
    const proxy = document.querySelector(`#mm-traffic-controls [data-mm-action="${action}"]`);
    if (proxy) return clickElement(proxy);
    const button = [...document.querySelectorAll('taro-button-core, button, [role="button"]')]
      .find((element) => visible(element) && element.classList.contains('reset-button')
        && labels.some((text) => element.textContent.trim().startsWith(text)));
    return clickElement(button);
  }

  function clickWellFamiliar() {
    // The menu shares this class. It must never be used as a review action.
    const proxy = document.querySelector('#mm-traffic-controls [data-mm-action="familiar"]');
    if (proxy ? proxy.disabled : !visible(document.querySelector('.rev-resp-btns'))) return false;
    const shortcut = document.querySelector('.rev-shortcut:not(#rev-top-menu)');
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
    if (action === 'familiar') return clickFeedback(action, '认识');
    if (action === 'vague') return clickFeedback(action, '模糊', '不确定');
    if (action === 'forget') return clickFeedback(action, '忘记', '不认识');
    if (action === 'wellFamiliar') return clickWellFamiliar();
    return false;
  }

  function isTyping(event) {
    return event.isComposing || event.keyCode === 229
      || event.composedPath().some(isEditableTarget);
  }

  function suppress(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onKeyDown(event) {
    if (!state.settingsReady || !state.settings.enabled || isTyping(event) || !isStudyPage()) return;
    const action = currentAction(event);
    if (!action) return;
    // Claim keydown before the site's letter-to-spelling listener.
    // Also consume keyup so its built-in shortcuts cannot submit again.
    suppress(event);
    const key = event.code || event.key;
    if (event.repeat || state.pressedKeys.has(key)) return;
    state.pressedKeys.add(key);
    runAction(action);
  }

  function onKeyUp(event) {
    if (!state.pressedKeys.delete(event.code || event.key)) return;
    suppress(event);
  }

  async function loadSettings() {
    try {
      state.settings = await config.read();
    } catch {
      state.settings = config.normalize();
    }
    state.settingsReady = true;
  }

  function attach() {
    if (state.attached) return;
    state.attached = true;
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', () => state.pressedKeys.clear());
  }

  function init() {
    attach();
    window.addEventListener('hashchange', () => state.pressedKeys.clear());
    loadSettings();
    config.watch((settings) => { state.settings = settings; });
  }

  init();
})();
