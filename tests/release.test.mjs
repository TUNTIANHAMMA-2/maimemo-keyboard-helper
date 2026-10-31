import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { GitHub, parseVersion, compareVersions, planRelease, publishAssets, updateVersionFiles } from '../scripts/release.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
const fixtureFile = target => {
  const data = Buffer.from(`test ${target} ZIP payload`);
  return { name: `maimemo-keyboard-helper-${target}-0.3.5.zip`, data, sha256: hash(data) };
};

test('version ordering, automatic patch and explicit version bump', () => {
  assert.deepEqual(parseVersion('v0.3.5'), [0, 3, 5]);
  assert.ok(compareVersions('0.3.10', '0.3.9') > 0);
  for (const bad of ['0.03.5', '0.3.5-beta', '0.3', '0.3.65536', '../main']) assert.throws(() => parseVersion(bad));
  assert.equal(planRelease({ version: '0.3.4', head: 'merge', tags: { 'v0.3.4': 'old' } }).version, '0.3.5');
  assert.equal(planRelease({ version: '0.4.0', head: 'merge', tags: { 'v0.3.4': 'old' } }).version, '0.4.0');
  assert.equal(planRelease({ version: '0.3.4', head: 'merge', tags: { 'v0.3.5': 'old' } }).version, '0.3.6');
});

test('rerun resumes an unpublished tag and skips a published tag without another bump', () => {
  const input = { version: '0.3.5', head: 'release', tags: { 'v0.3.5': 'release' } };
  assert.deepEqual(planRelease(input), { version: '0.3.5', shouldRelease: true, resume: true });
  assert.equal(planRelease({ ...input, currentRelease: { draft: true } }).shouldRelease, true);
  assert.equal(planRelease({ ...input, currentRelease: { draft: false } }).shouldRelease, false);
});

test('all runtime versions and current README links change while history and dependencies stay intact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'maimemo-release-test-'));
  try {
    const manifest = { name: 'Fixture', version: '0.3.4', permissions: ['storage'] };
    const pkg = { name: 'fixture', version: '0.3.4', dependencies: { example: '0.3.4' } };
    const lock = { version: '0.3.4', packages: { '': { version: '0.3.4' }, 'node_modules/example': { version: '0.3.4' } } };
    for (const [name, object] of [['manifest.json', manifest], ['package.json', pkg], ['package-lock.json', lock]]) {
      await writeFile(join(directory, name), JSON.stringify(object, null, 2) + '\n');
    }
    await writeFile(join(directory, 'README.md'), '## 0.3.4 浏览器版本\nmaimemo-keyboard-helper-firefox-0.3.4.zip\n0.3.4 历史说明\n');
    await writeFile(join(directory, 'CHANGELOG.md'), '# 版本记录\n\n## 0.3.4 — 2026-10-31\n\n原记录\n');
    await updateVersionFiles(directory, '0.3.5', 'owner/repo', 'v0.3.4', '2026-11-01');
    const read = async name => JSON.parse(await readFile(join(directory, name), 'utf8'));
    assert.deepEqual(await read('manifest.json'), { ...manifest, version: '0.3.5' });
    assert.deepEqual(await read('package.json'), { ...pkg, version: '0.3.5' });
    const result = await read('package-lock.json');
    assert.equal(result.version, '0.3.5');
    assert.equal(result.packages[''].version, '0.3.5');
    assert.equal(result.packages['node_modules/example'].version, '0.3.4');
    const readme = await readFile(join(directory, 'README.md'), 'utf8');
    assert.match(readme, /## 0\.3\.5 浏览器版本/);
    assert.match(readme, /firefox-0\.3\.5\.zip/);
    assert.match(readme, /0\.3\.4 历史说明/);
    assert.match(await readFile(join(directory, 'CHANGELOG.md'), 'utf8'), /## 0\.3\.5[\s\S]*## 0\.3\.4[\s\S]*原记录/);
  } finally {
    if (dirname(directory) !== resolve(tmpdir()) || !basename(directory).startsWith('maimemo-release-test-')) throw new Error('Unexpected temporary fixture');
    await rm(directory, { recursive: true, force: true });
  }
});

class FakeGitHub {
  constructor() { this.value = null; this.events = []; this.failSecondUpload = false; this.latestVersion = 'v0.3.4'; }
  async release() { return this.value; }
  async getRelease() { return this.value; }
  async latest() { return { tag_name: this.latestVersion }; }
  async create() { this.events.push('create'); return this.value = { id: 1, draft: true, assets: [], html_url: 'release-url' }; }
  async matches(asset, file) { return asset.digest === `sha256:${file.sha256}` && asset.size === file.data.length; }
  async removeAsset(id) { this.events.push('remove'); this.value.assets = this.value.assets.filter(a => a.id !== id); }
  async upload(release, file) {
    if (this.failSecondUpload && this.value.assets.length === 1) throw new Error('Interrupted upload');
    this.events.push(`upload:${file.name}`);
    this.value.assets.push({ id: this.events.length, name: file.name, size: file.data.length, digest: `sha256:${file.sha256}` });
  }
  async publish(id, latest) { this.events.push(`publish:${latest}`); this.value.draft = false; return this.value; }
}

test('draft is published only after both browser assets verify', async () => {
  const api = new FakeGitHub();
  const files = [fixtureFile('firefox'), fixtureFile('chromium')];
  assert.equal(await publishAssets(api, { version: '0.3.5' }, files, 'commit'), 'release-url');
  assert.equal(api.value.assets.length, 2);
  assert.equal(api.events.at(-1), 'publish:true');
  const before = [...api.events];
  await publishAssets(api, { version: '0.3.5' }, files, 'commit');
  assert.deepEqual(api.events, before, 'rerun must not duplicate or replace a published release');
});

test('partial upload keeps the release private and retry reuses the first asset', async () => {
  const api = new FakeGitHub();
  const files = [fixtureFile('firefox'), fixtureFile('chromium')];
  api.failSecondUpload = true;
  await assert.rejects(publishAssets(api, { version: '0.3.5' }, files, 'commit'), /Interrupted/);
  assert.equal(api.value.draft, true);
  assert.equal(api.value.assets.length, 1);
  api.failSecondUpload = false;
  await publishAssets(api, { version: '0.3.5' }, files, 'commit');
  assert.equal(api.events.filter(e => e.startsWith('upload:')).length, 2);
  assert.equal(api.events.filter(e => e === 'create').length, 1);
});

test('published assets cannot be silently replaced and an older retry cannot become latest', async () => {
  const api = new FakeGitHub();
  const files = [fixtureFile('firefox'), fixtureFile('chromium')];
  api.latestVersion = 'v0.3.6';
  await publishAssets(api, { version: '0.3.5' }, files, 'commit');
  assert.equal(api.events.at(-1), 'publish:false');
  api.value.assets[0].digest = 'sha256:unexpected';
  await assert.rejects(publishAssets(api, { version: '0.3.5' }, files, 'commit'), /refusing to replace/);
  assert.equal(api.events.includes('remove'), false);
});

test('only an actual 404 is optional and writes require a token', async () => {
  const missing = new GitHub('owner/repo', undefined, async url => new URL(url).pathname.includes('/releases/tags/')
    ? new Response('', { status: 404 }) : Response.json([]));
  assert.equal(await missing.release('v0.3.5'), null);
  await assert.rejects(missing.publish(1, true), /GH_TOKEN/);
  const outage = new GitHub('owner/repo', 'test-only', async () => new Response('outage', { status: 503 }));
  await assert.rejects(outage.release('v0.3.5'), /HTTP 503/);
});

test('new and resumed drafts publish through their ID when the tag endpoint returns 404', async () => {
  const files = [fixtureFile('firefox'), fixtureFile('chromium')];
  const asset = file => ({ id: file.name, name: file.name, size: file.data.length, digest: `sha256:${file.sha256}` });
  for (const resume of [false, true]) {
    const draft = () => ({ id: 42, tag_name: 'v0.3.5', draft: true, assets: [], html_url: 'release-url',
      upload_url: 'https://uploads.github.com/repos/owner/repo/releases/42/assets{?name,label}' });
    let value = resume ? { ...draft(), assets: [asset(files[0])] } : null;
    let created = 0, readsByID = 0, uploads = 0;
    const api = new GitHub('owner/repo', 'test-only', async (input, options) => {
      const url = new URL(input);
      const path = url.pathname.replace('/repos/owner/repo', '');
      if (options.method === 'GET' && path.startsWith('/releases/tags/')) return new Response('', { status: 404 });
      if (options.method === 'GET' && path === '/releases') return Response.json(value ? [value] : []);
      if (options.method === 'GET' && path === '/releases/latest') return Response.json({ tag_name: 'v0.3.4' });
      if (options.method === 'GET' && path === '/releases/42') { readsByID++; return Response.json(value); }
      if (options.method === 'POST' && path === '/releases/generate-notes') return Response.json({ body: 'notes' });
      if (options.method === 'POST' && path === '/releases') { created++; value = draft(); return Response.json(value); }
      if (options.method === 'POST' && path === '/releases/42/assets') {
        const file = files.find(file => file.name === url.searchParams.get('name'));
        assert.deepEqual(options.body, file.data);
        const uploaded = asset(file);
        value.assets.push(uploaded);
        uploads++;
        return Response.json(uploaded);
      }
      if (options.method === 'PATCH' && path === '/releases/42') {
        assert.equal(value.assets.length, 2, 'both assets must exist before publishing');
        value.draft = false;
        return Response.json(value);
      }
      assert.fail(`Unexpected API call: ${options.method} ${url}`);
    });
    assert.equal(await publishAssets(api, { version: '0.3.5' }, files, 'commit'), 'release-url');
    assert.equal(created, resume ? 0 : 1);
    assert.equal(uploads, resume ? 1 : 2);
    assert.equal(readsByID, 1);
    assert.equal(value.draft, false);
  }
});
