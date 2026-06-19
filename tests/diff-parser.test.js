import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePatch, validateFindingLocation, serializeChangedFilesForPrompt } from '../src/diff-parser.js';
import { prepareFindings } from '../src/main.js';

const file = {
  filename: 'src/demo.js',
  status: 'modified',
  additions: 2,
  deletions: 1,
  changes: 3,
  patch: `@@ -1,4 +1,5 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 console.log(a + b);`,
};

test('parsePatch tracks commentable RIGHT and LEFT lines', () => {
  const parsed = parsePatch(file.patch);
  assert.equal(parsed.rightLines.has(2), true);
  assert.equal(parsed.rightLines.has(3), true);
  assert.equal(parsed.leftLines.has(2), true);
  assert.equal(parsed.deletedLines.has(2), true);
  assert.equal(parsed.addedLines.has(3), true);
});

test('validateFindingLocation accepts visible diff lines', () => {
  const fileIndex = new Map([['src/demo.js', { file, ...parsePatch(file.patch) }]]);
  assert.equal(validateFindingLocation({ path: 'src/demo.js', line: 3, side: 'RIGHT' }, fileIndex).ok, true);
  assert.equal(validateFindingLocation({ path: 'src/demo.js', line: 2, side: 'LEFT' }, fileIndex).ok, true);
  assert.equal(validateFindingLocation({ path: 'src/demo.js', line: 99, side: 'RIGHT' }, fileIndex).ok, false);
});

test('serializeChangedFilesForPrompt includes annotated line table', () => {
  const text = serializeChangedFilesForPrompt([file]);
  assert.match(text, /old_line \| new_line \| diff/);
  assert.match(text, /src\/demo\.js/);
});

test('prepareFindings filters invalid and sorts by severity', () => {
  const result = prepareFindings([
    { severity: 'P3', path: 'src/demo.js', line: 3, side: 'RIGHT', title: 'low', body: 'x', suggestion: '' },
    { severity: 'P1', path: 'src/demo.js', line: 2, side: 'RIGHT', title: 'high', body: 'x', suggestion: '' },
    { severity: 'P2', path: 'missing.js', line: 1, side: 'RIGHT', title: 'bad', body: 'x', suggestion: '' },
  ], [file], { severityThreshold: 'P3', maxComments: 10 });

  assert.equal(result.validFindings.length, 2);
  assert.equal(result.validFindings[0].severity, 'P1');
  assert.equal(result.skippedFindings.length, 1);
});
