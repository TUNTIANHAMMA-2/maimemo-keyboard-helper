import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { crc32, deflateRawSync } from 'node:zlib';
import { buildExtensions, projectRoot } from './build-extension.mjs';

const { values } = parseArgs({ options: {
  target: { type: 'string', default: 'all' },
  'output-dir': { type: 'string', default: resolve(projectRoot, 'releases') }
} });
const outputDir = resolve(values['output-dir']);
const dist = resolve(projectRoot, 'dist').toLowerCase();
if (outputDir.toLowerCase() === dist || outputDir.toLowerCase().startsWith(`${dist}${sep}`)) {
  throw new Error('ZIP output must be outside the generated dist directory');
}

async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`;
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Cannot package a symbolic link: ${name}`);
    if (entry.isDirectory()) result.push(...await files(path, `${name}/`));
    else if (entry.isFile()) result.push({ name, data: await readFile(path) });
  }
  return result;
}

// ZIP32 using Node's CRC-32 and raw DEFLATE; no platform shell or extra ZIP dependency.
function zip(entries) {
  if (entries.length > 65535) throw new Error('Too many ZIP entries');
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const compressed = deflateRawSync(data, { level: 9 });
    if (name.length > 65535 || data.length > 0xffffffff || compressed.length > 0xffffffff) throw new Error('ZIP32 entry limit exceeded');
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6); // UTF-8 filenames.
    local.writeUInt16LE(8, 8); // DEFLATE.
    local.writeUInt16LE(0x21, 12); // Stable DOS date: 1980-01-01.
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    localRecords.push(local, name, compressed);
    centralRecords.push(central, name);
    offset += local.length + name.length + compressed.length;
    if (offset > 0xffffffff) throw new Error('ZIP32 size limit exceeded');
  }
  const central = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localRecords, central, end]);
}

const builds = await buildExtensions(values.target);
await mkdir(outputDir, { recursive: true });
for (const build of builds) {
  const data = zip(await files(build.directory));
  const output = resolve(outputDir, `maimemo-keyboard-helper-${build.target}-${build.version}.zip`);
  await writeFile(output, data);
  console.log(`created ${output} (${data.length} bytes)`);
}
