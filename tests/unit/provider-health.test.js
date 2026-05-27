const providerHealth = require('../../src/main/services/provider-health');

describe('provider-health', () => {
  test('builds connected health with shared fields', () => {
    const result = providerHealth.ok('jules', {
      configured: true,
      endpointLabel: 'GET /sources',
      docsUrl: 'https://example.com/docs'
    });

    expect(result).toMatchObject({
      provider: 'jules',
      success: true,
      connected: true,
      configured: true,
      status: 'ok',
      endpointLabel: 'GET /sources',
      docsUrl: 'https://example.com/docs'
    });
    expect(result.checkedAt).toEqual(expect.any(String));
  });

  test('redacts secrets from errors and diagnostics', () => {
    const result = providerHealth.fail('github', 'Authorization: Bearer ghp_secret_token failed', {
      configured: true,
      diagnostics: {
        apiKey: 'secret',
        nested: { token: 'secret2' },
        header: 'Basic abc123'
      }
    });

    expect(result.error).not.toContain('ghp_secret_token');
    expect(result.diagnostics.apiKey).toBe('[redacted]');
    expect(result.diagnostics.nested.token).toBe('[redacted]');
    expect(result.diagnostics.header).not.toContain('abc123');
  });
});
