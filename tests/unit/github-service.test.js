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

  describe('getAllPullRequests', () => {
    test('fetches repos and then PRs, returning sorted list', async () => {
      const mockRepo1 = { name: 'repo1', full_name: 'user/repo1', owner: { login: 'user' } };
      const mockRepo2 = { name: 'repo2', full_name: 'user/repo2', owner: { login: 'user' } };
      const mockPr1 = { id: 1, title: 'PR 1', created_at: '2023-01-01T10:00:00Z', base: { repo: mockRepo1 } };
      const mockPr2 = { id: 2, title: 'PR 2', created_at: '2023-01-02T10:00:00Z', base: { repo: mockRepo2 } };

      requestSpy.mockImplementation((options, callback) => {
        const res = new EventEmitter();
        res.statusCode = 200;

        let data = '';
        if (options.path.includes('/user/repos')) {
          data = JSON.stringify([mockRepo1, mockRepo2]);
        } else if (options.path.includes('/repos/user/repo1/pulls')) {
          data = JSON.stringify([mockPr1]);
        } else if (options.path.includes('/repos/user/repo2/pulls')) {
          data = JSON.stringify([mockPr2]);
        }

        process.nextTick(() => {
          callback(res);
          res.emit('data', data);
          res.emit('end');
        });

        return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
      });

      const allPrs = await githubService.getAllPullRequests();

      expect(allPrs).toHaveLength(2);
      // PR 2 is newer
      expect(allPrs[0].id).toBe(2);
      expect(allPrs[1].id).toBe(1);
    });

    test('handles individual repo PR fetch failure gracefully', async () => {
      const mockRepo1 = { name: 'repo1', full_name: 'user/repo1', owner: { login: 'user' } };
      const mockRepo2 = { name: 'repo2', full_name: 'user/repo2', owner: { login: 'user' } };
      const mockPr1 = { id: 1, title: 'PR 1', created_at: '2023-01-01T10:00:00Z', base: { repo: mockRepo1 } };

      requestSpy.mockImplementation((options, callback) => {
        const res = new EventEmitter();
        res.statusCode = 200;

        let data = '';
        if (options.path.includes('/user/repos')) {
          data = JSON.stringify([mockRepo1, mockRepo2]);
        } else if (options.path.includes('/repos/user/repo1/pulls')) {
          data = JSON.stringify([mockPr1]);
        } else if (options.path.includes('/repos/user/repo2/pulls')) {
          res.statusCode = 500;
          data = JSON.stringify({ message: 'Error' });
        }

        process.nextTick(() => {
          callback(res);
          res.emit('data', data);
          res.emit('end');
        });

        return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
      });

      const allPrs = await githubService.getAllPullRequests();

      // Should only contain PRs from repo1
      expect(allPrs).toHaveLength(1);
      expect(allPrs[0].id).toBe(1);
    });
  });

  describe('mergePullRequest', () => {
    test('sends correct PUT request with default method', async () => {
      const promise = githubService.mergePullRequest('owner', 'repo', 123);

      const requestCallback = requestSpy.mock.calls[0][1];
      requestCallback(mockResponse);
      mockResponse.emit('data', JSON.stringify({ merged: true }));
      mockResponse.emit('end');

      await promise;

      expect(requestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/repos/owner/repo/pulls/123/merge',
          method: 'PUT'
        }),
        expect.any(Function)
      );
      expect(mockRequest.write).toHaveBeenCalledWith(JSON.stringify({ merge_method: 'merge' }));
    });

    test('sends correct PUT request with squash method', async () => {
      const promise = githubService.mergePullRequest('owner', 'repo', 123, 'squash');

      const requestCallback = requestSpy.mock.calls[0][1];
      requestCallback(mockResponse);
      mockResponse.emit('data', JSON.stringify({ merged: true }));
      mockResponse.emit('end');

      await promise;

      expect(mockRequest.write).toHaveBeenCalledWith(JSON.stringify({ merge_method: 'squash' }));
    });

    test('handles 405 error from GitHub', async () => {
      mockResponse.statusCode = 405;
      const promise = githubService.mergePullRequest('owner', 'repo', 123);

      const requestCallback = requestSpy.mock.calls[0][1];
      requestCallback(mockResponse);
      mockResponse.emit('data', 'Method Not Allowed'); // Non-JSON error
      mockResponse.emit('end');

      await expect(promise).rejects.toThrow('GitHub API Error: 405');
    });
  });
});
