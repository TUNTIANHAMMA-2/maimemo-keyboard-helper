import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const directory = resolve(process.env.RUNNER_TEMP ?? process.env.TEMP ?? '.', 'maimemo-browser-logs');
mkdirSync(directory, { recursive: true });
for (const task of ['test:browser', 'test:browser:chromium', 'test:extension']) {
  let passed = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const windows = process.platform === 'win32';
    const executable = windows ? process.execPath : 'npm';
    const args = windows
      ? [process.env.npm_execpath ?? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), 'run', task]
      : ['run', task];
    const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 180000 });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`;
    writeFileSync(resolve(directory, `${task.replaceAll(':', '-')}-${attempt}.log`), output);
    process.stdout.write(output);
    if (result.status === 0 && !result.error) {
      passed = true;
      if (attempt > 1 && process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${task}: first attempt failed, second passed; both logs are printed in the run.\n`);
      }
      break;
    }
    console.error(`Browser check ${task}, attempt ${attempt}/2 failed.`);
  }
  if (!passed) process.exit(1);
}
