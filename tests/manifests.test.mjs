import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { targetManifest, selectedTargets } from '../scripts/build-extension.mjs';

const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const original = JSON.stringify(manifest);
const firefox = targetManifest(manifest, 'firefox');
const chromium = targetManifest(manifest, 'chromium');
assert.equal(manifest.version, pkg.version);
assert.equal(firefox.browser_specific_settings.gecko.id, 'maimemo-keyboard-helper@local', 'Firefox updates must keep the existing extension identity');
assert.equal(chromium.browser_specific_settings, undefined, 'Chromium must not receive Gecko-only metadata');
assert.equal(chromium.minimum_chrome_version, '120');
for (const name of ['permissions', 'host_permissions', 'content_scripts', 'web_accessible_resources', 'action', 'options_ui']) {
  assert.deepEqual(chromium[name], firefox[name], `browser variants must retain the same ${name}`);
}
assert.deepEqual(chromium.permissions, ['storage']);
assert.equal(JSON.stringify(manifest), original, 'generating one variant must not mutate the source or another variant');
assert.deepEqual(selectedTargets(), ['firefox', 'chromium']);
assert.deepEqual(selectedTargets('chromium'), ['chromium']);
assert.throws(() => selectedTargets('../../outside'));
assert.throws(() => targetManifest(manifest, 'unknown'));
for (const target of [firefox, chromium]) {
  for (const file of [...target.content_scripts.flatMap((entry) => [...entry.js, ...entry.css]), target.action.default_popup, target.options_ui.page]) {
    await readFile(new URL(`../${file}`, import.meta.url));
  }
}
console.log('Firefox/Zen and Chrome/Edge manifest compatibility and permission tests passed');
