const { EventEmitter } = require('events');

const mockConfigStore = {
  getJiraBaseUrl: jest.fn(),
  getApiKey: jest.fn()
};

jest.mock('../../src/main/services/config-store', () => mockConfigStore);

const jiraService = require('../../src/main/services/jira-service');
const configStore = require('../../src/main/services/config-store');
const https = require('https');
const http = require('http');

describe('Jira Service', () => {
  let mockRequest;
  let mockResponse;
  let httpsRequestSpy;
  let httpRequestSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default config mocks
    configStore.getJiraBaseUrl.mockReturnValue('https://test.atlassian.net');
    configStore.getApiKey.mockReturnValue('user@example.com:token');

    // Mock Request object
    mockRequest = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
      setTimeout: jest.fn((timeout, callback) => {})
    };

    mockResponse = new EventEmitter();
    mockResponse.statusCode = 200;

    // Mock https.request
    httpsRequestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
      if (callback) {
        callback(mockResponse);
      }
      return mockRequest;
    });

    // Mock http.request (though rarely used for Jira Cloud)
    httpRequestSpy = jest.spyOn(http, 'request').mockImplementation((options, callback) => {
      if (callback) {
        callback(mockResponse);
      }
      return mockRequest;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Configuration & Validation', () => {
    test('baseUrl returns normalized URL', () => {
      configStore.getJiraBaseUrl.mockReturnValue('https://test.atlassian.net/rest/api/3');
      expect(jiraService.baseUrl).toBe('https://test.atlassian.net');

      configStore.getJiraBaseUrl.mockReturnValue('https://test.atlassian.net/');
      expect(jiraService.baseUrl).toBe('https://test.atlassian.net');

      configStore.getJiraBaseUrl.mockReturnValue('https://test.atlassian.net/jira');
      expect(jiraService.baseUrl).toBe('https://test.atlassian.net');
    });

    test('authHeader generates correct Basic Auth header', () => {
      configStore.getApiKey.mockReturnValue('user@example.com:secret-token');

      const expectedAuth = 'Basic ' + Buffer.from('user@example.com:secret-token').toString('base64');
      expect(jiraService.authHeader).toBe(expectedAuth);
    });

    test('authHeader generates correct Bearer Auth header', () => {
      configStore.getApiKey.mockReturnValue('some-oauth-token');
      expect(jiraService.authHeader).toBe('Bearer some-oauth-token');
    });

    test('authHeader throws error for invalid email:token format', () => {
      configStore.getApiKey.mockReturnValue('invalid-email:token');
      expect(() => jiraService.authHeader).toThrow(/Jira API key email appears invalid/);
    });

    test('validateBaseUrl throws for non-HTTPS URL', () => {
      expect(() => jiraService.validateBaseUrl('http://insecure.com')).toThrow(/must use HTTPS/);
    });
  });

  describe('API Requests', () => {
    test('request fails if base URL is missing', async () => {
      configStore.getJiraBaseUrl.mockReturnValue('');
      await expect(jiraService.request('/test')).rejects.toThrow('Jira Base URL not configured');
    });

    test('request fails if API key is missing', async () => {
      configStore.getApiKey.mockReturnValue('');
      await expect(jiraService.request('/test')).rejects.toThrow('Jira API Key not configured');
    });

    test('request handles successful response', async () => {
      const promise = jiraService.request('/test');

      mockResponse.emit('data', JSON.stringify({ key: 'TEST-1' }));
      mockResponse.emit('end');

      const result = await promise;
      expect(result).toEqual({ key: 'TEST-1' });

      expect(httpsRequestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'test.atlassian.net',
          path: '/test'
        }),
        expect.any(Function)
      );
    });

    test('request handles 401 Unauthorized', async () => {
      mockResponse.statusCode = 401;
      const promise = jiraService.request('/test');

      mockResponse.emit('data', JSON.stringify({ errorMessages: ['Invalid token'] }));
      mockResponse.emit('end');

      await expect(promise).rejects.toThrow(/Authentication failed/);
    });

    test('request handles 404 Not Found', async () => {
      mockResponse.statusCode = 404;
      const promise = jiraService.request('/test');

      mockResponse.emit('data', 'Not Found');
      mockResponse.emit('end');

      await expect(promise).rejects.toThrow(/Endpoint not found/);
    });

    test('request handles network error', async () => {
      const promise = jiraService.request('/test');

      const error = new Error('Network error');
      // Trigger error on request object
      // wait, requestSpy returns mockRequest, so we can emit error on it?
      // No, mockRequest doesn't have listeners attached by the test runner,
      // but the service attaches 'error' listener to req.

      // We need to access the 'error' callback passed to req.on('error', cb)
      // Since mockRequest.on is a jest mock, we can inspect calls.

      // But we need to wait for the service to attach the listener.
      // This happens synchronously in request() before promise returns?
      // Yes.

      // But we can't emit on mockRequest easily from outside unless mockRequest is an EventEmitter.
      // It is a plain object with jest.fn() methods in my mock setup.
      // I should make mockRequest extend EventEmitter or manually call the callback.

      // Let's manually trigger the error handler
      const errorCallback = mockRequest.on.mock.calls.find(call => call[0] === 'error')[1];
      errorCallback(error);

      await expect(promise).rejects.toThrow('Jira request failed: Network error');
    });
  });

  describe('Service Methods', () => {
    test('listBoards fetches boards', async () => {
      const promise = jiraService.listBoards();

      mockResponse.emit('data', JSON.stringify({
        values: [{ id: 1, name: 'Board 1', type: 'scrum' }]
      }));
      mockResponse.emit('end');

      const result = await promise;
      expect(result).toEqual([{ id: 1, name: 'Board 1', type: 'scrum' }]);

      expect(httpsRequestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/rest/agile/1.0/board?maxResults=50'
        }),
        expect.any(Function)
      );
    });

    test('getIssue fetches issue details', async () => {
      const promise = jiraService.getIssue('TEST-1');

      mockResponse.emit('data', JSON.stringify({ key: 'TEST-1', fields: { summary: 'Bug' } }));
      mockResponse.emit('end');

      const result = await promise;
      expect(result.key).toBe('TEST-1');
      expect(result.fields.summary).toBe('Bug');

      expect(httpsRequestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('/rest/api/3/issue/TEST-1')
        }),
        expect.any(Function)
      );
    });
  });

  describe('Connection Test', () => {
    test('testConnection returns success', async () => {
      const promise = jiraService.testConnection();

      mockResponse.emit('data', JSON.stringify({ emailAddress: 'user@example.com' }));
      mockResponse.emit('end');

      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.message).toContain('user@example.com');
    });

    test('testConnection returns failure on invalid config', async () => {
      configStore.getJiraBaseUrl.mockReturnValue('');
      const result = await jiraService.testConnection();
      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });

    test('testConnection returns failure on API error', async () => {
      mockResponse.statusCode = 401;
      const promise = jiraService.testConnection();

      mockResponse.emit('data', JSON.stringify({ errorMessages: ['Bad token'] }));
      mockResponse.emit('end');

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication failed');
    });
  });
});
