const githubService = require('../../src/main/services/github-service');
const https = require('https');
const { EventEmitter } = require('events');

describe('GitHub Service', () => {
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

    // Mock https.request
    requestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
      // Immediately call callback if provided (optional, depends on implementation)
      // but in the test we call it manually to control timing.
      return mockRequest;
    });

    // Set API key to avoid "not configured" error
    githubService.setApiKey('test-key');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('getPullRequests defaults to open state', async () => {
    const promise = githubService.getPullRequests('owner', 'repo');

    // Simulate HTTP response
    const requestCallback = requestSpy.mock.calls[0][1];
    requestCallback(mockResponse);
    mockResponse.emit('data', JSON.stringify([]));
    mockResponse.emit('end');

    await promise;

    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/repos/owner/repo/pulls?state=open'
      }),
      expect.any(Function)
    );
  });

  test('getPullRequests accepts closed state', async () => {
    const promise = githubService.getPullRequests('owner', 'repo', 'closed');

    // Simulate HTTP response
    const requestCallback = requestSpy.mock.calls[0][1];
    requestCallback(mockResponse);
    mockResponse.emit('data', JSON.stringify([]));
    mockResponse.emit('end');

    await promise;

    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/repos/owner/repo/pulls?state=closed'
      }),
      expect.any(Function)
    );
  });

  test('closePullRequest sends correct PATCH request', async () => {
    const promise = githubService.closePullRequest('owner', 'repo', 123);

    const requestCallback = requestSpy.mock.calls[0][1];
    requestCallback(mockResponse);
    mockResponse.emit('data', JSON.stringify({ state: 'closed' }));
    mockResponse.emit('end');

    await promise;

    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/repos/owner/repo/pulls/123',
        method: 'PATCH'
      }),
      expect.any(Function)
    );
    expect(mockRequest.write).toHaveBeenCalledWith(JSON.stringify({ state: 'closed' }));
  });
});
