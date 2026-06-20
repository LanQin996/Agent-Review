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

class StreamCaptureReviewClient extends OpenAIReviewClient {
  async requestStream(path, payload, options) {
    this.lastPath = path;
    this.lastPayload = payload;
    this.lastStreamOptions = options;
    return JSON.stringify({ summary: 'ok', findings: [] });
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
    stream: false,
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
    stream: false,
    reasoningEffort: 'high',
    reasoningSummary: 'auto',
  });

  await client.review(reviewInput);

  assert.equal(client.lastPath, '/chat/completions');
  assert.equal(client.lastPayload.reasoning_effort, 'high');
  assert.equal('reasoning' in client.lastPayload, false);
});

test('Responses parser accepts JSON followed by extra provider text', async () => {
  class NoisyResponsesClient extends CaptureReviewClient {
    async request(path, payload) {
      this.lastPath = path;
      this.lastPayload = payload;
      return {
        output_text: '{"summary":"ok","findings":[]}\n\nreasoning summary: checked diff',
      };
    }
  }

  const client = new NoisyResponsesClient({
    apiKey: 'test',
    model: 'gpt-test',
    apiMode: 'responses',
    stream: false,
  });

  const review = await client.review(reviewInput);

  assert.equal(review.summary, 'ok');
  assert.deepEqual(review.findings, []);
});

test('Chat parser accepts fenced JSON followed by extra provider text', async () => {
  class NoisyChatClient extends CaptureReviewClient {
    async request(path, payload) {
      this.lastPath = path;
      this.lastPayload = payload;
      return {
        choices: [
          {
            message: {
              content: '```json\n{"summary":"ok","findings":[]}\n```\nextra text',
            },
          },
        ],
      };
    }
  }

  const client = new NoisyChatClient({
    apiKey: 'test',
    model: 'gpt-test',
    apiMode: 'chat',
    stream: false,
  });

  const review = await client.review(reviewInput);

  assert.equal(review.summary, 'ok');
  assert.deepEqual(review.findings, []);
});

test('Responses API stream mode is enabled by default', async () => {
  const client = new StreamCaptureReviewClient({
    apiKey: 'test',
    model: 'gpt-test',
    apiMode: 'responses',
  });

  await client.review(reviewInput);

  assert.equal(client.lastPath, '/responses');
  assert.equal(client.lastPayload.stream, true);
  assert.equal(client.lastStreamOptions.mode, 'responses');
});

test('Chat Completions stream mode sends stream payload', async () => {
  const client = new StreamCaptureReviewClient({
    apiKey: 'test',
    model: 'gpt-test',
    apiMode: 'chat',
    stream: true,
  });

  await client.review(reviewInput);

  assert.equal(client.lastPath, '/chat/completions');
  assert.equal(client.lastPayload.stream, true);
  assert.equal(client.lastStreamOptions.mode, 'chat');
});
