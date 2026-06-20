import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCommentBody,
  buildReviewBody,
  normalizeSummaryMode,
  shouldCreateReviewSummary,
  shouldUpsertIssueSummary,
  SUMMARY_MARKER,
} from '../src/formatter.js';

test('summary mode helpers normalize valid modes', () => {
  assert.equal(normalizeSummaryMode('comment'), 'comment');
  assert.equal(normalizeSummaryMode('bad'), 'review');
  assert.equal(shouldCreateReviewSummary('both'), true);
  assert.equal(shouldCreateReviewSummary('comment'), false);
  assert.equal(shouldUpsertIssueSummary('comment'), true);
  assert.equal(shouldUpsertIssueSummary('none'), false);
});

test('buildReviewBody includes summary marker for upsert', () => {
  const body = buildReviewBody({
    review: { summary: 'ok' },
    validFindings: [],
    skippedFindings: [],
    commitId: 'abcdef123456',
    model: 'm',
    reviewEvent: 'COMMENT',
    policyText: 'policy',
  });
  assert.match(body, new RegExp(SUMMARY_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('buildCommentBody does not append reaction footer', () => {
  const body = buildCommentBody({
    severity: 'P2',
    path: 'src/demo.js',
    line: 12,
    side: 'RIGHT',
    title: '修复边界条件',
    body: '这里需要处理空值。',
    suggestion: '',
  });

  assert.doesNotMatch(body, /Useful\? React/i);
  assert.match(body, /修复边界条件/);
});
