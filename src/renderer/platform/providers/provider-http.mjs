/**
 * Shared HTTP requester for the web provider services.
 *
 * Every provider talks to the same-origin Cloudflare Worker proxy
 * (/api/<provider>) except OpenRouter, which calls its API directly (the
 * browser allows that CORS). Each service instance builds its own requester
 * with injected dependencies (header provider + fetch impl) so the contract
 * tests in tests/unit/web-platform.verify.mjs can run in Node.
 */

async function defaultParseResponse(response) {
  return response.json();
}

/**
 * @param {object} options
 * @param {string} options.baseUrl - e.g. '/api/jules' or 'https://openrouter.ai/api/v1'
 * @param {string} options.label - human-readable provider name used in error messages
 * @param {() => Record<string, string>} options.getHeaders - auth headers, read fresh per request
 * @param {typeof fetch} [options.fetchImpl] - injectable fetch (defaults to globalThis.fetch)
 * @param {(response: Response) => Promise<unknown>} [options.parseResponse]
 * @param {(response: Response) => Promise<string>} [options.formatError]
 * @returns {(endpoint: string, method?: string, body?: unknown, extraHeaders?: Record<string, string>) => Promise<unknown>}
 */
export function createRequester({
  baseUrl,
  label,
  getHeaders,
  fetchImpl,
  parseResponse = defaultParseResponse,
  formatError,
}) {
  const doFetch = fetchImpl || globalThis.fetch.bind(globalThis);

  async function request(endpoint, method = 'GET', body = null, extraHeaders = {}) {
    const authHeaders = await getHeaders();
    const response = await doFetch(`${baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...extraHeaders,
      },
      // Strings are sent as-is (caller already serialized, e.g. KV values);
      // objects are JSON-encoded; null/undefined means no body.
      body:
        body === null || body === undefined
          ? undefined
          : typeof body === 'string'
            ? body
            : JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(formatError ? await formatError(response) : `${label} API error: ${response.status} - ${await response.text()}`);
    }

    return parseResponse(response);
  }

  return request;
}

export default createRequester;
