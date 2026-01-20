const https = require('https');
const githubService = require('../../src/main/services/github-service');

// Mock https but allows us to inspect calls
describe('GithubService Integration', () => {
  let mockRequest;
  let mockResponse;
  let requestSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks(); // Restore spies

    mockRequest = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn()
    };

    // We create a simpler mock for integration test, focusing on data flow
    requestSpy = jest.spyOn(https, 'request').mockImplementation((options, cb) => {
      // We don't call cb immediately, we let the test drive it
      // to simulate network delay or specific response sequences
      return mockRequest;
    });

    githubService.setApiKey('test-integration-key');
  });

  test('markPullRequestReadyForReview constructs correct GraphQL mutation', async () => {
    const nodeId = 'PR_kwDOKm';
    const promise = githubService.markPullRequestReadyForReview(nodeId);

    // Get the callback passed to https.request
    const requestCallback = requestSpy.mock.calls[0][1];

    // Create a mock response stream
    const responseStream = {
      on: jest.fn(),
      statusCode: 200
    };

    // Execute callback with our response stream
    requestCallback(responseStream);

    // Verify request was sent to /graphql
    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/graphql',
        method: 'POST'
      }),
      expect.any(Function)
    );

    // Simulate response data
    const responseData = JSON.stringify({
      data: {
        markPullRequestReadyForReview: {
          pullRequest: {
            id: nodeId,
            isDraft: false
          }
        }
      }
    });

    // Simulate data chunks
    const dataHandler = responseStream.on.mock.calls.find(call => call[0] === 'data')[1];
    dataHandler(responseData);

    // Simulate end
    const endHandler = responseStream.on.mock.calls.find(call => call[0] === 'end')[1];
    endHandler();

    const result = await promise;
    expect(result.data.markPullRequestReadyForReview.pullRequest.isDraft).toBe(false);

    // Verify the payload sent
    const sentPayload = JSON.parse(mockRequest.write.mock.calls[0][0]);
    expect(sentPayload.query).toContain('markPullRequestReadyForReview');
    expect(sentPayload.variables.id).toBe(nodeId);
  });

  test('mergePullRequest handles 405 Method Not Allowed (Not Mergeable)', async () => {
    const promise = githubService.mergePullRequest('owner', 'repo', 1);

    const requestCallback = requestSpy.mock.calls[0][1];
    const responseStream = {
      on: jest.fn(),
      statusCode: 405 // Method Not Allowed (often means not mergeable)
    };

    requestCallback(responseStream);

    const responseData = JSON.stringify({
      message: 'Pull Request is not mergeable',
      documentation_url: 'https://docs.github.com/rest/reference/pulls#merge-a-pull-request'
    });

    const dataHandler = responseStream.on.mock.calls.find(call => call[0] === 'data')[1];
    dataHandler(responseData);

    const endHandler = responseStream.on.mock.calls.find(call => call[0] === 'end')[1];
    endHandler();

    await expect(promise).rejects.toThrow('Pull Request is not mergeable');
  });

  test('getPullRequests handles network error', async () => {
    const promise = githubService.getPullRequests('owner', 'repo');

    // Simulate error event on request
    const errorHandler = mockRequest.on.mock.calls.find(call => call[0] === 'error')[1];
    errorHandler(new Error('Network connection lost'));

    await expect(promise).rejects.toThrow('Network connection lost');
  });
});
