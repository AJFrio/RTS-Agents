const httpService = require('./http-service');

const ACCOUNTS_ENDPOINT = 'https://api.cloudflare.com/client/v4/accounts';

/**
 * List the Cloudflare accounts an API token can access.
 * Never logs the token and never includes it in any return value.
 * @param {object} params
 * @param {string} params.token - Cloudflare API token (already trimmed by caller, trimmed again defensively)
 * @param {number} [params.timeoutMs=30000]
 * @returns {Promise<{success: boolean, accounts?: Array<{id: string, name: string}>, error?: string}>}
 */
async function discoverCloudflareAccounts({ token, timeoutMs = 30000 } = {}) {
  const trimmedToken = typeof token === 'string' ? token.trim() : '';
  if (!trimmedToken) {
    return { success: false, error: 'API token is required' };
  }

  try {
    const envelope = await httpService.requestJson(
      ACCOUNTS_ENDPOINT,
      'GET',
      null,
      { Authorization: `Bearer ${trimmedToken}` },
      timeoutMs
    );

    if (!envelope || envelope.success === false || !Array.isArray(envelope.result)) {
      const message =
        envelope && Array.isArray(envelope.errors) && envelope.errors[0]?.message
          ? envelope.errors[0].message
          : 'Could not list accounts';
      return { success: false, error: message };
    }

    const accounts = envelope.result
      .filter(
        (entry) =>
          entry &&
          typeof entry.id === 'string' &&
          entry.id.length > 0 &&
          typeof entry.name === 'string' &&
          entry.name.length > 0
      )
      .map((entry) => ({ id: entry.id, name: entry.name }));

    return { success: true, accounts };
  } catch (err) {
    return { success: false, error: err?.message || 'Unknown error' };
  }
}

module.exports = { discoverCloudflareAccounts };
