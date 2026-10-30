import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const sources = ['core/shortcut-utils.js', 'core/settings.js', 'content/maimemo-shortcuts.js']
  .map((file) => readFileSync(new URL(file, root), 'utf8'));

class Element {
  constructor(text = '', classes = [], editable = false) {
    this.textContent = text;
    this.childElementCount = 0;
    this.classList = { contains: (name) => classes.includes(name) };
    this.isContentEditable = editable;
    this.editable = editable;
    this.clicks = 0;
    this.hidden = false;
  }
  matches() { return this.editable; }
  hasAttribute() { return false; }
  getAttribute() { return null; }
  closest() { return this.editable ? this : null; }
  getBoundingClientRect() { return { width: this.hidden ? 0 : 100, height: 40 }; }
  click() { this.clicks++; }
}

async function createPage(initialSettings) {
  const document = new EventTarget();
  const window = new EventTarget();
  const reveal = new Element('点击屏幕显示答案');
  const familiar = new Element('认识\n54 天后', ['reset-button']);
  const vague = new Element('模糊\n今日 / 4 天后', ['reset-button']);
  const forget = new Element('忘记\n今日 / 3 天后', ['reset-button']);
  const wellFamiliar = new Element();
  const controls = { reveal, familiar, vague, forget, wellFamiliar };
  const rootElement = new Element();
  document.documentElement = rootElement;
  document.querySelector = (selector) => ({
    '.rev-root': rootElement,
    '.rev-shortcut:not(#rev-top-menu)': wellFamiliar,
    '.rev-resp-btns': rootElement,
    '.rev-recall-mask-partial': reveal
  })[selector] ?? null;
  document.querySelectorAll = (selector) => selector === '*'
    ? [reveal] : [familiar, vague, forget];
  let storageListener;
  const context = {
    document, window, Element, structuredClone,
    location: { href: 'https://tc-apis.maimemo.com/webstudy/app#/pages/home/index', hash: '#/pages/home/index' },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    MutationObserver: class { observe() {} },
    browser: { storage: {
      local: { get: async () => ({ maimemoKeyboardSettings: initialSettings }) },
      onChanged: { addListener: (listener) => { storageListener = listener; } }
    } }
  };
  for (const source of sources) vm.runInNewContext(source, context);
  await new Promise(setImmediate);
  const nativeEvents = [];
  for (const type of ['keydown', 'keyup']) {
    document.addEventListener(type, (event) => nativeEvents.push(`${type}:${event.key}`));
  }
  function dispatch(type, key, { target = rootElement, code = key, repeat = false, ...extra } = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { key, code, repeat, ...extra });
    Object.defineProperty(event, 'target', { value: target });
    event.composedPath = () => [target, document, window];
    document.dispatchEvent(event);
    return event;
  }
  function press(key, options) {
    const down = dispatch('keydown', key, options);
    const up = dispatch('keyup', key, options);
    return { down, up };
  }
  return { controls, document, window, context, press, dispatch, nativeEvents,
    settings: (newValue) => storageListener({ maimemoKeyboardSettings: { newValue } }, 'local') };
}

const page = await createPage({ shortcuts: { reveal: ' ' } });
for (const [key, action] of [[' ', 'reveal'], ['1', 'familiar'], ['2', 'vague'], ['3', 'forget'], ['4', 'wellFamiliar']]) {
  const { down, up } = page.press(key);
  assert.equal(page.controls[action].clicks, 1, `${action} must click its visible control once`);
  assert.ok(down.defaultPrevented && up.defaultPrevented, 'both halves must suppress native shortcuts');
}
assert.deepEqual(page.nativeEvents, [], 'site handlers must not run for claimed shortcuts');

page.settings({ shortcuts: { familiar: 'q' } });
page.dispatch('keydown', 'q', { code: 'KeyQ' });
page.dispatch('keydown', 'q', { code: 'KeyQ', repeat: true });
page.dispatch('keyup', 'q', { code: 'KeyQ' });
assert.equal(page.controls.familiar.clicks, 2, 'holding a key must submit only once');
assert.deepEqual(page.nativeEvents, [], 'custom letters must not enter the site spelling mode');

const input = new Element('', [], true);
page.press('q', { code: 'KeyQ', target: input });
assert.equal(page.controls.familiar.clicks, 2, 'typing must not click a feedback control');
assert.deepEqual(page.nativeEvents.splice(0), ['keydown:q', 'keyup:q']);

page.settings({ enabled: false, shortcuts: { familiar: 'q' } });
page.press('q');
assert.equal(page.controls.familiar.clicks, 2, 'disabled helper must not act');
assert.deepEqual(page.nativeEvents.splice(0), ['keydown:q', 'keyup:q']);

page.settings({ shortcuts: { familiar: 'Ctrl+q' } });
page.press('q', { ctrlKey: false });
assert.equal(page.controls.familiar.clicks, 2, 'modifier must match exactly');
page.nativeEvents.splice(0);
page.press('q', { code: 'KeyQ', ctrlKey: true });
assert.equal(page.controls.familiar.clicks, 3);
assert.deepEqual(page.nativeEvents, []);

page.controls.familiar.hidden = true;
page.press('q', { ctrlKey: true });
assert.equal(page.controls.familiar.clicks, 3, 'hidden feedback must never be clicked');
assert.deepEqual(page.nativeEvents, [], 'configured letters remain claimed when feedback is unavailable');

page.controls.familiar.hidden = false;
page.dispatch('keydown', 'q', { code: 'KeyQ', ctrlKey: true });
page.window.dispatchEvent(new Event('blur'));
page.press('q', { code: 'KeyQ', ctrlKey: true });
assert.equal(page.controls.familiar.clicks, 5, 'blur must clear pressed-key state');

page.press('q', { ctrlKey: true, isComposing: true });
assert.equal(page.controls.familiar.clicks, 5, 'IME composition must be left alone');

page.nativeEvents.splice(0);
page.context.location.hash = '#/pages/search/index';
page.press('q', { ctrlKey: true });
assert.equal(page.controls.familiar.clicks, 5, 'a cached study DOM must not activate shortcuts on other routes');
assert.deepEqual(page.nativeEvents, ['keydown:q', 'keyup:q']);

console.log('content-shortcuts behavior tests passed');
