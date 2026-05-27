const cloudflareKvService = require('../../src/main/services/cloudflare-kv-service');
const https = require('https');
const { EventEmitter } = require('events');

describe('Cloudflare KV Service', () => {
  let mockRequest;
  let mockResponse;
  let requestSpy;

  beforeEach(() => {
    mockRequest = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };
    mockResponse = new EventEmitter();
    mockResponse.statusCode = 200;
    mockResponse.headers = { 'content-type': 'application/json' };

    cloudflareKvService.setConfig({ accountId: 'test-account', apiToken: 'test-token' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('does not retry insecurely on SSL errors', async () => {
    requestSpy = jest.spyOn(https, 'request').mockImplementation(() => {
      const req = {
        on: (event, cb) => {
          if (event === 'error') {
            process.nextTick(() => cb(new Error('self signed certificate in certificate chain')));
          }
        },
        write: jest.fn(),
        end: jest.fn(),
      };
      return req;
    });

    await expect(cloudflareKvService.listNamespaces()).rejects.toThrow(
      'Cloudflare KV request error: self signed certificate in certificate chain'
    );
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls[0][0]).not.toHaveProperty('rejectUnauthorized', false);
  });

  test('throws other errors without retry', async () => {
    requestSpy = jest.spyOn(https, 'request').mockImplementation(() => {
      const req = {
        on: (event, cb) => {
          if (event === 'error') {
            process.nextTick(() => cb(new Error('Some other network error')));
          }
        },
        write: jest.fn(),
        end: jest.fn(),
      };
      return req;
    });

    await expect(cloudflareKvService.listNamespaces()).rejects.toThrow(
      'Cloudflare KV request error: Some other network error'
    );

    expect(requestSpy).toHaveBeenCalledTimes(1);
  });

  describe('putValue', () => {
    test('throws if namespaceId or key are missing', async () => {
      await expect(cloudflareKvService.putValue(null, 'key', 'value')).rejects.toThrow(
        'Missing Cloudflare KV namespaceId'
      );
      await expect(cloudflareKvService.putValue('ns', null, 'value')).rejects.toThrow(
        'Missing Cloudflare KV key'
      );
    });

    test('PUTs string values to the values endpoint', async () => {
      requestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
        process.nextTick(() => {
          callback(mockResponse);
          mockResponse.emit('data', '');
          mockResponse.emit('end');
        });
        return mockRequest;
      });

      const result = await cloudflareKvService.putValue('my-ns', 'my-key', 'hello');

      expect(result).toEqual({ success: true });
      expect(requestSpy).toHaveBeenCalledTimes(1);
      const [options] = requestSpy.mock.calls[0];
      expect(options.method).toBe('PUT');
      expect(options.path).toContain('/namespaces/my-ns/values/my-key');
      expect(mockRequest.write).toHaveBeenCalledWith('hello');
    });

    test('JSON-stringifies object values', async () => {
      requestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
        process.nextTick(() => {
          callback(mockResponse);
          mockResponse.emit('data', '');
          mockResponse.emit('end');
        });
        return mockRequest;
      });

      await cloudflareKvService.putValue('my-ns', 'devices', [{ id: 'a' }]);

      expect(mockRequest.write).toHaveBeenCalledWith(JSON.stringify([{ id: 'a' }]));
    });

    test('throws when the API returns a non-2xx status', async () => {
      mockResponse.statusCode = 400;
      requestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
        process.nextTick(() => {
          callback(mockResponse);
          mockResponse.emit('data', JSON.stringify({ errors: ['bad'] }));
          mockResponse.emit('end');
        });
        return mockRequest;
      });

      await expect(cloudflareKvService.putValue('my-ns', 'my-key', 'val')).rejects.toThrow(
        'Cloudflare KV request failed (400)'
      );
    });
  });

  describe('getValueText', () => {
    test('returns plain text from a successful GET', async () => {
      const textResponse = new EventEmitter();
      textResponse.statusCode = 200;
      textResponse.headers = { 'content-type': 'text/plain' };

      requestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
        process.nextTick(() => {
          callback(textResponse);
          textResponse.emit('data', 'stored-value');
          textResponse.emit('end');
        });
        return mockRequest;
      });

      const text = await cloudflareKvService.getValueText('my-ns', 'my-key');
      expect(text).toBe('stored-value');
    });
  });
});
