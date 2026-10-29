import { mkdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, '..', 'outputs', 'maimemo-keyboard-helper-0.1.0.zip');
await mkdir(resolve(root, '..', 'outputs'), { recursive: true });
await rm(output, { force: true });

const script = [
  '$ErrorActionPreference = "Stop"',
  '$root = $env:MM_ROOT',
  '$output = $env:MM_OUTPUT',
  '$stage = Join-Path $env:TEMP ("maimemo-keyboard-helper-" + [guid]::NewGuid().ToString())',
  'New-Item -ItemType Directory -Path $stage -Force | Out-Null',
  'try {',
  '  Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object { $_.FullName -notmatch "\\\\.git(\\\\|$)" -and $_.FullName -notmatch "\\\\outputs(\\\\|$)" } | ForEach-Object {',
  '    $relative = $_.FullName.Substring($root.Length).TrimStart("\\")',
  '    $destination = Join-Path $stage $relative',
  '    New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null',
  '    Copy-Item -LiteralPath $_.FullName -Destination $destination -Force',
  '  }',
  '  Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $output -Force',
  '} finally { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }'
].join('; ');
const args = ['-NoProfile', '-NonInteractive', '-Command', script];
await new Promise((resolvePromise, reject) => {
  const child = spawn('powershell.exe', args, {
    cwd: root,
    env: { ...process.env, MM_ROOT: root, MM_OUTPUT: output },
    stdio: ['ignore', 'inherit', 'inherit']
  });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolvePromise() : reject(new Error(`PowerShell zip exited ${code}`)));
});
const info = await stat(output);
console.log(`created ${output} (${info.size} bytes)`);