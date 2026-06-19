import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFindingFingerprint,
  buildFindingMarker,
  extractFindingFingerprintsFromComments,
  filterDuplicateFindings,
} from '../src/dedupe.js';

const finding = {
  severity: 'P1',
  path: 'src/demo.js',
  side: 'RIGHT',
  line: 10,
  start_line: null,
  title: 'Fix unsafe input handling',
};

test('finding fingerprint is stable for equivalent finding fields', () => {
  assert.equal(buildFindingFingerprint(finding), buildFindingFingerprint({
    ...finding,
    title: '  Fix unsafe input handling  ',
  }));
});

test('extractFindingFingerprintsFromComments reads hidden markers', () => {
  const marker = buildFindingMarker(finding);
  const fingerprints = extractFindingFingerprintsFromComments([{ body: `${marker}\nbody` }]);
  assert.equal(fingerprints.has(buildFindingFingerprint(finding)), true);
});

test('filterDuplicateFindings separates previously posted findings', () => {
  const existing = new Set([buildFindingFingerprint(finding)]);
  const result = filterDuplicateFindings([finding, { ...finding, line: 11 }], existing);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.fresh.length, 1);
});
