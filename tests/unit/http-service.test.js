const https = require('https');

// Mock https module
jest.mock('https');

describe('HttpService', () => {
  let httpService;
  let httpsMock;
  let reqMock;
  let resMock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    httpsMock = require('https');

    // Explicitly mock request function to ensure it's a jest mock
    httpsMock.request = jest.fn();

    httpService = require('../../src/main/services/http-service');

    reqMock = {
      on: jest.fn(),
      end: jest.fn(),
      write: jest.fn(),
      setTimeout: jest.fn(),
      destroy: jest.fn()
    };

    resMock = {
      on: jest.fn(),
      statusCode: 200
    };

    httpsMock.request.mockReturnValue(reqMock);
  });

  test('request success with JSON response', async () => {
    const responseData = { success: true };

    httpsMock.request.mockImplementation((options, callback) => {
      // Execute callback immediately to simulate response
      callback(resMock);

      // Simulate data event
      const dataHandler = resMock.on.mock.calls.find(call => call[0] === 'data');
      if (dataHandler) dataHandler[1](JSON.stringify(responseData));

      // Simulate end event
      const endHandler = resMock.on.mock.calls.find(call => call[0] === 'end');
      if (endHandler) endHandler[1]();

      return reqMock;
    });

    const result = await httpService.request('https://api.example.com/test');
    expect(result).toEqual(responseData);
    expect(httpsMock.request).toHaveBeenCalled();
  });

  test('request failure with error message parsing', async () => {
    resMock.statusCode = 400;
    const errorResponse = { error: { message: 'Bad Request' } };

    httpsMock.request.mockImplementation((options, callback) => {
      callback(resMock);

      const dataHandler = resMock.on.mock.calls.find(call => call[0] === 'data');
      if (dataHandler) dataHandler[1](JSON.stringify(errorResponse));

      const endHandler = resMock.on.mock.calls.find(call => call[0] === 'end');
      if (endHandler) endHandler[1]();

      return reqMock;
    });

    await expect(httpService.request('https://api.example.com/test'))
      .rejects.toThrow('API request failed: Bad Request');
  });

  test('request failure with default error message', async () => {
    resMock.statusCode = 500;
    const errorText = 'Internal Server Error';

    httpsMock.request.mockImplementation((options, callback) => {
      callback(resMock);

      const dataHandler = resMock.on.mock.calls.find(call => call[0] === 'data');
      if (dataHandler) dataHandler[1](errorText);

      const endHandler = resMock.on.mock.calls.find(call => call[0] === 'end');
      if (endHandler) endHandler[1]();

      return reqMock;
    });

    await expect(httpService.request('https://api.example.com/test'))
      .rejects.toThrow(`API request failed: 500 - ${errorText}`);
  });

  test('request timeout', async () => {
    // For timeout, we don't trigger response callback immediately
    // Instead we rely on setTimeout call from service

    reqMock.setTimeout.mockImplementation((timeout, callback) => {
      callback(); // Trigger timeout immediately
    });

    httpsMock.request.mockReturnValue(reqMock);

    await expect(httpService.request('https://api.example.com/test'))
      .rejects.toThrow('API request failed: Request timeout');

    expect(reqMock.destroy).toHaveBeenCalled();
  });

  test('sends body correctly', async () => {
    const body = { test: 'data' };

    httpsMock.request.mockImplementation((options, callback) => {
      callback(resMock);
      const endHandler = resMock.on.mock.calls.find(call => call[0] === 'end');
      if (endHandler) endHandler[1]();
      return reqMock;
    });

    await httpService.request('https://api.example.com/test', { method: 'POST' }, body);
    expect(reqMock.write).toHaveBeenCalledWith(JSON.stringify(body));
  });

  test('handles string body correctly', async () => {
    const body = 'test string body';

    httpsMock.request.mockImplementation((options, callback) => {
      callback(resMock);
      const endHandler = resMock.on.mock.calls.find(call => call[0] === 'end');
      if (endHandler) endHandler[1]();
      return reqMock;
    });

    await httpService.request('https://api.example.com/test', { method: 'POST' }, body);
    expect(reqMock.write).toHaveBeenCalledWith(body);
  });
});
