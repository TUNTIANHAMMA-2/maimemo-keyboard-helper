import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const versionFiles = ['package.json', 'package-lock.json', 'manifest.json', 'README.md', 'CHANGELOG.md', 'content/liquid-glass.js', 'docs/third-party-licenses.txt'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const save = (path, data) => writeFile(path, `${JSON.stringify(data, null, 2)}\n`);

export function parseVersion(value) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) throw new Error(`Invalid stable version: ${value}`);
  const parts = match.slice(1).map(Number);
  if (parts.some(n => !Number.isSafeInteger(n) || n > 65535)) throw new Error('Browser version component exceeds 65535');
  return parts;
}

export function compareVersions(left, right) {
  const a = parseVersion(left), b = parseVersion(right);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return Math.sign(a[i] - b[i]);
  return 0;
}

export function planRelease({ version, head, tags, currentRelease }) {
  parseVersion(version);
  if (tags[`v${version}`] === head) {
    return { version, shouldRelease: !currentRelease || currentRelease.draft, resume: true };
  }
  const versions = Object.keys(tags).filter(v => /^v\d+\.\d+\.\d+$/.test(v)).map(v => v.slice(1));
  const highest = versions.sort(compareVersions).at(-1);
  if (!highest || compareVersions(version, highest) > 0) return { version, shouldRelease: true, resume: false };
  const parts = parseVersion(compareVersions(version, highest) >= 0 ? version : highest);
  parts[2]++;
  const next = parts.join('.');
  parseVersion(next);
  return { version: next, shouldRelease: true, resume: false };
}

function gitRaw(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr}`);
  return result.stdout;
}
const git = (...args) => gitRaw(...args).trim();

export class GitHub {
  constructor(repository, token, request = fetch) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository');
    this.repository = repository;
    this.token = token;
    this.fetch = request;
    this.prefix = `/repos/${repository}`;
  }
  async api(method, path, body, optional = false) {
    if (method !== 'GET' && !this.token) throw new Error('GH_TOKEN is required for publication');
    const response = await this.fetch(`https://api.github.com${this.prefix}${path}`, {
      method, signal: AbortSignal.timeout(60000),
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (optional && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status} ${(await response.text()).slice(0, 1000)}`);
    return response.status === 204 ? null : response.json();
  }
  release(tag) { return this.api('GET', `/releases/tags/${tag}`, undefined, true); }
  latest() { return this.api('GET', '/releases/latest', undefined, true); }
  async create(tag, previousTag, commit) {
    const notes = await this.api('POST', '/releases/generate-notes', {
      tag_name: tag, target_commitish: commit, ...(previousTag ? { previous_tag_name: previousTag } : {})
    });
    return this.api('POST', '/releases', { tag_name: tag, target_commitish: commit,
      name: tag, body: notes.body, draft: true, prerelease: false });
  }
  removeAsset(id) { return this.api('DELETE', `/releases/assets/${id}`); }
  async upload(release, file) {
    const url = new URL(release.upload_url.replace(/\{.*$/, ''));
    if (url.hostname !== 'uploads.github.com' || !url.pathname.startsWith(`/repos/${this.repository}/releases/`)) throw new Error('Unexpected asset upload URL');
    url.searchParams.set('name', file.name);
    const response = await this.fetch(url, { method: 'POST', signal: AbortSignal.timeout(120000),
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/zip' }, body: file.data });
    if (!response.ok) throw new Error(`Asset upload ${file.name}: HTTP ${response.status}`);
    return response.json();
  }
  async matches(asset, file) {
    if (asset.size !== file.data.length) return false;
    if (asset.digest) return asset.digest === `sha256:${file.sha256}`;
    const response = await this.fetch(`https://api.github.com${this.prefix}/releases/assets/${asset.id}`, {
      signal: AbortSignal.timeout(60000),
      headers: { Accept: 'application/octet-stream', Authorization: `Bearer ${this.token}` }
    });
    if (!response.ok) throw new Error(`Asset verification: HTTP ${response.status}`);
    return sha256(Buffer.from(await response.arrayBuffer())) === file.sha256;
  }
  publish(id, latest) { return this.api('PATCH', `/releases/${id}`, { draft: false, make_latest: latest ? 'true' : 'false' }); }
}

export async function publishAssets(api, metadata, files, commit) {
  const tag = `v${metadata.version}`;
  let release = await api.release(tag);
  if (!release) release = await api.create(tag, metadata.previousTag, commit);
  for (const file of files) {
    const existing = release.assets.find(a => a.name === file.name);
    if (existing && await api.matches(existing, file)) continue;
    if (!release.draft) throw new Error(`Published asset is missing or differs: ${file.name}; refusing to replace it`);
    if (existing) await api.removeAsset(existing.id);
    await api.upload(release, file);
  }
  release = await api.release(tag);
  for (const file of files) {
    const asset = release.assets.find(a => a.name === file.name);
    if (!asset || !await api.matches(asset, file)) throw new Error(`Uploaded asset did not verify: ${file.name}`);
  }
  if (release.draft) {
    const latest = await api.latest();
    const newer = !latest || compareVersions(metadata.version, latest.tag_name) >= 0;
    release = await api.publish(release.id, newer);
  }
  if (release.draft) throw new Error('Release is still a draft');
  return release.html_url;
}

export async function updateVersionFiles(directory, version, repository, previousTag, date) {
  parseVersion(version);
  const names = ['manifest.json', 'package.json', 'package-lock.json'];
  const texts = await Promise.all(names.map(n => readFile(resolve(directory, n), 'utf8')));
  const objects = texts.map(JSON.parse);
  const old = objects[0].version;
  if (objects.some(o => o.version !== old) || objects[2].packages?.['']?.version !== old) throw new Error('Source version fields are inconsistent');
  for (let i = 0; i < 2; i++) {
    const replaced = texts[i].replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);
    if (JSON.parse(replaced).version !== version) throw new Error(`Cannot update root version in ${names[i]}`);
    await writeFile(resolve(directory, names[i]), replaced);
  }
  objects[2].version = version;
  objects[2].packages[''].version = version;
  await save(resolve(directory, names[2]), objects[2]);
  const readmePath = resolve(directory, 'README.md');
  let readme = await readFile(readmePath, 'utf8');
  readme = readme.replace(/^## \d+\.\d+\.\d+ 浏览器版本/m, `## ${version} 浏览器版本`)
    .replace(/maimemo-keyboard-helper-(firefox|chromium)-\d+\.\d+\.\d+\.zip/g, `maimemo-keyboard-helper-$1-${version}.zip`);
  await writeFile(readmePath, readme);
  const changelogPath = resolve(directory, 'CHANGELOG.md');
  const changelog = await readFile(changelogPath, 'utf8');
  if (!changelog.split(/\r?\n/).some(line => line.startsWith(`## ${version} `))) {
    const firstNewline = changelog.indexOf('\n');
    const entry = `\n## ${version} — ${date}\n\n- 本次合并的修复与改动见 [发布说明](https://github.com/${repository}/releases/tag/v${version})。\n`;
    await writeFile(changelogPath, changelog.slice(0, firstNewline + 1) + entry + '\n' + changelog.slice(firstNewline + 1).trimStart());
  }
}

async function prepare(directory, api) {
  const pkg = await json(resolve(root, 'package.json'));
  const head = git('rev-parse', 'HEAD');
  const tags = {};
  for (const tag of git('tag', '--list', 'v*').split('\n').filter(v => /^v\d+\.\d+\.\d+$/.test(v))) tags[tag] = git('rev-parse', `${tag}^{commit}`);
  const currentRelease = tags[`v${pkg.version}`] === head ? await api.release(`v${pkg.version}`) : null;
  const plan = planRelease({ version: pkg.version, head, tags, currentRelease });
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,
    `should_release=${plan.shouldRelease}\nversion=${plan.version}\nsource_sha=${head}\n`);
  if (!plan.shouldRelease) {
    console.log(`Already published: v${plan.version}`);
    return;
  }
  const latest = await api.latest();
  const previousTag = latest?.tag_name ?? null;
  if (!plan.resume) {
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Hong_Kong' }).format(new Date());
    await updateVersionFiles(root, plan.version, api.repository, previousTag, date);
  }
  await mkdir(directory, { recursive: true });
  await save(resolve(directory, 'metadata.json'), { ...plan, sourceSha: head, previousTag, repository: api.repository });
  console.log(`Prepared v${plan.version} from ${head}`);
}

async function bundle(directory) {
  const metadata = await json(resolve(directory, 'metadata.json'));
  if (git('rev-parse', 'HEAD') !== metadata.sourceSha) throw new Error('Source commit changed during validation');
  const changed = git('diff', '--name-only').split('\n').filter(Boolean);
  if (changed.some(p => !versionFiles.includes(p)) || git('ls-files', '--others', '--exclude-standard')) throw new Error('Unexpected source changes during validation');
  git('add', '--', ...versionFiles);
  const patch = gitRaw('diff', '--cached', '--binary');
  await writeFile(resolve(directory, 'version.patch'), patch);
  metadata.treeSha = git('write-tree');
  metadata.patchSha256 = sha256(await readFile(resolve(directory, 'version.patch')));
  metadata.assets = [];
  for (const target of ['firefox', 'chromium']) {
    const name = `maimemo-keyboard-helper-${target}-${metadata.version}.zip`;
    const data = await readFile(resolve(directory, name));
    metadata.assets.push({ name, bytes: data.length, sha256: sha256(data) });
  }
  await save(resolve(directory, 'metadata.json'), metadata);
}

async function publish(directory, api) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Publishing is restricted to the GitHub Actions runner');
  const metadata = await json(resolve(directory, 'metadata.json'));
  parseVersion(metadata.version);
  if (metadata.repository !== api.repository || git('rev-parse', 'HEAD') !== metadata.sourceSha) throw new Error('Artifact source/repository mismatch');
  const files = [];
  for (const target of ['firefox', 'chromium']) {
    const name = `maimemo-keyboard-helper-${target}-${metadata.version}.zip`;
    const info = metadata.assets.find(a => a.name === name);
    const data = await readFile(resolve(directory, name));
    if (!info || info.bytes !== data.length || info.sha256 !== sha256(data)) throw new Error(`Artifact checksum mismatch: ${name}`);
    files.push({ name, data, sha256: info.sha256 });
  }
  const patchPath = resolve(directory, 'version.patch');
  const patch = await readFile(patchPath);
  if (sha256(patch) !== metadata.patchSha256) throw new Error('Version patch checksum mismatch');
  if (patch.length) git('apply', '--index', patchPath);
  const changed = git('diff', '--cached', '--name-only').split('\n').filter(Boolean);
  if (changed.some(p => !versionFiles.includes(p)) || git('write-tree') !== metadata.treeSha) throw new Error('Validated source tree mismatch');
  git('fetch', 'origin', 'main', '--tags');
  const tag = `v${metadata.version}`;
  const tagExists = git('tag', '--list', tag) === tag;
  if (tagExists) {
    const target = git('rev-parse', `${tag}^{commit}`);
    if (git('rev-parse', `${tag}^{tree}`) !== metadata.treeSha) throw new Error('Existing tag has a different source tree');
    if (target !== metadata.sourceSha && git('rev-parse', `${target}^`) !== metadata.sourceSha) throw new Error('Existing tag has a different source parent');
    git('switch', '--detach', target);
  } else {
    if (git('rev-parse', 'origin/main') !== metadata.sourceSha) throw new Error('main advanced during validation; rerun this workflow on latest main');
    if (changed.length) git('-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
      'commit', '-m', `chore(release): ${tag} [skip ci]`);
    git('tag', '-a', tag, '-m', `Release ${tag}`);
  }
  const commit = git('rev-parse', 'HEAD');
  git('diff', '--exit-code');
  git('diff', '--cached', '--exit-code');
  const remoteMain = git('rev-parse', 'origin/main');
  const alreadyOnMain = spawnSync('git', ['merge-base', '--is-ancestor', commit, remoteMain], { cwd: root }).status === 0;
  if (!tagExists || !alreadyOnMain) {
    if (!alreadyOnMain && remoteMain !== metadata.sourceSha) throw new Error('main changed before publishing; refusing a non-fast-forward update');
    git('-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', '--atomic', 'origin',
      ...(!alreadyOnMain ? ['HEAD:refs/heads/main'] : []), `refs/tags/${tag}`);
  }
  const url = await publishAssets(api, metadata, files, commit);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `## Published ${tag}\n\n${url}\n\nBoth browser ZIPs were tested, uploaded and verified by SHA-256.\n`);
  console.log(url);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, destination] = process.argv.slice(2);
  if (!['prepare', 'bundle', 'publish'].includes(command) || !destination) throw new Error('Usage: node scripts/release.mjs prepare|bundle|publish <payload-directory>');
  const api = new GitHub(process.env.GITHUB_REPOSITORY ?? 'TUNTIANHAMMA-2/maimemo-keyboard-helper', process.env.GH_TOKEN);
  const directory = resolve(destination);
  if (command === 'prepare') await prepare(directory, api);
  else if (command === 'bundle') await bundle(directory);
  else await publish(directory, api);
}
