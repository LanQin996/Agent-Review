import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/cli.js';

test('parseArgs supports --key=value and env defaults', () => {
  const args = parseArgs(['--dry-run', '--repo=owner/name', '--pr=42', '--model=gpt-test'], {
    GITHUB_TOKEN: 'gh',
    OPENAI_API_KEY: 'oa',
  });

  assert.equal(args.owner, 'owner');
  assert.equal(args.repo, 'name');
  assert.equal(args.prNumber, 42);
  assert.equal(args.model, 'gpt-test');
  assert.equal(args.dryRun, true);
});

test('parseArgs defaults to dry-run unless --post is set', () => {
  const args = parseArgs(['--repo', 'owner/name', '--pr', '1'], {});
  assert.equal(args.dryRun, true);
  assert.equal(args.post, false);
});


test('parseArgs supports approval policy options', () => {
  const args = parseArgs([
    '--repo', 'owner/name',
    '--pr', '7',
    '--review-event', 'AUTO',
    '--request-changes-on', 'P2',
    '--approve-when-clean', 'true',
  ], {});

  assert.equal(args.reviewEvent, 'AUTO');
  assert.equal(args.requestChangesOn, 'P2');
  assert.equal(args.approveWhenClean, true);
});
