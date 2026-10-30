import { cp, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const targets = Object.freeze(['firefox', 'chromium']);
const distRoot = resolve(projectRoot, 'dist');
const runtimeEntries = ['assets', 'core', 'content', 'options', 'popup', 'README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'docs'];

export function targetManifest(source, target) {
  if (!targets.includes(target)) throw new Error(`Unknown browser target: ${target}`);
  const manifest = structuredClone(source);
  if (target === 'chromium') {
    delete manifest.browser_specific_settings;
    manifest.minimum_chrome_version = '120';
  }
  return manifest;
}

export function selectedTargets(target = 'all') {
  if (target === 'all') return [...targets];
  if (!targets.includes(target)) throw new Error('--target must be firefox, chromium or all');
  return [target];
}

export async function buildExtensions(target = 'all') {
  const selected = selectedTargets(target);
  const manifest = JSON.parse(await readFile(resolve(projectRoot, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));
  if (manifest.version !== pkg.version) throw new Error('package.json and manifest.json versions differ');
  await mkdir(distRoot, { recursive: true });
  if ((await lstat(distRoot)).isSymbolicLink()) throw new Error('dist must not be a symbolic link');
  const builds = [];
  for (const name of selected) {
    const directory = resolve(distRoot, name);
    // Only these generated browser directories may ever be cleared.
    if (dirname(directory) !== distRoot || !targets.includes(name)) throw new Error('Unexpected build directory');
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory);
    for (const entry of runtimeEntries) await cp(resolve(projectRoot, entry), resolve(directory, entry), { recursive: true });
    await writeFile(resolve(directory, 'manifest.json'), `${JSON.stringify(targetManifest(manifest, name), null, 2)}\n`);
    builds.push({ target: name, directory, version: pkg.version });
    console.log(`built ${name}: ${directory}`);
  }
  return builds;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { target: { type: 'string', default: 'all' } } });
  await buildExtensions(values.target);
}
