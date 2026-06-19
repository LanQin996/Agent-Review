import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveReviewEvent, resolveNoDiffReviewEvent } from '../src/approval.js';

test('AUTO review event requests changes for P1/P0', () => {
  assert.equal(resolveReviewEvent({
    configuredEvent: 'AUTO',
    requestChangesOn: 'P1',
    validFindings: [{ severity: 'P2' }, { severity: 'P1' }],
  }), 'REQUEST_CHANGES');
});

test('AUTO review event comments for non-blocking findings', () => {
  assert.equal(resolveReviewEvent({
    configuredEvent: 'AUTO',
    requestChangesOn: 'P1',
    validFindings: [{ severity: 'P2' }, { severity: 'P3' }],
  }), 'COMMENT');
});

test('AUTO review event can approve clean PR only when enabled', () => {
  assert.equal(resolveReviewEvent({ configuredEvent: 'AUTO', validFindings: [] }), 'COMMENT');
  assert.equal(resolveReviewEvent({ configuredEvent: 'AUTO', validFindings: [], approveWhenClean: true }), 'APPROVE');
});

test('No diff defaults to comment, not approve', () => {
  assert.equal(resolveNoDiffReviewEvent({ configuredEvent: 'AUTO', approveWhenClean: false }), 'COMMENT');
  assert.equal(resolveNoDiffReviewEvent({ configuredEvent: 'AUTO', approveWhenClean: true }), 'APPROVE');
});
