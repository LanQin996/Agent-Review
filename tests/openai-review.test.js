import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIReviewClient } from '../src/openai-review.js';

class CaptureReviewClient extends OpenAIReviewClient {
  async request(path, payload) {
    this.lastPath = path;
    this.lastPayload = payload;
    if (path === '/chat/completions') {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({ summary: 'ok', findings: [] }),
            },
          },
        ],
      };
    }

    return {
      output_text: JSON.stringify({ summary: 'ok', findings: [] }),
    };
  }
}

const reviewInput = {
  repo: { owner: 'owner', name: 'repo' },
  pr: {
    number: 1,
    title: 'test',
    user: { login: 'alice' },
    base: { ref: 'main' },
    head: { ref: 'feature' },
  },
  rulesText: 'rules',
  diffText: 'diff',
};

test('Responses API payload supports reasoning effort and summary', async () => {
  const client = new CaptureReviewClient({
    apiKey: 'test',
    model: 'gpt-test',
    apiMode: 'responses',
    reasoningEffort: 'x-high',
    reasoningSummary: 'auto',
  });

  await client.review(reviewInput);

  assert.equal(client.lastPath, '/responses');
  assert.deepEqual(client.lastPayload.reasoning, {
    effort: 'xhigh',
    summary: 'auto',
  });
});

test('Chat Completions payload supports reasoning_effort', async () => {
  const client = new CaptureReviewClient({
    apiKey: 'test',
    model: 'gpt-test',
    apiMode: 'chat',
    reasoningEffort: 'high',
    reasoningSummary: 'auto',
  });

  await client.review(reviewInput);

  assert.equal(client.lastPath, '/chat/completions');
  assert.equal(client.lastPayload.reasoning_effort, 'high');
  assert.equal('reasoning' in client.lastPayload, false);
});
