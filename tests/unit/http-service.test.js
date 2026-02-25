const httpService = require('../../src/main/services/http-service');
const https = require('https');
const http = require('http');
const { EventEmitter } = require('events');

describe('HttpService', () => {
  let mockRequest;
  let mockResponse;
  let httpsRequestSpy;
  let httpRequestSpy;

  beforeEach(() => {
    jest.clearAllMocks();

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

    httpsRequestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
      if (callback) {
        callback(mockResponse);
      }
      return mockRequest;
    });

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

  test('should use https for https URLs', async () => {
    const promise = httpService.request('https://example.com');
    mockResponse.emit('end');
    await promise;
    expect(httpsRequestSpy).toHaveBeenCalled();
    expect(httpRequestSpy).not.toHaveBeenCalled();
  });

  test('should use http for http URLs', async () => {
    const promise = httpService.request('http://example.com');
    mockResponse.emit('end');
    await promise;
    expect(httpRequestSpy).toHaveBeenCalled();
    expect(httpsRequestSpy).not.toHaveBeenCalled();
  });

  test('should resolve with parsed JSON when content-type is application/json', async () => {
    mockResponse.headers['content-type'] = 'application/json';
    const promise = httpService.request('https://example.com');

    mockResponse.emit('data', JSON.stringify({ foo: 'bar' }));
    mockResponse.emit('end');

    const result = await promise;
    expect(result).toEqual({ foo: 'bar' });
  });

  test('should resolve with parsed JSON even without content-type if valid JSON', async () => {
    const promise = httpService.request('https://example.com');

    mockResponse.emit('data', JSON.stringify({ foo: 'bar' }));
    mockResponse.emit('end');

    const result = await promise;
    expect(result).toEqual({ foo: 'bar' });
  });

  test('should resolve with raw data if not JSON', async () => {
    const promise = httpService.request('https://example.com');

    mockResponse.emit('data', 'plain text');
    mockResponse.emit('end');

    const result = await promise;
    expect(result).toBe('plain text');
  });

  test('should reject on non-2xx status code', async () => {
    mockResponse.statusCode = 404;
    const promise = httpService.request('https://example.com');

    mockResponse.emit('data', 'Not Found');
    mockResponse.emit('end');

    await expect(promise).rejects.toThrow('Request failed with status code 404');
    try {
        await promise;
    } catch (err) {
        expect(err.statusCode).toBe(404);
        expect(err.data).toBe('Not Found');
    }
  });

  test('should reject on request error', async () => {
    const handlers = {};
    // mockRequest.on needs to be hooked up to capture handlers
    // But we defined mockRequest in beforeEach, and jest.spyOn returns it.
    // So we can spyOn mockRequest.on or just use the mock function implementation

    mockRequest.on.mockImplementation((event, cb) => {
        handlers[event] = cb;
    });

    const promise = httpService.request('https://example.com');

    const error = new Error('Network Error');
    expect(handlers['error']).toBeDefined();
    handlers['error'](error);

    await expect(promise).rejects.toThrow('Network Error');
  });

  test('should reject on timeout', async () => {
    mockRequest.setTimeout.mockImplementation((timeout, callback) => {
        callback();
    });
    const promise = httpService.request('https://example.com', { timeout: 1000 });
    await expect(promise).rejects.toThrow('Request timeout after 1000ms');
    expect(mockRequest.destroy).toHaveBeenCalled();
  });

  test('should write body if provided', async () => {
    const body = { key: 'value' };
    const promise = httpService.request('https://example.com', { body });
    mockResponse.emit('end');
    await promise;
    expect(mockRequest.write).toHaveBeenCalledWith(JSON.stringify(body));
  });

  test('requestJson should set content-type header', async () => {
    const promise = httpService.requestJson('https://example.com');
    mockResponse.emit('end');
    await promise;
    expect(httpsRequestSpy).toHaveBeenCalledWith(expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' })
    }), expect.any(Function));
  });
});
