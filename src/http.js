export async function requestJsonWithRetry(url, init = {}, options = {}) {
  const retries = Math.max(0, Number(options.retries || 0));
  const timeoutMs = Math.max(0, Number(options.timeoutMs || 0));
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? 800));
  const retryUnsafe = Boolean(options.retryUnsafe);
  const method = String(init.method || 'GET').toUpperCase();
  const canRetryMethod = retryUnsafe || ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'].includes(method);

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = timeoutMs ? new AbortController() : null;
    const timeout = controller
      ? setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
      : null;

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller?.signal || init.signal,
      });
      if (timeout) clearTimeout(timeout);

      const text = await response.text();
      const data = text ? safeJson(text) : null;
      if (response.ok) return data;

      const message = data?.error?.message || data?.message || text || response.statusText;
      const error = new Error(`HTTP ${response.status} ${response.statusText}: ${message}`);
      error.status = response.status;
      error.data = data;

      if (!canRetryMethod || attempt >= retries || !isRetryableStatus(response.status)) {
        throw error;
      }
      lastError = error;
    } catch (error) {
      if (timeout) clearTimeout(timeout);
      if (!canRetryMethod || attempt >= retries || !isRetryableError(error)) {
        throw error;
      }
      lastError = error;
    }

    await sleep(backoff(retryDelayMs, attempt));
  }

  throw lastError || new Error('Request failed');
}

export function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isRetryableError(error) {
  return error?.name === 'AbortError'
    || /timed out|timeout|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(String(error?.message || error));
}

function backoff(baseMs, attempt) {
  const jitter = Math.floor(Math.random() * Math.min(250, baseMs));
  return baseMs * (2 ** attempt) + jitter;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
