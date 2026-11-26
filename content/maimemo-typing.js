(() => {
  'use strict';

  const config = globalThis.MaimemoSettings;
  const engine = globalThis.MaimemoTypingEngine;
  const shortcutUtils = globalThis.MaimemoShortcutUtils;
  if (!config || !engine) return;
  if (location.hostname !== 'tc-apis.maimemo.com') return;

  let settings;
  let pending = false;
  let display;
  let wordTrack;
  let hintLine;
  let currentKey = '';
  let activeState = engine.createState('');
  let activeRevealed = false;
  let peeking = false;
  let peekTimer;
  const pressedKeys = new Set();

  function setAttribute(node, name, value) {
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }

  function available(node) {
    if (!node || node.closest('[hidden], [aria-hidden="true"]')) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    return target.isContentEditable
      || target.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
      || Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
  }

  function activeStudyRoot() {
    if (location.hash.split('?')[0] !== '#/pages/home/index') return null;
    return [...document.querySelectorAll('.rev-root')].find(available) || null;
  }

  function isRevealed(activeRoot) {
    if (!activeRoot) return false;
    if ([...activeRoot.querySelectorAll('.rev-recall-mask, .rev-recall-mask-partial')].some(available)) return false;
    return Boolean(activeRoot.querySelector('.rev-scroller, .interp-ctn, .rev-resp-btns'));
  }

  function readTarget(activeRoot) {
    const spelling = activeRoot?.querySelector('.rev-top .spelling');
    const word = engine.normalizeTarget(spelling?.textContent || '');
    const progress = activeRoot?.querySelector('.rev-top-stats > taro-text-core:nth-of-type(2)')?.textContent?.trim() || '';
    return { spelling, word, key: word ? `${progress}\u0000${word}` : '' };
  }

  function clearPeek() {
    window.clearTimeout(peekTimer);
    peekTimer = undefined;
    peeking = false;
  }

  function triggerPeek() {
    if (peeking) {
      clearPeek();
      render();
      return;
    }
    peeking = true;
    render();
    window.clearTimeout(peekTimer);
    peekTimer = window.setTimeout(() => {
      peeking = false;
      peekTimer = undefined;
      render();
    }, 1500);
  }

  function ensureDisplay(spelling) {
    if (!display) {
      display = document.createElement('div');
      display.id = 'mm-typing-display';
      display.setAttribute('role', 'group');
      display.setAttribute('aria-label', '单词拼写区');
      wordTrack = document.createElement('div');
      wordTrack.className = 'mm-typing-word';
      hintLine = document.createElement('div');
      hintLine.className = 'mm-typing-hint';
      hintLine.setAttribute('aria-live', 'polite');
      display.append(wordTrack, hintLine);
      display.addEventListener('click', (event) => {
        const nativeSpelling = display.closest('.rev-top')?.querySelector('.spelling');
        if (nativeSpelling && event.target !== nativeSpelling) {
          nativeSpelling.click();
        }
      });
    }
    if (spelling && (display.parentElement !== spelling.parentElement || spelling.nextElementSibling !== display)) {
      spelling.after(display);
    }
  }

  function render() {
    if (!display || !wordTrack || !hintLine) return;
    const hideWord = Boolean(settings?.typing?.hideWordOnReveal) && !peeking;
    const result = engine.evaluate(activeState, { hidden: hideWord });
    setAttribute(display, 'data-mm-hidden-word', String(hideWord));
    setAttribute(display, 'data-mm-complete', String(result.complete));
    setAttribute(display, 'data-mm-error', String(result.hasError));

    const fragment = document.createDocumentFragment();
    for (const cell of result.cells) {
      const span = document.createElement('span');
      span.className = 'mm-typing-char';
      span.dataset.state = cell.status;
      if (cell.isSpace) {
        span.dataset.space = 'true';
        span.textContent = '\u00a0';
      } else if (cell.display) {
        span.textContent = cell.display;
      } else {
        span.dataset.blank = 'true';
        span.textContent = '\u00a0';
      }
      fragment.append(span);
    }
    wordTrack.replaceChildren(fragment);

    let hint = '';
    if (result.complete) {
      hint = '';
    } else if (result.hasError) {
      hint = 'Backspace 退格修正 · Esc 清空';
    } else if (hideWord) {
      hint = '直接拼写 · Tab 提示';
    } else if (peeking) {
      hint = '原词提示中 · Tab 隐藏';
    } else {
      hint = '直接拼写 · Esc 清空';
    }
    if (hintLine.textContent !== hint) hintLine.textContent = hint;
  }

  function refresh() {
    pending = false;
    const root = document.documentElement;
    if (!settings || !root) return;
    const activeRoot = activeStudyRoot();
    const revealed = isRevealed(activeRoot);
    const { spelling, word, key } = readTarget(activeRoot);
    const active = Boolean(settings.typing.enabled && activeRoot && revealed && spelling && word);

    setAttribute(root, 'data-mm-typing', String(Boolean(settings.typing.enabled)));
    setAttribute(root, 'data-mm-typing-active', String(active));

    if (!active) {
      if (activeRevealed) {
        activeRevealed = false;
        clearPeek();
        pressedKeys.clear();
      }
      if (display && !display.hidden) display.hidden = true;
      return;
    }

    const enteredReveal = !activeRevealed;
    activeRevealed = true;
    if (key !== currentKey || enteredReveal) {
      currentKey = key;
      activeState = engine.createState(word);
      clearPeek();
    }

    ensureDisplay(spelling);
    if (display.hidden) display.hidden = false;
    render();
  }

  function schedule() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(refresh);
  }

  function isNonLetterShortcut(event) {
    if (!settings?.enabled || !shortcutUtils) return false;
    if (/^[a-zA-Z]$/.test(event.key)) return false;
    return config.ACTIONS.some((action) => shortcutUtils.matchShortcut(event, settings.shortcuts[action]));
  }

  function suppress(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onKeyDown(event) {
    if (!settings?.typing?.enabled || !activeRevealed || !activeState.target) return;
    if (event.isComposing || event.keyCode === 229) return;
    if (event.composedPath().some(isEditableTarget)) return;

    const code = event.code || event.key;

    if (engine.isComplete(activeState)) {
      if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        suppress(event);
        pressedKeys.add(code);
        clearPeek();
        activeState = engine.reset(activeState);
        render();
      }
      return;
    }

    if (event.ctrlKey || event.altKey || event.metaKey) {
      if (event.ctrlKey && !event.altKey && !event.metaKey && event.key === 'Backspace') {
        suppress(event);
        if (event.repeat) return;
        activeState = engine.reset(activeState);
        render();
      }
      return;
    }

    if (event.key === 'Backspace') {
      suppress(event);
      pressedKeys.add(code);
      activeState = engine.backspace(activeState);
      render();
      return;
    }

    if (event.key === 'Escape') {
      if (!activeState.typed.length && !peeking) return;
      suppress(event);
      pressedKeys.add(code);
      clearPeek();
      activeState = engine.reset(activeState);
      render();
      return;
    }

    if (event.key === 'Tab') {
      if (!settings.typing.hideWordOnReveal) return;
      suppress(event);
      pressedKeys.add(code);
      if (event.repeat) return;
      triggerPeek();
      return;
    }

    if (event.key.length !== 1) return;

    const expected = engine.expectedChar(activeState);
    if (event.key === ' ') {
      if (expected !== ' ') return;
    } else if (isNonLetterShortcut(event) && !engine.isCharMatch(expected, event.key)) {
      return;
    }

    suppress(event);
    pressedKeys.add(code);
    activeState = engine.inputChar(activeState, event.key);
    render();
  }

  function onKeyUp(event) {
    const code = event.code || event.key;
    if (!pressedKeys.delete(code)) return;
    suppress(event);
  }

  const observer = new MutationObserver((records) => {
    if (records.some((record) => {
      const node = record.target instanceof Element ? record.target : record.target.parentElement;
      return !node?.closest('#mm-typing-display, .mm-liquid-mount');
    })) schedule();
  });

  observer.observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
  });

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('hashchange', schedule);
  window.addEventListener('popstate', schedule);
  window.addEventListener('pageshow', schedule);
  window.addEventListener('blur', () => pressedKeys.clear());
  config.watch((next) => { settings = next; schedule(); });
  config.read().then((value) => { settings = value; schedule(); }).catch(() => {
    settings = config.normalize();
    schedule();
  });

  globalThis.MaimemoTyping = Object.freeze({ refresh });
})();
