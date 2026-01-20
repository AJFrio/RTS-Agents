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
      end: jest.fn()
    };
    mockResponse = new EventEmitter();
    mockResponse.statusCode = 200;
    mockResponse.headers = { 'content-type': 'application/json' };

    // Set config
    cloudflareKvService.setConfig({ accountId: 'test-account', apiToken: 'test-token' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('retries with rejectUnauthorized: false on SSL error', async () => {
    let callCount = 0;

    requestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
      callCount++;

      // First call: Simulate SSL error
      if (callCount === 1) {
        // Return a mock request that emits an error
        const req = {
          on: (event, cb) => {
            if (event === 'error') {
              // Defer the error slightly to mimic async nature
              process.nextTick(() => cb(new Error('self signed certificate in certificate chain')));
            }
          },
          write: jest.fn(),
          end: jest.fn()
        };
        return req;
      }

      // Second call: Success
      if (callCount === 2) {
        process.nextTick(() => {
            callback(mockResponse);
            mockResponse.emit('data', JSON.stringify({ success: true, result: [] }));
            mockResponse.emit('end');
        });
        return mockRequest;
      }
    });

    const result = await cloudflareKvService.listNamespaces();

    expect(callCount).toBe(2);
    expect(result.success).toBe(true);

    // Verify first call had default (or implicit true) rejectUnauthorized
    // Note: https.request defaults rejectUnauthorized to true if not specified,
    // but our code sets it to !insecure.
    // First call: insecure = false -> rejectUnauthorized = true
    expect(requestSpy.mock.calls[0][0]).toMatchObject({
      rejectUnauthorized: true
    });

    // Verify second call had rejectUnauthorized: false
    expect(requestSpy.mock.calls[1][0]).toMatchObject({
      rejectUnauthorized: false
    });
  });

  test('throws other errors without retry', async () => {
    requestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
      const req = {
        on: (event, cb) => {
          if (event === 'error') {
             process.nextTick(() => cb(new Error('Some other network error')));
          }
        },
        write: jest.fn(),
        end: jest.fn()
      };
      return req;
    });

    await expect(cloudflareKvService.listNamespaces())
      .rejects.toThrow('Cloudflare KV request error: Some other network error');

    expect(requestSpy).toHaveBeenCalledTimes(1);
  });
});
