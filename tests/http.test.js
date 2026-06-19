import test from 'node:test';
import assert from 'node:assert/strict';
import { requestJsonWithRetry } from '../src/http.js';

test('requestJsonWithRetry retries transient failures for unsafe requests when enabled', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ message: 'temporary' }), { status: 500, statusText: 'Server Error' });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const data = await requestJsonWithRetry('https://example.test', { method: 'POST' }, {
      retries: 1,
      retryDelayMs: 0,
      retryUnsafe: true,
    });
    assert.deepEqual(data, { ok: true });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
