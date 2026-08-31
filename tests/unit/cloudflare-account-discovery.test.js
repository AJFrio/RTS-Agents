jest.mock('../../src/main/services/http-service', () => ({
  requestJson: jest.fn(),
}));

const httpService = require('../../src/main/services/http-service');
const { discoverCloudflareAccounts } = require('../../src/main/services/cloudflare-account-discovery');

const TOKEN = 'cf-test-token-abc123';

describe('discoverCloudflareAccounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns a single mapped account on success', async () => {
    httpService.requestJson.mockResolvedValue({
      success: true,
      result: [{ id: 'acct-1', name: 'My Account' }],
    });

    const out = await discoverCloudflareAccounts({ token: TOKEN });

    expect(out).toEqual({
      success: true,
      accounts: [{ id: 'acct-1', name: 'My Account' }],
    });
  });

  test('preserves the full account list in order', async () => {
    httpService.requestJson.mockResolvedValue({
      success: true,
      result: [
        { id: 'acct-1', name: 'First' },
        { id: 'acct-2', name: 'Second' },
        { id: 'acct-3', name: 'Third' },
      ],
    });

    const out = await discoverCloudflareAccounts({ token: TOKEN });

    expect(out.success).toBe(true);
    expect(out.accounts).toEqual([
      { id: 'acct-1', name: 'First' },
      { id: 'acct-2', name: 'Second' },
      { id: 'acct-3', name: 'Third' },
    ]);
  });

  test('maps Cloudflare failure envelope to error without throwing', async () => {
    httpService.requestJson.mockResolvedValue({
      success: false,
      errors: [{ code: 10000, message: 'Invalid API Token' }],
    });

    const out = await discoverCloudflareAccounts({ token: TOKEN });

    expect(out).toEqual({ success: false, error: 'Invalid API Token' });
  });

  test('uses fallback error when failure envelope has no message', async () => {
    httpService.requestJson.mockResolvedValue({ success: false, errors: [] });

    const out = await discoverCloudflareAccounts({ token: TOKEN });

    expect(out).toEqual({ success: false, error: 'Could not list accounts' });
  });

  test('rejects empty or whitespace token without calling requestJson', async () => {
    for (const bad of ['', '   ', null, undefined]) {
      const out = await discoverCloudflareAccounts({ token: bad });
      expect(out).toEqual({ success: false, error: 'API token is required' });
    }
    expect(httpService.requestJson).not.toHaveBeenCalled();
  });

  test('sends GET to the accounts endpoint with Bearer auth header', async () => {
    httpService.requestJson.mockResolvedValue({ success: true, result: [] });

    await discoverCloudflareAccounts({ token: `  ${TOKEN}  ` });

    expect(httpService.requestJson).toHaveBeenCalledTimes(1);
    const [url, method, body, headers] = httpService.requestJson.mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts');
    expect(method).toBe('GET');
    expect(body).toBeNull();
    expect(headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });

  test('filters malformed entries from the result list', async () => {
    httpService.requestJson.mockResolvedValue({
      success: true,
      result: [
        { id: 'acct-1', name: 'Good' },
        null,
        { id: 'acct-2' },
        { name: 'No id' },
        { id: 42, name: 'Bad id type' },
      ],
    });

    const out = await discoverCloudflareAccounts({ token: TOKEN });

    expect(out.success).toBe(true);
    expect(out.accounts).toEqual([{ id: 'acct-1', name: 'Good' }]);
  });

  test('returns error object when requestJson throws', async () => {
    httpService.requestJson.mockRejectedValue(new Error('Request failed with status code 403'));

    const out = await discoverCloudflareAccounts({ token: TOKEN });

    expect(out).toEqual({ success: false, error: 'Request failed with status code 403' });
  });

  test('never logs or returns the token', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    httpService.requestJson.mockResolvedValue({
      success: true,
      result: [{ id: 'acct-1', name: 'My Account' }],
    });
    const ok = await discoverCloudflareAccounts({ token: TOKEN });
    expect(JSON.stringify(ok)).not.toContain(TOKEN);

    httpService.requestJson.mockRejectedValue(new Error('boom'));
    const failed = await discoverCloudflareAccounts({ token: TOKEN });
    expect(JSON.stringify(failed)).not.toContain(TOKEN);

    for (const spy of [logSpy, warnSpy, errorSpy]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(TOKEN);
      }
    }
  });
});
