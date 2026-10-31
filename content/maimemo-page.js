(() => {
  'use strict';

  const config = globalThis.MaimemoSettings;
  const extensionAPI = globalThis.browser ?? globalThis.chrome;
  if (!config) return;
  const isApp = location.hostname === 'tc-apis.maimemo.com';
  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
  const themeLabels = { system: '跟随系统', light: '浅色', dark: '深色' };
  const feedback = [
    { action: 'forget', labels: ['忘记', '不认识'], symbol: '×' },
    { action: 'vague', labels: ['模糊', '不确定'], symbol: '−' },
    { action: 'familiar', labels: ['认识'], symbol: '+' }
  ];
  let settings;
  let pending = false;
  let toolbar;
  let themeButton;
  let brandLogo;
  let themeSaving = false;
  let lastRoute = location.hash;
  let startClicked = false;
  let checkboxClicked = false;
  let checkboxPending = false;
  let retryTimer;
  let trafficControls;
  const activatedKeys = new Set();

  function setAttribute(node, name, value) {
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }

  function available(node) {
    if (!node || node.closest('[hidden], [aria-hidden="true"]')) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      && !node.disabled && !(node.hasAttribute('disabled') && node.getAttribute('disabled') !== 'false')
      && node.getAttribute('aria-disabled') !== 'true';
  }

  function applyTheme() {
    const root = document.documentElement;
    if (!root || !settings) return;
    setAttribute(root, 'data-mm-glass', settings.appearance.glass);
    if (isApp) setAttribute(root, 'data-mm-theme', config.resolveTheme(settings.appearance.theme, colorScheme.matches));
    if (themeButton) {
      const symbol = { system: '◐', light: '☀', dark: '☾' }[settings.appearance.theme];
      if (themeButton.textContent !== symbol) themeButton.textContent = symbol;
      const label = `外观：${themeLabels[settings.appearance.theme]}，点击切换`;
      setAttribute(themeButton, 'aria-label', label);
      setAttribute(themeButton, 'title', label);
    }
  }

  async function cycleTheme() {
    if (themeSaving) return;
    themeSaving = true;
    try {
      const themes = ['system', 'light', 'dark'];
      settings = await config.update({ appearance: { theme: themes[(themes.indexOf(settings.appearance.theme) + 1) % themes.length] } });
      applyTheme();
    } catch {
      themeButton.title = '外观保存失败，请在扩展设置中重试';
    } finally {
      themeSaving = false;
    }
  }

  function ensureToolbar(activeRoot) {
    const host = activeRoot.querySelector('.rev-top-stats');
    if (!host) return;
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'mm-study-toolbar';
      toolbar.setAttribute('role', 'group');
      toolbar.setAttribute('aria-label', '学习页外观');
      themeButton = document.createElement('button');
      themeButton.type = 'button';
      themeButton.addEventListener('click', (event) => {
        // The site's vocabulary header also plays audio on click.
        event.stopPropagation();
        cycleTheme();
      });
      toolbar.append(themeButton);
    }
    if (toolbar.parentElement !== host) host.append(toolbar);
  }

  const layoutShells = new Set();
  function syncBrandLogo(home) {
    const nav = home?.querySelector('.taroify-tabbar');
    if (!nav) {
      brandLogo?.remove();
      return;
    }
    if (!brandLogo) {
      brandLogo = document.createElement('img');
      brandLogo.id = 'mm-brand-logo';
      brandLogo.src = extensionAPI.runtime.getURL('assets/maimemo-logo.png');
      brandLogo.alt = '墨墨';
      brandLogo.width = 36;
      brandLogo.height = 36;
      brandLogo.draggable = false;
    }
    if (brandLogo.parentElement !== nav || nav.firstElementChild !== brandLogo) nav.prepend(brandLogo);
  }

  function fitStudyShell(activeRoot, home) {
    const next = new Set();
    const anchor = activeRoot || home;
    if (anchor && settings.appearance.redesign) {
      for (let node = anchor.parentElement; node && node !== document.documentElement; node = node.parentElement) next.add(node);
    }
    for (const node of layoutShells) {
      if (!next.has(node)) {
        node.removeAttribute('data-mm-study-shell');
        layoutShells.delete(node);
      }
    }
    for (const node of next) {
      setAttribute(node, 'data-mm-study-shell', 'true');
      layoutShells.add(node);
    }
  }

  const historySources = new Set();
  let historyPanel;
  let historyContent;
  let historySignature = '';

  function copyHistory(node) {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
    if (!(node instanceof Element)) return null;
    // Copy only text and presentation classes; no native IDs, handlers or Taro internals.
    const copy = document.createElement(node.tagName === 'TARO-TEXT-CORE' ? 'span' : 'div');
    copy.className = node.getAttribute('class') || '';
    for (const child of node.childNodes) {
      const copied = copyHistory(child);
      if (copied) copy.append(copied);
    }
    return copy;
  }

  function syncMemoryHistory(activeRoot) {
    const source = settings.appearance.redesign ? activeRoot?.querySelector('.rev-scroller .memo-history') : null;
    const host = source?.textContent.trim() ? activeRoot.querySelector('.rev-top') : null;
    const hidden = new Set();
    if (host) {
      const container = source.closest('.rev-content-container');
      hidden.add(container || source);
      const header = container?.previousElementSibling;
      if (header?.matches('.rev-content-header') && header.textContent.trim() === '记忆历史') {
        hidden.add(header);
        if (header.previousElementSibling?.matches('.rev-content-blank')) hidden.add(header.previousElementSibling);
      }
    }
    for (const node of historySources) {
      if (!hidden.has(node)) {
        node.removeAttribute('data-mm-history-source');
        historySources.delete(node);
      }
    }
    for (const node of hidden) {
      setAttribute(node, 'data-mm-history-source', 'true');
      historySources.add(node);
    }
    if (!host) {
      historyPanel?.remove();
      historyPanel = null;
      historySignature = '';
      return;
    }
    if (!historyPanel) {
      historyPanel = document.createElement('section');
      historyPanel.id = 'mm-memory-history';
      historyPanel.setAttribute('aria-label', '记忆历史');
      historyPanel.addEventListener('click', (event) => event.stopPropagation());
      const heading = document.createElement('h2');
      heading.textContent = '记忆历史';
      historyContent = document.createElement('div');
      historyPanel.append(heading, historyContent);
    }
    if (historyPanel.parentElement !== host) host.append(historyPanel);
    const signature = source.outerHTML;
    if (signature !== historySignature) {
      // Keep React's source nodes in place so word changes and rerenders remain safe.
      historyContent.replaceChildren(copyHistory(source));
      historySignature = signature;
    }
  }

  function labelFor(button, definition) {
    return definition.labels.find((label) => button.textContent.trim().startsWith(label));
  }

  function feedbackTarget(activeRoot, definition) {
    if (!activeRoot || [...activeRoot.querySelectorAll('.rev-recall-mask, .rev-recall-mask-partial')].some(available)) return null;
    return [...activeRoot.querySelectorAll('.rev-resp-btns .reset-button')].find((button) => {
      if (!labelFor(button, definition) || button.disabled || button.getAttribute('aria-disabled') === 'true'
        || (button.hasAttribute('disabled') && button.getAttribute('disabled') !== 'false')
        || button.closest('[hidden], [aria-hidden="true"]')) return false;
      for (let node = button; node && node !== activeRoot; node = node.parentElement) {
        const style = getComputedStyle(node);
        // Only our CSS hides the native group; keep its DOM and click handlers intact.
        if ((!node.matches('.rev-resp-btns') && style.display === 'none') || style.visibility === 'hidden') return false;
      }
      return true;
    });
  }

  function syncTrafficControls(activeRoot) {
    if (!activeRoot || !settings.appearance.trafficLights) {
      trafficControls?.remove();
      return;
    }
    if (!trafficControls) {
      trafficControls = document.createElement('div');
      trafficControls.id = 'mm-traffic-controls';
      trafficControls.setAttribute('role', 'group');
      trafficControls.setAttribute('aria-label', '复习反馈');
      for (const definition of feedback) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.mmAction = definition.action;
        button.dataset.mmSymbol = definition.symbol;
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          if (!settings.appearance.trafficLights) return;
          const target = feedbackTarget(button.closest('.rev-root'), definition);
          if (target) target.click();
          // Disable immediately after a native synchronous rerender; no stale second click.
          syncTrafficControls(button.closest('.rev-root'));
        });
        trafficControls.append(button);
      }
    }
    if (trafficControls.parentElement !== activeRoot) activeRoot.append(trafficControls);
    for (const definition of feedback) {
      const button = trafficControls.querySelector(`[data-mm-action="${definition.action}"]`);
      const target = feedbackTarget(activeRoot, definition);
      const label = target ? labelFor(target, definition) : definition.labels[0];
      const key = settings.enabled ? settings.shortcuts[definition.action] : '';
      const shortcut = key || (settings.enabled ? '未设置快捷键' : '扩展快捷键已停用');
      const prediction = target?.querySelector('.predict')?.textContent.trim();
      const tooltip = [label, shortcut, target ? prediction : '先显示答案后可用'].filter(Boolean).join(' · ');
      setAttribute(button, 'data-mm-tooltip', tooltip);
      setAttribute(button, 'aria-label', tooltip);
      if (button.disabled !== !target) {
        if (!target && document.activeElement === button) button.blur();
        button.disabled = !target;
      }
      if (key) setAttribute(button, 'aria-keyshortcuts', key);
      else button.removeAttribute('aria-keyshortcuts');
    }
  }

  function autoStart() {
    if (!isApp || !settings.autoStart || startClicked || checkboxPending) return;
    if (!['', '#/', '#/pages/index/index'].includes(location.hash.split('?')[0])) return;
    const start = [...document.querySelectorAll('.index__action-btn')]
      .find((button) => button.textContent.trim() === '开始学习' && available(button));
    if (!start) return;
    const label = document.querySelector('.index__checkbox');
    const checkbox = label?.querySelector('input[type="checkbox"]');
    const checked = checkbox ? checkbox.checked : label?.querySelector('[aria-checked="true"], .taroify-checkbox--checked');
    if (!checked) {
      if (!label || checkboxClicked) return;
      // Click the native checkbox once. Wait for React's next render before starting.
      checkboxClicked = true;
      checkboxPending = true;
      (checkbox || label).click();
      retryTimer = window.setTimeout(() => { checkboxPending = false; schedule(); }, 60);
      return;
    }
    startClicked = true;
    start.click();
  }

  function refresh() {
    pending = false;
    if (!settings || !document.documentElement) return;
    if (lastRoute !== location.hash) {
      lastRoute = location.hash;
      startClicked = false;
      checkboxClicked = false;
      checkboxPending = false;
      window.clearTimeout(retryTimer);
    }
    const root = document.documentElement;
    const appearance = settings.appearance;
    if (!isApp) {
      for (const frame of document.querySelectorAll('iframe')) {
        let matches = false;
        try {
          const url = new URL(frame.getAttribute('src'), location.href);
          matches = url.origin === 'https://tc-apis.maimemo.com' && url.pathname.startsWith('/webstudy/');
        } catch { /* Leave unrelated frames alone. */ }
        if (matches) setAttribute(frame, 'data-mm-study-frame', 'true');
        else frame.removeAttribute('data-mm-study-frame');
      }
      const frame = document.querySelector('iframe[data-mm-study-frame]');
      setAttribute(root, 'data-mm-clean', String(appearance.cleanPage && Boolean(frame)));
      return;
    }
    applyTheme();
    setAttribute(root, 'data-mm-hide-toasts', String(appearance.hideToasts));
    const studyRoute = location.hash.split('?')[0] === '#/pages/home/index';
    const activeRoot = studyRoute ? [...document.querySelectorAll('.rev-root')].find(available) : null;
    const home = studyRoute && appearance.redesign ? [...document.querySelectorAll('.home')].find(available) : null;
    setAttribute(root, 'data-mm-home-layout', String(Boolean(home)));
    setAttribute(root, 'data-mm-study', String(Boolean(activeRoot)));
    setAttribute(root, 'data-mm-redesign', String(appearance.redesign));
    setAttribute(root, 'data-mm-traffic', String(appearance.trafficLights));
    fitStudyShell(activeRoot, home);
    syncBrandLogo(home);
    const showToolbar = Boolean(activeRoot) && (appearance.redesign || appearance.trafficLights);
    if (showToolbar) {
      ensureToolbar(activeRoot);
      if (toolbar?.hidden) toolbar.hidden = false;
      applyTheme();
    } else if (toolbar && !toolbar.hidden) toolbar.hidden = true;
    syncMemoryHistory(activeRoot);
    syncTrafficControls(activeRoot);
    autoStart();
  }

  function schedule() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(refresh);
  }

  // Native button semantics for the site's custom elements, without changing handlers.
  document.addEventListener('keydown', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-mm-action]') : null;
    if (!button || !settings?.appearance.trafficLights || !['Enter', ' '].includes(event.key)
      || event.isComposing || event.keyCode === 229
      || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const key = event.code || event.key;
    if (event.repeat || activatedKeys.has(key)) return;
    activatedKeys.add(key);
    if (available(button)) button.click();
  }, true);
  document.addEventListener('keyup', (event) => {
    if (activatedKeys.delete(event.code || event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  const observer = new MutationObserver((records) => {
    if (records.some((record) => {
      const node = record.target instanceof Element ? record.target : record.target.parentElement;
      return !node?.closest('.mm-liquid-mount');
    })) schedule();
  });
  observer.observe(document, { childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'src', 'checked', 'aria-hidden', 'disabled', 'aria-disabled'] });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('popstate', schedule);
  window.addEventListener('pageshow', schedule);
  window.addEventListener('blur', () => activatedKeys.clear());
  colorScheme.addEventListener('change', applyTheme);
  config.watch((next) => { settings = next; schedule(); });
  extensionAPI.runtime.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'maimemo:reapply') return;
    config.read().then((next) => {
      settings = next;
      refresh();
      globalThis.MaimemoLiquidGlass?.refresh();
      sendResponse({ ok: true });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  });
  config.read().then((value) => { settings = value; schedule(); }).catch(() => {
    settings = config.normalize();
    // A storage failure should not start a session without the user's saved preference.
    settings.autoStart = false;
    schedule();
  });
})();
