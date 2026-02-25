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
});
