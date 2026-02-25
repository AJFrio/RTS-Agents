const { EventEmitter } = require('events');

describe('HttpService', () => {
  let httpService;
  let https;
  let mockRequest;
  let mockResponse;

  beforeEach(() => {
    jest.resetModules();

    mockRequest = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
      setTimeout: jest.fn((timeout, callback) => {})
    };

    mockResponse = new EventEmitter();
    mockResponse.statusCode = 200;

    // Manual mock for https
    jest.doMock('https', () => ({
      request: jest.fn((options, callback) => {
        if (callback) {
            callback(mockResponse);
        }
        return mockRequest;
      })
    }));

    // Require modules after mocking
    https = require('https');
    httpService = require('../../src/main/services/http-service');
  });

  test('should make a GET request with correct options', async () => {
    const url = 'https://api.example.com/test';
    const promise = httpService.request(url);

    mockResponse.emit('data', JSON.stringify({ success: true }));
    mockResponse.emit('end');

    await promise;

    expect(https.request).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'api.example.com',
        path: '/test',
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        })
      }),
      expect.any(Function)
    );
  });

  test('should make a POST request with body', async () => {
    const url = 'https://api.example.com/test';
    const body = { foo: 'bar' };
    const promise = httpService.request(url, { method: 'POST', body });

    mockResponse.emit('data', JSON.stringify({ success: true }));
    mockResponse.emit('end');

    await promise;

    expect(https.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST'
      }),
      expect.any(Function)
    );
    expect(mockRequest.write).toHaveBeenCalledWith(JSON.stringify(body));
  });

  test('should handle custom headers', async () => {
    const url = 'https://api.example.com/test';
    const headers = { 'X-Custom': 'value' };
    const promise = httpService.request(url, { headers });

    mockResponse.emit('data', JSON.stringify({ success: true }));
    mockResponse.emit('end');

    await promise;

    expect(https.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Custom': 'value'
        })
      }),
      expect.any(Function)
    );
  });

  test('should parse JSON response', async () => {
    const url = 'https://api.example.com/test';
    const promise = httpService.request(url);

    mockResponse.emit('data', JSON.stringify({ key: 'value' }));
    mockResponse.emit('end');

    const result = await promise;
    expect(result).toEqual({ key: 'value' });
  });

  test('should handle non-JSON response', async () => {
    const url = 'https://api.example.com/test';
    const promise = httpService.request(url);

    mockResponse.emit('data', 'plain text');
    mockResponse.emit('end');

    const result = await promise;
    expect(result).toBe('plain text');
  });

  test('should handle errors with default prefix', async () => {
    const url = 'https://api.example.com/test';
    const promise = httpService.request(url);

    mockResponse.statusCode = 400;
    mockResponse.emit('data', 'Bad Request');
    mockResponse.emit('end');

    await expect(promise).rejects.toThrow('API error: 400 - Bad Request');
  });

  test('should handle errors with custom prefix', async () => {
    const url = 'https://api.example.com/test';
    const promise = httpService.request(url, { errorMessagePrefix: 'Custom Error' });

    mockResponse.statusCode = 500;
    mockResponse.emit('data', 'Server Error');
    mockResponse.emit('end');

    await expect(promise).rejects.toThrow('Custom Error: 500 - Server Error');
  });

  test('should parse JSON error message', async () => {
    const url = 'https://api.example.com/test';
    const promise = httpService.request(url);

    mockResponse.statusCode = 400;
    mockResponse.emit('data', JSON.stringify({ error: { message: 'Detailed error' } }));
    mockResponse.emit('end');

    await expect(promise).rejects.toThrow('API error: Detailed error');
  });

  test('should parse JSON error message (message field)', async () => {
    const url = 'https://api.example.com/test';
    const promise = httpService.request(url);

    mockResponse.statusCode = 400;
    mockResponse.emit('data', JSON.stringify({ message: 'Detailed error' }));
    mockResponse.emit('end');

    await expect(promise).rejects.toThrow('API error: Detailed error');
  });

  test('should handle timeout', async () => {
    const url = 'https://api.example.com/test';
    const promise = httpService.request(url, { timeout: 1000 });

    // Wait for setTimeout to be called
    await new Promise(resolve => process.nextTick(resolve));

    // Simulate timeout callback execution
    const timeoutCallback = mockRequest.setTimeout.mock.calls[0][1];
    timeoutCallback();

    await expect(promise).rejects.toThrow('API error: request timeout');
    expect(mockRequest.destroy).toHaveBeenCalled();
  });
});
