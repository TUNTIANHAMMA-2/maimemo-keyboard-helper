import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readPNG, red, equalRegion } from './png-reader.mjs';

const modulePath = process.env.MAIMEMO_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const project = fileURLToPath(new URL('../', import.meta.url));
const extension = resolve(project, 'dist/chromium');
const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
const html = await readFile(resolve(project, 'tests/fixtures/study.html'), 'utf8');
const opticsHTML = await readFile(resolve(project, 'tests/fixtures/glass-optics.html'), 'utf8');
const profile = await mkdtemp(join(tmpdir(), 'maimemo-extension-test-'));
const errors = [];
let context;

async function stored(page) {
  return page.evaluate(async () => (await (globalThis.browser ?? globalThis.chrome).storage.local.get('maimemoKeyboardSettings')).maimemoKeyboardSettings);
}

async function screenshot(page, name) {
  const directory = process.env.MAIMEMO_SCREENSHOT_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.waitForFunction(() => [...document.querySelectorAll('.mm-liquid-mount')].every((layer) => {
    const svg = layer.querySelector('.mm-liquid-surface > svg');
    return svg && Math.abs(parseFloat(svg.style.width) - layer.clientWidth) < 1;
  }));
  await page.screenshot({ path: resolve(directory, name), fullPage: true });
}

try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath: process.env.MAIMEMO_EXTENSION_BROWSER_EXECUTABLE,
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  const inventory = await context.newPage();
  await inventory.goto('chrome://extensions/');
  await inventory.locator('extensions-item').first().waitFor();
  const extensions = await inventory.locator('extensions-item').evaluateAll((items) => items.map((item) => ({ id: item.id, name: item.data?.name })));
  const loaded = extensions.find((item) => item.name === manifest.name);
  assert.ok(loaded, 'the generated package must actually load as an extension');
  const origin = `chrome-extension://${loaded.id}`;
  await inventory.close();

  const options = await context.newPage();
  await options.goto(`${origin}/options/options.html`);
  await options.waitForFunction(() => !document.querySelector('#save').disabled);
  const nativeManifest = await options.evaluate(() => (globalThis.browser ?? globalThis.chrome).runtime.getManifest());
  assert.equal(nativeManifest.version, manifest.version);
  assert.equal(nativeManifest.browser_specific_settings, undefined);
  assert.deepEqual(nativeManifest.permissions, ['storage']);
  await options.locator('#theme').selectOption('light');
  await options.locator('#save').click();
  await options.waitForFunction(() => document.querySelector('#status').textContent.includes('已保存'));
  assert.equal((await stored(options)).appearance.theme, 'light');
  await options.reload();
  await options.waitForFunction(() => !document.querySelector('#save').disabled);
  assert.equal(await options.locator('#theme').inputValue(), 'light', 'settings must survive a real extension-page reload');

  // Content scripts and their styles are injected by the extension, not addInitScript.
  // The web page is synthetic and fulfilled locally: no account or real review is used.
  await context.route('https://tc-apis.maimemo.com/**', (route) => route.fulfill({ contentType: 'text/html', body: new URL(route.request().url()).searchParams.has('optics') ? opticsHTML : html }));
  const study = await context.newPage();
  await study.goto('https://tc-apis.maimemo.com/webstudy/app#/pages/home/index');
  await study.waitForSelector('#mm-study-toolbar .glass__warp');
  await study.waitForFunction(() => document.querySelector('#mm-brand-logo')?.naturalWidth === 184);
  assert.equal(await study.getAttribute('html', 'data-mm-theme'), 'light');
  assert.equal(await study.locator('#mm-traffic-controls button:disabled').count(), 3, 'recall must retain all three disabled buttons');
  const headerSelectors = ['.back', '.rev-top-stats > taro-text-core:nth-of-type(1)', '.rev-top-stats > taro-text-core:nth-of-type(2)', '#mm-traffic-controls'];
  const headerBefore = await Promise.all(headerSelectors.map((selector) => study.locator(selector).boundingBox()));
  await study.keyboard.press('Space');
  await study.waitForSelector('[data-mm-action="familiar"]:enabled');
  assert.deepEqual(await Promise.all(headerSelectors.map((selector) => study.locator(selector).boundingBox())), headerBefore, 'native extension injection must keep every header control in place on reveal');
  await study.waitForSelector('#mm-memory-history');
  assert.ok(await study.locator('.interp-ctn').evaluate((node) => getComputedStyle(node).backdropFilter.includes('url(')), 'full glass must refract even if the host OS reduces transparency');
  assert.match(await study.locator('#mm-memory-history').textContent(), /记忆 2 次/);
  const word = await study.locator('.spelling').boundingBox();
  const overflow = await study.evaluate(() => ({ height: document.scrollingElement.scrollHeight, viewport: innerHeight }));
  assert.ok(overflow.height <= overflow.viewport + 1, 'injected layout must not create outer scrolling');
  await screenshot(study, 'chromium-extension-light.png');
  await study.keyboard.press('1');
  assert.equal(await study.evaluate(() => window.__fixture.counts.familiar), 1, 'an actual content script must click once and suppress the native duplicate');
  assert.deepEqual(await study.evaluate(() => window.__nativeEvents.filter((event) => event.endsWith(':1'))), []);
  const after = await study.locator('.spelling').boundingBox();
  assert.equal(after.y, word.y, 'answer visibility must not move the word');

  await options.locator('#shortcut-familiar').press('q');
  await options.locator('#theme').selectOption('dark');
  await options.locator('#save').click();
  await options.waitForFunction(() => document.querySelector('#status').textContent.includes('已保存'));
  await study.waitForFunction(() => document.documentElement.dataset.mmTheme === 'dark');
  await study.keyboard.press('Space');
  await study.waitForSelector('[data-mm-action="familiar"]:enabled[aria-keyshortcuts="Q"]');
  await screenshot(study, 'chromium-extension-dark.png');
  await study.keyboard.press('q');
  assert.equal(await study.evaluate(() => window.__fixture.counts.familiar), 2, 'native storage.onChanged must update content-script bindings');
  await study.locator('#typing').evaluate((input) => input.classList.remove('hidden'));
  await study.locator('#typing').press('q');
  assert.equal(await study.locator('#typing').inputValue(), 'q');
  assert.equal(await study.evaluate(() => window.__fixture.counts.familiar), 2);

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 400, height: 600 });
  await popup.goto(`${origin}/popup/popup.html`);
  await popup.waitForFunction(() => !document.querySelector('#enabled').disabled);
  assert.equal(await popup.getAttribute('html', 'data-theme'), 'dark');
  await popup.locator('#enabled').uncheck();
  await popup.waitForFunction(() => document.querySelector('#status').textContent.includes('已保存'));
  assert.equal((await stored(popup)).enabled, false);
  assert.equal((await stored(popup)).shortcuts.familiar, 'Q');
  await popup.locator('#trafficLights').uncheck();
  await study.waitForFunction(() => document.documentElement.dataset.mmTraffic === 'false');
  assert.equal(await study.locator('#mm-traffic-controls').count(), 0);
  const backOff = await study.locator('.back').boundingBox();
  const studyBox = await study.locator('.rev-root').boundingBox();
  assert.ok(backOff.x - studyBox.x <= 26, 'popup toggle must reclaim the traffic-light space on the actual injected page');
  await popup.locator('#trafficLights').check();
  await study.waitForSelector('#mm-traffic-controls');
  await popup.locator('#shortcut-familiar').press('f');
  await popup.locator('#shortcut-vague').press('f');
  await popup.locator('#save-shortcuts').click();
  assert.match(await popup.locator('#status').textContent(), /快捷键重复/);
  assert.equal((await stored(popup)).shortcuts.familiar, 'Q');
  await popup.locator('#shortcut-vague').press('d');
  await popup.locator('#glass').selectOption('solid');
  assert.equal(await popup.locator('#shortcut-familiar').inputValue(), 'F');
  await popup.locator('#save-shortcuts').click();
  await popup.waitForFunction(() => document.querySelector('#status').textContent.includes('已保存'));
  assert.equal((await stored(popup)).shortcuts.familiar, 'F');
  await popup.reload();
  await popup.waitForFunction(() => !document.querySelector('#enabled').disabled);
  assert.equal(await popup.locator('#shortcut-familiar').inputValue(), 'F', 'popup edits must survive reopening, not just change display text');
  assert.equal(await popup.locator('#glass').inputValue(), 'solid');
  await popup.locator('#enabled').check();
  await study.locator('#typing').evaluate((input) => { input.blur(); input.classList.add('hidden'); });
  await study.keyboard.press('Space');
  await study.waitForSelector('[data-mm-action="familiar"]:enabled[aria-keyshortcuts="F"]');
  await study.keyboard.press('f');
  assert.equal(await study.evaluate(() => window.__fixture.counts.familiar), 3, 'a key edited inside the popup must control the live injected page');
  await study.evaluate(() => { document.documentElement.dataset.mmTheme = 'light'; });
  await study.bringToFront();
  await popup.locator('#reapply-page').click();
  await popup.waitForFunction(() => document.querySelector('#status').textContent.includes('已重新应用'));
  await study.waitForFunction(() => document.documentElement.dataset.mmTheme === 'dark');
  await popup.locator('#glass').selectOption('full');
  await screenshot(popup, 'chromium-popup-dark.png');
  await options.close();
  const opened = context.waitForEvent('page');
  await popup.locator('#open-options').click();
  const reopened = await opened;
  await reopened.waitForURL(`${origin}/options/options.html`);
  await reopened.waitForFunction(() => !document.querySelector('#save').disabled);
  assert.equal(await reopened.locator('#shortcut-familiar').inputValue(), 'F');
  await reopened.evaluate(() => MaimemoSettings.update({ appearance: { theme: 'light', glass: 'full' } }));

  const optics = await context.newPage();
  await optics.addInitScript(() => {
    window.__glassFrames = [];
    const sample = () => {
      const host = document.querySelector('#glass-lens');
      const layer = host?.querySelector('.mm-liquid-mount');
      if (layer) window.__glassFrames.push({
        host: [host.clientWidth, host.clientHeight],
        children: [...layer.children].map((child) => {
          const rect = child.getBoundingClientRect();
          return [Math.round(rect.width), Math.round(rect.height)];
        })
      });
      if (window.__glassFrames.length < 30) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await optics.goto('https://tc-apis.maimemo.com/webstudy/app?optics=1#/pages/home/index');
  await optics.waitForSelector('#glass-lens[data-mm-refraction="true"]');
  await optics.waitForFunction(() => window.__glassFrames.length >= 3);
  const initialFrames = await optics.evaluate(() => window.__glassFrames.slice(0, 3));
  for (const [index, frame] of initialFrames.entries()) {
    assert.equal(frame.children.length, 5, `frame ${index}: all decorative siblings must render`);
    for (const [width, height] of frame.children) {
      assert.ok(Math.abs(width - frame.host[0]) <= 1 && Math.abs(height - frame.host[1]) <= 1,
        `frame ${index}: glass must cover its ${frame.host.join('x')} host from the first visible frame, got ${width}x${height}`);
    }
  }
  assert.ok(await optics.locator('#glass-lens filter').first().getAttribute('id').then((id) => id.includes('mm-glass-')), 'filter IDs must not collide with the website React roots');
  await optics.waitForTimeout(100); // Allow the embedded SVG displacement image to decode.
  const lens = await optics.locator('#glass-lens').boundingBox();
  const label = await optics.locator('#optics-label').boundingBox();
  const refracted = readPNG(await optics.screenshot());
  await screenshot(optics, 'glass-optics-on.png');
  await optics.locator('#glass-lens').evaluate((node) => node.style.setProperty('--lg-refraction', 'blur(0px)'));
  const plain = readPNG(await optics.screenshot());
  await screenshot(optics, 'glass-optics-off.png');
  let moved = 0;
  let maxShift = 0;
  const y = Math.round(lens.y + 50);
  const edge = (image, boundary) => {
    let best = boundary, gradient = -1;
    for (let x = boundary - 13; x <= boundary + 13; x++) {
      const delta = Math.abs(red(image, x + 1, y) - red(image, x, y));
      if (delta > gradient) { gradient = delta; best = x; }
    }
    return best;
  };
  for (let x = Math.ceil((lens.x + 64) / 32) * 32; x < lens.x + lens.width - 64; x += 32) {
    const shift = Math.abs(edge(refracted, x) - edge(plain, x));
    if (shift >= 2) moved++;
    maxShift = Math.max(maxShift, shift);
  }
  assert.ok(moved >= 5 && maxShift >= 3, `glass must visibly bend background edges, not just tint or blur them: moved=${moved}, maxShift=${maxShift}`);
  assert.equal(equalRegion(refracted, plain, { x: label.x + 2, y: label.y + 2, width: label.width - 4, height: label.height - 4 }), true, 'the same foreground text pixels must stay sharp and unchanged');
  assert.equal(equalRegion(refracted, plain, { x: 0, y: 0, width: 1440, height: 80 }), true, 'refraction must stay inside its panel');
  assert.deepEqual(await optics.locator('#glass-lens').boundingBox(), lens, 'the optical effect must not move the panel');
  console.log(`Optical pixel regression passed: ${moved} background edges displaced, maximum ${maxShift}px; foreground and outside pixels unchanged.`);
  assert.deepEqual(errors, []);
  console.log(`Native Chromium ${context.browser().version()} extension test passed: generated manifest, CSP, local assets, real storage, live changes, injected styles/scripts, shortcuts and popup.`);
  console.log('Isolated temporary profile and locally fulfilled fixtures only; no real study submissions or existing browser profile access.');
} finally {
  await context?.close();
  if (dirname(profile) !== resolve(tmpdir()) || !basename(profile).startsWith('maimemo-extension-test-')) throw new Error('Unexpected temporary profile path');
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
