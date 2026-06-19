import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesPattern, filterIgnoredFiles } from '../src/ignore.js';

test('matchesPattern supports lockfiles, directories, and glob suffixes', () => {
  assert.equal(matchesPattern('package-lock.json', 'package-lock.json'), true);
  assert.equal(matchesPattern('apps/web/package-lock.json', 'package-lock.json'), true);
  assert.equal(matchesPattern('dist/app.js', 'dist/**'), true);
  assert.equal(matchesPattern('src/app.min.js', '**/*.min.js'), true);
  assert.equal(matchesPattern('src/app.js', '**/*.min.js'), false);
});

test('filterIgnoredFiles separates ignored files with matched pattern', () => {
  const files = [
    { filename: 'src/app.js' },
    { filename: 'pnpm-lock.yaml' },
  ];
  const result = filterIgnoredFiles(files, ['pnpm-lock.yaml']);
  assert.deepEqual(result.included.map((file) => file.filename), ['src/app.js']);
  assert.equal(result.ignored[0].pattern, 'pnpm-lock.yaml');
});
