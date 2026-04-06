const openRouterService = require('../../src/main/services/openrouter-service');
const https = require('https');
const { EventEmitter } = require('events');

jest.mock('https', () => ({
    request: jest.fn()
}));

describe('OpenRouter Service', () => {
  let mockRequest;
  let mockResponse;
  let requestSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    openRouterService.setApiKey('test-key');

    mockRequest = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
      setTimeout: jest.fn((timeout, callback) => {})
    };

    mockResponse = new EventEmitter();
    mockResponse.statusCode = 200;
    mockResponse.headers = {};

    requestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
      if (callback) {
        callback(mockResponse);
      }
      return mockRequest;
    });
  });

  test('request throws error without API key', async () => {
    openRouterService.setApiKey(null);
    await expect(openRouterService.request('/test')).rejects.toThrow('OpenRouter API key not configured');
  });

  test('request handles successful response', async () => {
    const promise = openRouterService.request('/test');

    mockResponse.headers['content-type'] = 'application/json';
    mockResponse.emit('data', JSON.stringify({ success: true }));
    mockResponse.emit('end');

    const result = await promise;
    expect(result).toEqual({ success: true });
  });

  test('request handles error response with specific message', async () => {
    mockResponse.statusCode = 400;
    mockResponse.headers['content-type'] = 'application/json';
    const promise = openRouterService.request('/test');

    mockResponse.emit('data', JSON.stringify({ error: { message: 'Custom Error' } }));
    mockResponse.emit('end');

    await expect(promise).rejects.toThrow('OpenRouter API error: Custom Error');
  });

  test('request handles generic error response', async () => {
    mockResponse.statusCode = 500;
    const promise = openRouterService.request('/test');

    mockResponse.emit('data', 'Internal Server Error');
    mockResponse.emit('end');

    await expect(promise).rejects.toThrow('OpenRouter API error: 500 - Internal Server Error');
  });

  test('request sets correct headers', async () => {
    const promise = openRouterService.request('/test');
    mockResponse.emit('end');
    await promise;

    expect(https.request).toHaveBeenCalledWith(
        expect.objectContaining({
            headers: expect.objectContaining({
                'Authorization': 'Bearer test-key',
                'HTTP-Referer': 'https://rts-agents.com',
                'X-Title': 'RTS Agents'
            })
        }),
        expect.any(Function)
    );
  });

  describe('getModels', () => {
    test('returns empty array if no API key is set', async () => {
      openRouterService.setApiKey(null);
      const models = await openRouterService.getModels();
      expect(models).toEqual([]);
    });

    test('returns mapped models on successful response', async () => {
      const promise = openRouterService.getModels();

      mockResponse.headers['content-type'] = 'application/json';
      mockResponse.emit('data', JSON.stringify({
        data: [
          { id: 'model-1', name: 'Model 1' },
          { id: 'model-2' }
        ]
      }));
      mockResponse.emit('end');

      const models = await promise;
      expect(models).toEqual([
        { id: 'openrouter/model-1', name: 'Model 1', provider: 'openrouter' },
        { id: 'openrouter/model-2', name: 'model-2', provider: 'openrouter' }
      ]);
    });

    test('catches error and returns empty array on request failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const promise = openRouterService.getModels();

      mockResponse.statusCode = 500;
      mockResponse.emit('data', 'Internal Server Error');
      mockResponse.emit('end');

      const models = await promise;
      expect(models).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith('OpenRouter getModels error:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });
});
