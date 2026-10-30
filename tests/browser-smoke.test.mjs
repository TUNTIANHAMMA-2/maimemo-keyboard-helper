import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Optional development-only runner. Production uses the committed local bundle.
const modulePath = process.env.MAIMEMO_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const project = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(resolve(project, path), 'utf8');
const appURL = 'https://tc-apis.maimemo.com/webstudy/app';
const scripts = (await Promise.all(['core/shortcut-utils.js', 'core/settings.js', 'content/liquid-glass.js', 'content/maimemo-page.js', 'content/maimemo-shortcuts.js'].map(read))).join('\n');
const css = `${await read('content/maimemo-page.css')}\n${await read('core/liquid-glass.css')}`;
const studyHTML = await read('tests/fixtures/study.html');
const apiFlag = process.argv.indexOf('--api');
const apiNamespace = apiFlag < 0 ? 'browser' : process.argv[apiFlag + 1];
if (!['browser', 'chrome'].includes(apiNamespace)) throw new Error('--api must be browser or chrome');
const browser = await chromium.launch({ headless: true, executablePath: process.env.MAIMEMO_BROWSER_EXECUTABLE });
const errors = [];
const screenshotDir = process.env.MAIMEMO_SCREENSHOT_DIR;
const mediaSessions = new WeakMap();

async function media(page, colorScheme = 'light', transparency = 'no-preference') {
  await page.emulateMedia({ colorScheme });
  let session = mediaSessions.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    mediaSessions.set(page, session);
  }
  // Make visual tests independent of the host Windows transparency preference.
  await session.send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-color-scheme', value: colorScheme },
    { name: 'prefers-reduced-transparency', value: transparency }
  ] });
}

function storageMock({ initial, apiNamespace }) {
  let stored = initial;
  const listeners = [];
  window.__readStored = () => stored;
  window.__setSettings = async (value) => window[apiNamespace].storage.local.set({ maimemoKeyboardSettings: value });
  window.__rafCount = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => { window.__rafCount++; return raf(fn); };
  window[apiNamespace] = {
    storage: {
      local: {
        get: async () => ({ maimemoKeyboardSettings: stored }),
        set: async (next) => {
          stored = structuredClone(next.maimemoKeyboardSettings);
          for (const listener of listeners) listener({ maimemoKeyboardSettings: { newValue: stored } }, 'local');
        }
      },
      onChanged: { addListener: (listener) => listeners.push(listener) }
    },
    runtime: {
      openOptionsPage: () => { window.__openedOptions = true; },
      getURL: (path) => `http://helper.test/${path}`
    }
  };
}

async function pageFor(html = studyHTML, initial, url = `${appURL}#/pages/home/index`, content = true, browserOptions = {}, transparency = 'no-preference') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', ...browserOptions });
  await media(page, 'light', transparency);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(storageMock, { initial, apiNamespace });
  if (content) await page.addInitScript({ content: scripts });
  // Every request is fulfilled locally. No real account, API or review is used.
  await page.route('**/*', async (route) => {
    const requestURL = new URL(route.request().url());
    if (url.startsWith('https://www.maimemo.com/') && requestURL.hostname === 'tc-apis.maimemo.com') {
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body>学习框架测试</body></html>' });
    }
    if (requestURL.hostname === 'helper.test') {
      const path = requestURL.pathname.slice(1);
      if (path === 'assets/maimemo-logo.png') return route.fulfill({ contentType: 'image/png', body: await readFile(resolve(project, path)) });
      if (!/^(core|options|popup|content)\/[a-z-]+\.(html|js|css)$/.test(path)) return route.fulfill({ status: 404, body: '' });
      const types = { html: 'text/html', js: 'text/javascript', css: 'text/css' };
      return route.fulfill({ contentType: types[path.split('.').pop()], body: await read(path) });
    }
    return route.fulfill({ contentType: 'text/html', body: html.replace('<head>', `<head><style>${css}</style>`) });
  });
  await page.goto(url);
  return page;
}

async function frames(page) {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}
async function change(page, patch) {
  await page.evaluate(async (patch) => { await window.MaimemoSettings.update(patch); }, patch);
  await frames(page);
}
async function count(page, action) { return page.evaluate((action) => window.__fixture.counts[action], action); }
async function reveal(page) { await page.evaluate(() => window.__fixture.reveal()); await frames(page); }
async function idle(page) {
  const before = await page.evaluate(() => window.__rafCount);
  await page.waitForTimeout(160);
  const after = await page.evaluate(() => window.__rafCount);
  assert.ok(after - before < 4, 'enhancements must settle instead of observing their own mutations forever');
}
async function screenshot(page, name) {
  if (!screenshotDir) return;
  await page.waitForFunction(() => [...document.querySelectorAll('.mm-liquid-mount')].every((layer) => {
    const svg = layer.querySelector('.mm-liquid-surface > svg');
    return svg && Math.abs(parseFloat(svg.style.width) - layer.clientWidth) < 1 && Math.abs(parseFloat(svg.style.height) - layer.clientHeight) < 1;
  }));
  const path = resolve(screenshotDir, name);
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
}

async function checkLayout(page) {
  const layout = await page.evaluate(() => {
    const box = (node) => { const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; };
    const controls = [...document.querySelectorAll('.rev-top-stats > :not(.rest), [data-mm-action]')]
      .filter((node) => node.getBoundingClientRect().width > 0)
      .map((node) => ({ name: node.id || node.getAttribute('data-mm-action') || node.textContent.trim() || node.className, ...box(node) }));
    return {
      width: innerWidth, height: innerHeight, root: box(document.querySelector('.rev-root')),
      nav: box(document.querySelector('.taroify-tabbar')),
      documentHeight: document.scrollingElement.scrollHeight, documentWidth: document.scrollingElement.scrollWidth,
      controls, scrollbars: [...document.querySelectorAll('.rev-top, .rev-scroller')].map((node) => getComputedStyle(node).scrollbarWidth)
    };
  });
  assert.ok(Math.abs(layout.root.y) < 1 && Math.abs(layout.root.height - layout.height) < 1, 'study container must fill the viewport height');
  assert.ok(Math.abs(layout.root.x + layout.root.width - layout.width) < 1, 'study container must use the full available width');
  assert.ok(layout.nav.x + layout.nav.width <= layout.root.x, 'native navigation must stay beside the study container');
  assert.ok(layout.documentHeight <= layout.height + 1 && layout.documentWidth <= layout.width + 1, 'outer page must not scroll');
  assert.ok(layout.scrollbars.every((value) => value === 'none'), 'content scrollbars must stay hidden');
  for (let i = 0; i < layout.controls.length; i++) {
    const a = layout.controls[i];
    assert.ok(a.x >= layout.root.x - 1 && a.x + a.width <= layout.width + 1, `control ${a.name} must stay within the header`);
    for (const b of layout.controls.slice(i + 1)) {
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      assert.ok(overlapX <= 1 || overlapY <= 1, `header controls must not overlap: ${a.name} / ${b.name}`);
    }
  }
}

async function checkRevealPosition(page) {
  await page.evaluate(() => window.__fixture.recall());
  await frames(page);
  const selectors = ['.rev-top .spelling', '.rev-top > .phonetic'];
  const before = await Promise.all(selectors.map((selector) => page.locator(selector).boundingBox()));
  await reveal(page);
  const after = await Promise.all(selectors.map((selector) => page.locator(selector).boundingBox()));
  for (let i = 0; i < selectors.length; i++) {
    for (const dimension of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before[i][dimension] - after[i][dimension]) < 1, `${selectors[i]} must not jump when revealing the definition`);
  }
}

async function checkMemoryHistory(page) {
  const native = page.locator('.rev-scroller .memo-history');
  const copy = page.locator('.rev-top #mm-memory-history .memo-history');
  assert.equal(await native.count(), 1);
  assert.equal(await copy.count(), 1, 'history must be shown beneath the definition');
  assert.equal(await copy.textContent(), await native.textContent(), 'the sidebar must preserve the site record verbatim');
  assert.equal(await page.locator('#native-memory-history').count(), 1, 'the view must not duplicate native IDs');
  assert.equal(await native.isVisible(), false, 'only the sidebar history should be visible');
  const definition = await page.locator('.interp-ctn').boundingBox();
  const history = await page.locator('#mm-memory-history').boundingBox();
  assert.ok(history.y >= definition.y + definition.height, 'history must follow the definition');
  const wordBefore = await page.locator('.rev-top .spelling').boundingBox();
  await page.evaluate(() => {
    window.__nativeHistory = document.querySelector('.rev-scroller .memo-history');
    window.__historyHeaderClicks = 0;
    document.querySelector('.rev-top').addEventListener('click', () => window.__historyHeaderClicks++);
    window.__nativeHistory.querySelector('.history-title').textContent = '2026年1月3日 | 记忆 3 次';
    const item = document.createElement('taro-view-core');
    item.className = 'item history_vague';
    item.textContent = 'D2 模糊';
    window.__nativeHistory.querySelector('.items').append(item);
  });
  await frames(page);
  assert.equal(await copy.textContent(), await native.textContent(), 'changes to the real DOM must update the sidebar');
  assert.match(await copy.textContent(), /记忆 3 次/);
  assert.equal(await page.evaluate(() => window.__nativeHistory === document.querySelector('.rev-scroller .memo-history')), true, 'native history nodes must stay owned by the site');
  assert.deepEqual(await page.locator('.rev-top .spelling').boundingBox(), wordBefore, 'history updates must not shift the word');
  await page.locator('#mm-memory-history').click();
  assert.equal(await page.evaluate(() => window.__historyHeaderClicks), 0, 'reading history must not play vocabulary audio');
  await change(page, { appearance: { redesign: false } });
  assert.equal(await page.locator('#mm-memory-history').count(), 0);
  assert.equal(await page.locator('[data-mm-history-source]').count(), 0, 'disabling the layout must restore original history');
  assert.equal(await native.isVisible(), true);
  await change(page, { appearance: { redesign: true } });
  assert.equal(await copy.textContent(), await native.textContent());
  await page.evaluate(() => window.__fixture.recall());
  await frames(page);
  assert.equal(await page.locator('#mm-memory-history').count(), 0, 'changing words must not leave stale history');
  await reveal(page);
  assert.match(await copy.textContent(), /记忆 2 次/, 'a new word must use its own current source');
  assert.doesNotMatch(await copy.textContent(), /记忆 3 次/);
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('.rev-scroller [data-mm-history-source]')) node.remove();
  });
  await frames(page);
  assert.equal(await page.locator('#mm-memory-history').count(), 0, 'words without history must not gain an invented record');
  await page.evaluate(() => window.__fixture.recall());
  await reveal(page);
  await idle(page);
}

try {
  const page = await pageFor();
  await page.waitForSelector('#mm-study-toolbar');
  await page.waitForFunction(() => document.querySelector('#mm-brand-logo')?.naturalWidth > 0);
  await page.waitForSelector('#mm-study-toolbar .glass__warp');
  assert.equal(await page.locator('.mm-wordmark, .mm-reveal-hint').count(), 0, 'removed toolbar text must not be recreated');
  assert.equal(await page.locator('.rev-top-stats #mm-study-toolbar').count(), 1, 'theme button belongs inside the site header');
  const wordBefore = await page.locator('.rev-top .spelling').boundingBox();
  assert.equal(await page.getAttribute('html', 'data-mm-theme'), 'light');
  assert.equal(await page.locator('.taro__toast').isVisible(), false);
  await screenshot(page, 'study-recall.png');
  await page.keyboard.press('4');
  assert.equal(await count(page, 'wellFamiliar'), 0, '熟知 must wait for the answer');
  await page.keyboard.press('Space');
  await page.waitForSelector('[data-mm-action="familiar"]');
  await page.waitForSelector('[data-mm-liquid-surface="definition"] .glass__warp');
  await page.waitForFunction(() => [...document.querySelectorAll('.mm-liquid-mount')].every((layer) => {
    return [...layer.children].every((child) => Math.abs(child.getBoundingClientRect().width - layer.clientWidth) < 1);
  }));
  assert.ok(await page.locator('.glass__warp').evaluateAll((nodes) => nodes.some((node) => node.style.filter.includes('url('))), 'the real upstream SVG refraction layer must render');
  assert.equal(await page.locator('.rev-scroller .phrase-phrase').first().evaluate((node) => Boolean(node.closest('.mm-liquid-mount')) || getComputedStyle(node).filter !== 'none'), false, 'glass filters must not warp the learning text');
  const wordAfter = await page.locator('.rev-top .spelling').boundingBox();
  assert.ok(Math.abs(wordBefore.y - wordAfter.y) < 1, 'revealing the answer must keep the word in place');
  await checkLayout(page);
  const positions = await page.locator('[data-mm-action]').evaluateAll((buttons) => Object.fromEntries(buttons.map((button) => [button.dataset.mmAction, button.getBoundingClientRect().x])));
  assert.ok(positions.forget < positions.vague && positions.vague < positions.familiar, 'traffic lights must be red, yellow, green');
  assert.match(await page.getAttribute('[data-mm-action="forget"]', 'data-mm-tooltip'), /忘记 · 3 · 今日 \/ 1 天后/);
  await page.locator('[data-mm-action="forget"]').hover();
  assert.equal(await page.locator('[data-mm-action="forget"]').evaluate((node) => getComputedStyle(node, '::after').visibility), 'visible');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-mm-action="forget"]'), '::after').opacity === '1');
  const definitionBeforeHover = await page.locator('.interp-ctn').boundingBox();
  await page.locator('.interp-ctn').hover();
  await frames(page);
  assert.deepEqual(await page.locator('.interp-ctn').boundingBox(), definitionBeforeHover, 'glass hover effects must not move or stretch the native card');
  await screenshot(page, 'study-light.png');
  await idle(page);
  await change(page, { appearance: { theme: 'dark' } });
  assert.equal(await page.getAttribute('html', 'data-mm-theme'), 'dark');
  await screenshot(page, 'study-dark.png');
  await checkMemoryHistory(page);
  await page.keyboard.press('1');
  assert.equal(await count(page, 'familiar'), 1, 'native handlers must not double-submit');
  await reveal(page);
  await page.evaluate(() => {
    document.querySelector('[data-feedback="vague"]').firstChild.textContent = '不确定';
    document.querySelector('[data-feedback="forget"]').firstChild.textContent = '不认识';
  });
  await frames(page);
  assert.match(await page.getAttribute('[data-mm-action="vague"]', 'data-mm-tooltip'), /^不确定/);
  assert.match(await page.getAttribute('[data-mm-action="forget"]', 'data-mm-tooltip'), /^不认识/);
  for (const [key, action] of [['2', 'vague'], ['3', 'forget'], ['4', 'wellFamiliar']]) {
    await reveal(page);
    await page.keyboard.press(key);
    assert.equal(await count(page, action), 1, `${action} must click the native control exactly once`);
  }
  assert.equal(await count(page, 'menu'), 0, '熟知 must never open the shared-class menu');
  await change(page, { shortcuts: { familiar: 'q' } });
  await reveal(page);
  assert.match(await page.getAttribute('[data-mm-action="familiar"]', 'aria-label'), /认识 · Q/);
  await page.keyboard.down('q');
  await page.keyboard.down('q');
  await page.keyboard.up('q');
  assert.equal(await count(page, 'familiar'), 2, 'a held key must submit once');
  assert.deepEqual(await page.evaluate(() => window.__nativeEvents.filter((event) => event.endsWith(':q'))), [], 'custom letters must not reach spelling listeners');
  await reveal(page);
  await page.locator('#typing').evaluate((input) => input.classList.remove('hidden'));
  await page.locator('#typing').press('q');
  assert.equal(await page.locator('#typing').inputValue(), 'q');
  assert.equal(await count(page, 'familiar'), 2, 'typing must be protected');
  await page.locator('#typing').evaluate((input) => { input.blur(); input.classList.add('hidden'); });
  await page.locator('[data-mm-action="forget"]').focus();
  await page.keyboard.press('Space');
  assert.equal(await count(page, 'forget'), 2, 'Space must activate a focused traffic light once even when it rerenders');
  await reveal(page);
  await page.locator('[data-mm-action="vague"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await count(page, 'vague'), 2, 'custom controls must support Enter');
  await change(page, { enabled: false });
  await reveal(page);
  assert.match(await page.getAttribute('[data-mm-action="familiar"]', 'aria-label'), /扩展快捷键已停用/);
  await page.keyboard.press('q');
  assert.equal(await count(page, 'familiar'), 2);
  await change(page, { enabled: true, shortcuts: { familiar: 'Alt+q' } });
  await page.keyboard.press('Alt+q');
  assert.equal(await count(page, 'familiar'), 3);
  await reveal(page);
  await change(page, { appearance: { trafficLights: false } });
  assert.equal(await page.locator('[data-mm-action]').count(), 0, 'disabling traffic lights restores the original controls');
  assert.equal(await page.getAttribute('[data-feedback="familiar"]', 'aria-label'), null);
  await change(page, { appearance: { trafficLights: true, theme: 'system' } });
  await media(page, 'dark');
  await frames(page);
  assert.equal(await page.getAttribute('html', 'data-mm-theme'), 'dark');
  await change(page, { appearance: { theme: 'light' } });
  assert.equal(await page.getAttribute('html', 'data-mm-theme'), 'light', 'explicit light overrides a dark system');
  await page.evaluate(() => {
    window.__headerClicks = 0;
    document.querySelector('.rev-top').addEventListener('click', () => window.__headerClicks++);
  });
  await page.locator('#mm-study-toolbar button').click();
  await page.waitForFunction(() => document.documentElement.getAttribute('data-mm-theme') === 'dark');
  assert.equal(await page.evaluate(() => window.__readStored().appearance.theme), 'dark', 'the page theme switch must persist');
  assert.equal(await page.evaluate(() => window.__readStored().shortcuts.familiar), 'Alt+Q');
  assert.equal(await page.evaluate(() => window.__headerClicks), 0, 'theme switching must not trigger header audio');
  await change(page, { appearance: { theme: 'light' } });
  await page.setViewportSize({ width: 390, height: 844 });
  await frames(page);
  await checkRevealPosition(page);
  await checkLayout(page);
  await page.locator('[data-mm-action="forget"]').hover();
  await screenshot(page, 'study-mobile.png');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'narrow screens must not overflow horizontally');
  const card = await page.locator('.rev-root').boundingBox();
  assert.ok(card.y + card.height <= 845, 'card and scrollable content must fit the viewport');
  for (const viewport of [{ width: 320, height: 568 }, { width: 800, height: 720 }, { width: 1880, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await frames(page);
    await checkRevealPosition(page);
    await checkLayout(page);
  }
  await page.locator('[data-tab="1"]').click();
  await frames(page);
  assert.equal(await page.locator('#mm-memory-history').count(), 0, 'cached review history must not remain visible on other tabs');
  assert.equal(await page.locator('#selection-page').isVisible(), true, 'side navigation must retain the original tab handler');
  assert.equal(await page.getAttribute('html', 'data-mm-home-layout'), 'true', 'side rail must persist across home tabs');
  await page.locator('[data-tab="2"]').click();
  await frames(page);
  assert.equal(await page.locator('#profile-page').isVisible(), true);
  await page.locator('[data-tab="0"]').click();
  await frames(page);
  assert.equal(await page.locator('.rev-root').isVisible(), true);
  assert.deepEqual(await page.evaluate(() => window.__tabClicks), [1, 1, 1]);
  await checkLayout(page);
  await page.evaluate(() => {
    const container = document.querySelector('.rev-scroller .rev-content-container');
    const sample = container.querySelector('.phrase-root');
    for (let i = 0; i < 24; i++) container.append(sample.cloneNode(true));
    document.querySelector('.interp-text').textContent += '\n长释义测试。'.repeat(45);
  });
  await frames(page);
  const headerBeforeScroll = await page.locator('.rev-top-stats').boundingBox();
  await page.locator('.rev-scroller').hover();
  await page.mouse.wheel(0, 700);
  await page.waitForFunction(() => document.querySelector('.rev-scroller').scrollTop > 0);
  await page.locator('.rev-top .spelling').hover();
  await page.mouse.wheel(0, 400);
  await page.waitForFunction(() => document.querySelector('.rev-top').scrollTop > 0);
  assert.deepEqual(await page.locator('.rev-top-stats').boundingBox(), headerBeforeScroll, 'scrolling long content must not move the header');
  assert.equal(await page.evaluate(() => scrollY), 0, 'wheel scrolling must remain inside the content panes');
  await checkLayout(page);
  await page.evaluate(() => { location.hash = '#/pages/search/index'; });
  await frames(page);
  assert.equal(await page.getAttribute('html', 'data-mm-study'), 'false');
  assert.equal(await page.getAttribute('html', 'data-mm-home-layout'), 'false');
  assert.equal(await page.locator('#mm-memory-history, [data-mm-history-source]').count(), 0, 'history changes must be reversible on route exit');
  assert.equal(await page.locator('.mm-liquid-mount').count(), 0, 'glass roots must be removed outside their active pages');
  assert.equal(await page.locator('[data-mm-study-shell]').count(), 0, 'layout overrides must be removed outside the home route');
  assert.equal(await page.locator('#mm-study-toolbar').isVisible(), false);
  assert.equal(await page.locator('[data-mm-action]').count(), 0, 'cached review DOM must not stay decorated on another route');
  await idle(page);
  await page.close();
  console.log('study page: actions, suppression, input protection, accessibility, themes, tooltip updates and layout passed');
  console.log('layout: full viewport, stable reveal positions, native side tabs and isolated scrolling passed at 320/390/800/1440/1880 widths');
  console.log('memory history: source fidelity, live updates, native DOM ownership, word changes and restoration passed');

  const firefoxBranch = await pageFor(studyHTML, undefined, `${appURL}#/pages/home/index`, true, {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0'
  });
  await firefoxBranch.waitForSelector('#mm-study-toolbar .glass__warp');
  assert.equal(await firefoxBranch.locator('.glass__warp').evaluateAll((nodes) => nodes.every((node) => !node.style.filter)), true, 'upstream Firefox branch must omit unsupported displacement');
  const firefoxGlass = await firefoxBranch.locator('.glass__warp').first().evaluate((node) => ({
    inline: node.getAttribute('style'), backdrop: getComputedStyle(node).backdropFilter,
    reducedTransparency: matchMedia('(prefers-reduced-transparency: reduce)').matches
  }));
  assert.ok(firefoxGlass.backdrop.includes('blur('), `Firefox branch must keep the glass blur: ${JSON.stringify(firefoxGlass)}`);
  await firefoxBranch.keyboard.press('Space');
  await firefoxBranch.waitForSelector('[data-mm-liquid-surface="definition"] .glass__warp');
  await screenshot(firefoxBranch, 'study-firefox-branch.png');
  await firefoxBranch.keyboard.press('1');
  assert.equal(await count(firefoxBranch, 'familiar'), 1);
  await firefoxBranch.close();
  console.log('Liquid Glass: actual component, non-interfering backgrounds and Firefox compatibility branch passed (UA simulation, not native Gecko).');

  const entryHTML = `<!doctype html><html><head><meta charset="utf-8"></head><body>
    <label class="index__checkbox"><input type="checkbox">我已阅读</label><button class="index__action-btn">开始学习</button>
    <script>window.__startClicks=0; window.__checkboxClicks=0;
    const checkbox=document.querySelector('input');
    checkbox.addEventListener('change',()=>{window.__checkboxClicks++;
    setTimeout(()=>document.body.append(document.createElement('span')),5);
    setTimeout(()=>{
      const button=document.querySelector('button'); const replacement=button.cloneNode(true); const checked=checkbox.checked;
      replacement.onclick=()=>{if(checked)window.__startClicks++}; button.replaceWith(replacement);
    },25)});<\/script></body></html>`;
  const entry = await pageFor(entryHTML, undefined, `${appURL}#/pages/index/index`);
  try { await entry.waitForFunction(() => window.__startClicks === 1, null, { timeout: 5000 }); }
  catch (error) {
    console.error('auto entry fixture diagnostics', await entry.evaluate(() => ({
      startClicks: window.__startClicks, checkboxClicks: window.__checkboxClicks,
      checked: document.querySelector('input')?.checked,
      button: document.querySelector('button')?.outerHTML,
      settings: window.__readStored(), rafCount: window.__rafCount
    })), errors);
    throw error;
  }
  await idle(entry);
  assert.equal(await entry.evaluate(() => window.__checkboxClicks), 1, 'auto entry must check once and wait for React-style rerender');
  await entry.evaluate(() => { document.body.append(document.createElement('div')); });
  await frames(entry);
  assert.equal(await entry.evaluate(() => window.__startClicks), 1, 'other mutations must not start repeatedly');
  await entry.close();
  const off = await pageFor(entryHTML, { autoStart: false }, `${appURL}#/pages/index/index`);
  await frames(off);
  assert.equal(await off.locator('input').isChecked(), false, 'saved opt-out must apply before any automated click');
  await off.close();
  const checkedHTML = entryHTML.replace('type="checkbox"', 'type="checkbox" checked').replace('window.__startClicks=0;', 'window.__startClicks=0; document.querySelector("button").onclick=()=>window.__startClicks++;');
  const checked = await pageFor(checkedHTML, undefined, `${appURL}#/pages/index/index`);
  await checked.waitForFunction(() => window.__startClicks === 1);
  assert.equal(await checked.locator('input').isChecked(), true, 'an already checked agreement must never be toggled off');
  await checked.close();
  console.log('auto entry: asynchronous checkbox state, once-only entry, prechecked state and opt-out passed');

  const outer = await pageFor('<html><head></head><body><nav class="navbar-momo">导航</nav><footer class="footer-border">页脚</footer><iframe src="https://tc-apis.maimemo.com/webstudy/app"></iframe></body></html>', undefined, 'https://www.maimemo.com/home/web_study');
  await outer.waitForFunction(() => document.documentElement.getAttribute('data-mm-clean') === 'true');
  assert.equal(await outer.locator('.navbar-momo').isVisible(), false);
  const iframe = await outer.locator('iframe').boundingBox();
  assert.equal(iframe.width, 1440);
  assert.equal(iframe.height, 1000);
  await change(outer, { appearance: { cleanPage: false } });
  assert.equal(await outer.locator('.navbar-momo').isVisible(), true);
  await change(outer, { appearance: { cleanPage: true } });
  await outer.locator('iframe').evaluate((frame) => frame.setAttribute('src', 'about:blank'));
  await frames(outer);
  assert.equal(await outer.getAttribute('html', 'data-mm-clean'), 'false', 'a frame navigating away must restore the wrapper');
  await outer.close();
  console.log('wrapper cleanup: frame-only targeting, viewport fill and rollback passed');

  const options = await pageFor('', { enabled: false, shortcuts: { familiar: 'q' }, appearance: { theme: 'dark' } }, 'http://helper.test/options/options.html', false);
  await options.waitForFunction(() => !document.querySelector('#save').disabled);
  assert.equal(await options.locator('#shortcut-familiar').inputValue(), 'Q');
  assert.equal(await options.getAttribute('html', 'data-theme'), 'dark');
  await options.locator('#shortcut-vague').press('q');
  await options.locator('#save').click();
  assert.match(await options.locator('#status').textContent(), /快捷键重复/);
  await options.locator('#shortcut-vague').press('w');
  await options.locator('#autoStart').uncheck();
  await options.locator('#theme').selectOption('light');
  await options.locator('#save').click();
  await options.waitForFunction(() => document.querySelector('#status').textContent.includes('已保存'));
  const saved = await options.evaluate(() => window.__readStored());
  assert.equal(saved.autoStart, false);
  assert.equal(saved.enabled, false);
  assert.equal(saved.appearance.theme, 'light');
  assert.equal(saved.shortcuts.familiar, 'Q');
  assert.equal(saved.shortcuts.vague, 'W');
  await screenshot(options, 'settings.png');
  await options.close();
  const popup = await pageFor('', saved, 'http://helper.test/popup/popup.html', false);
  await popup.waitForFunction(() => !document.querySelector('#enabled').disabled);
  await popup.locator('[data-theme-value="dark"]').click();
  await popup.locator('#enabled').check();
  const popupSaved = await popup.evaluate(() => window.__readStored());
  assert.equal(popupSaved.appearance.theme, 'dark');
  assert.equal(popupSaved.autoStart, false, 'popup updates must preserve every unrelated preference');
  assert.equal(popupSaved.shortcuts.familiar, 'Q');
  await popup.locator('#open-options').click();
  assert.equal(await popup.evaluate(() => window.__openedOptions), true);
  await popup.close();
  const opaque = await pageFor('', saved, 'http://helper.test/options/options.html', false, {}, 'reduce');
  await opaque.waitForSelector('#save .glass__warp');
  assert.equal(await opaque.locator('#save .glass__warp').evaluate((node) => getComputedStyle(node).backdropFilter), 'none', 'reduced-transparency mode must be respected');
  const primaryFill = await opaque.locator('#save .mm-liquid-mount').evaluate((node) => getComputedStyle(node).backgroundColor);
  assert.match(primaryFill, /35, 48, 62/, 'the save button must retain a dark background with its white text');
  await opaque.close();
  console.log('settings and popup: migration, recording, validation, persistence and partial updates passed');
  assert.deepEqual(errors, [], 'browser pages must not report uncaught errors');
  console.log(`All browser smoke tests passed with ${apiNamespace} API (locally fulfilled fixtures, no real study submissions).`);
} finally { await browser.close(); }
