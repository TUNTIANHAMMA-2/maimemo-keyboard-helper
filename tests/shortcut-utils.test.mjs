import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'core', 'shortcut-utils.js'), 'utf8');
const context = { console };
vm.runInNewContext(source, context, { filename: 'core/shortcut-utils.js' });
const rawUtils = context.MaimemoShortcutUtils;
const utils = {
  ...rawUtils,
  findDuplicateShortcuts: (...args) => JSON.parse(JSON.stringify(rawUtils.findDuplicateShortcuts(...args)))
};

assert.ok(utils, 'shortcut utility API should be exposed');

assert.equal(utils.normalizeKey(' '), 'Space');
assert.equal(utils.normalizeKey('Spacebar'), 'Space');
assert.equal(utils.normalizeKey('q'), 'q');
assert.equal(utils.normalizeKey('Q'), 'q');
assert.equal(utils.normalizeKey('Esc'), 'Escape');

assert.equal(utils.canonicalizeShortcut('ctrl+alt+q'), 'Ctrl+Alt+Q');
assert.equal(utils.canonicalizeShortcut(' Shift + space '), 'Shift+Space');
assert.equal(utils.canonicalizeShortcut(''), '');

const altQ = { key: 'q', altKey: true, ctrlKey: false, shiftKey: false, metaKey: false };
assert.equal(utils.matchShortcut(altQ, 'Alt+Q'), true);
assert.equal(utils.matchShortcut({ ...altQ, altKey: false }, 'Alt+Q'), false);
assert.equal(utils.matchShortcut({ key: 'Q', altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }, 'Alt+Q'), true);
assert.equal(utils.matchShortcut({ key: ' ', altKey: false, ctrlKey: false, shiftKey: false, metaKey: false }, 'Space'), true);

assert.deepEqual(utils.formatEventShortcut({ key: 'r', altKey: true, ctrlKey: false, shiftKey: true, metaKey: false }), 'Alt+Shift+R');
assert.equal(utils.formatEventShortcut({ key: 'Alt', altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }), null);

const duplicates = utils.findDuplicateShortcuts({ reveal: 'Space', familiar: 'Q', vague: 'q', forget: 'E' });
assert.deepEqual(duplicates, [['familiar', 'vague']]);
assert.deepEqual(utils.findDuplicateShortcuts({ reveal: 'Space', familiar: 'Q', vague: 'W' }), []);

assert.equal(utils.siteShortcutKey('reveal'), ' ');
assert.equal(utils.siteShortcutKey('familiar'), '1');
assert.equal(utils.siteShortcutKey('vague'), '2');
assert.equal(utils.siteShortcutKey('forget'), '3');
assert.equal(utils.siteShortcutKey('wellFamiliar'), '4');

console.log('shortcut-utils tests passed');
