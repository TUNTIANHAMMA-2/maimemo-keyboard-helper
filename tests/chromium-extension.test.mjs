import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const modulePath = process.env.MAIMEMO_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const project = fileURLToPath(new URL('../', import.meta.url));
const extension = resolve(project, 'dist/chromium');
const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
const html = await readFile(resolve(project, 'tests/fixtures/study.html'), 'utf8');
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
  await context.route('https://tc-apis.maimemo.com/**', (route) => route.fulfill({ contentType: 'text/html', body: html }));
  const study = await context.newPage();
  await study.goto('https://tc-apis.maimemo.com/webstudy/app#/pages/home/index');
  await study.waitForSelector('#mm-study-toolbar .glass__warp');
  await study.waitForFunction(() => document.querySelector('#mm-brand-logo')?.naturalWidth === 184);
  assert.equal(await study.getAttribute('html', 'data-mm-theme'), 'light');
  await study.keyboard.press('Space');
  await study.waitForSelector('[data-mm-action="familiar"]');
  await study.waitForSelector('#mm-memory-history');
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
  await study.waitForFunction(() => document.querySelector('[data-mm-action="familiar"]')?.getAttribute('aria-label').includes('Q'));
  await screenshot(study, 'chromium-extension-dark.png');
  await study.keyboard.press('q');
  assert.equal(await study.evaluate(() => window.__fixture.counts.familiar), 2, 'native storage.onChanged must update content-script bindings');
  await study.locator('#typing').evaluate((input) => input.classList.remove('hidden'));
  await study.locator('#typing').press('q');
  assert.equal(await study.locator('#typing').inputValue(), 'q');
  assert.equal(await study.evaluate(() => window.__fixture.counts.familiar), 2);

  const popup = await context.newPage();
  await popup.goto(`${origin}/popup/popup.html`);
  await popup.waitForFunction(() => !document.querySelector('#enabled').disabled);
  assert.equal(await popup.getAttribute('html', 'data-theme'), 'dark');
  await popup.locator('#enabled').uncheck();
  await popup.waitForFunction(() => document.querySelector('#status').textContent.includes('已保存'));
  assert.equal((await stored(popup)).enabled, false);
  assert.equal((await stored(popup)).shortcuts.familiar, 'Q');
  await options.close();
  const opened = context.waitForEvent('page');
  await popup.locator('#open-options').click();
  const reopened = await opened;
  await reopened.waitForURL(`${origin}/options/options.html`);
  await reopened.waitForFunction(() => !document.querySelector('#save').disabled);
  assert.equal(await reopened.locator('#shortcut-familiar').inputValue(), 'Q');
  assert.deepEqual(errors, []);
  console.log(`Native Chromium ${context.browser().version()} extension test passed: generated manifest, CSP, local assets, real storage, live changes, injected styles/scripts, shortcuts and popup.`);
  console.log('Isolated temporary profile and locally fulfilled fixtures only; no real study submissions or existing browser profile access.');
} finally {
  await context?.close();
  if (dirname(profile) !== resolve(tmpdir()) || !basename(profile).startsWith('maimemo-extension-test-')) throw new Error('Unexpected temporary profile path');
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
