import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['bin', 'src', 'tests', 'scripts'];
const files = [];
for (const root of roots) collect(root);

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    console.error(`Syntax check failed: ${file}`);
    console.error(result.stderr || result.stdout);
  }
}

if (failed) process.exit(1);
console.log(`Syntax OK (${files.length} files)`);

function collect(path) {
  let info;
  try {
    info = statSync(path);
  } catch {
    return;
  }
  if (info.isDirectory()) {
    for (const name of readdirSync(path)) collect(join(path, name));
  } else if (/\.(?:m?js|cjs)$/.test(path)) {
    files.push(path);
  }
}
