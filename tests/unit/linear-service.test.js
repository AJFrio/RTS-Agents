const { EventEmitter } = require('events');

const mockConfigStore = {
  getApiKey: jest.fn(),
};

jest.mock('../../src/main/services/config-store', () => mockConfigStore);

const linearService = require('../../src/main/services/linear-service');
const configStore = require('../../src/main/services/config-store');
const https = require('https');

describe('Linear Service', () => {
  let mockRequest;
  let mockResponse;
  let httpsRequestSpy;

  const issueNode = {
    id: 'issue-uuid-1',
    identifier: 'ENG-42',
    title: 'Fix login bug',
    description: 'Steps to reproduce...',
    state: { name: 'In Progress' },
    priority: 2,
    url: 'https://linear.app/acme/issue/ENG-42/fix-login-bug',
    project: { name: 'Platform' },
    assignee: { name: 'AJ' },
    updatedAt: '2026-09-10T12:00:00.000Z',
  };

  const normalizedIssue = {
    id: 'issue-uuid-1',
    key: 'ENG-42',
    title: 'Fix login bug',
    description: 'Steps to reproduce...',
    state: 'In Progress',
    priority: 2,
    url: 'https://linear.app/acme/issue/ENG-42/fix-login-bug',
    project: 'Platform',
    assignee: 'AJ',
    updatedAt: '2026-09-10T12:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default config mocks
    configStore.getApiKey.mockReturnValue('lin_api_test_key_123');

    // Mock Request object
    mockRequest = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
      setTimeout: jest.fn((_timeout, _callback) => {}),
    };

    mockResponse = new EventEmitter();
    mockResponse.statusCode = 200;

    // Mock https.request
    httpsRequestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
      if (callback) {
        callback(mockResponse);
      }
      return mockRequest;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const lastRequestBody = () => JSON.parse(mockRequest.write.mock.calls[0][0]);

  describe('Configuration & Auth', () => {
    test('apiKey reads the linear key from config store', () => {
      expect(linearService.apiKey).toBe('lin_api_test_key_123');
      expect(configStore.getApiKey).toHaveBeenCalledWith('linear');
    });

    test('request fails if API key is missing', async () => {
      configStore.getApiKey.mockReturnValue('');
      await expect(linearService.listTeams()).rejects.toThrow('Linear API key not configured');
    });
  });

  describe('GraphQL Requests', () => {
    test('graphql POSTs to api.linear.app/graphql with JSON content type', async () => {
      const promise = linearService.listTeams();

      mockResponse.emit('data', JSON.stringify({ data: { teams: { nodes: [] } } }));
      mockResponse.emit('end');
      await promise;

      expect(httpsRequestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'api.linear.app',
          path: '/graphql',
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
        expect.any(Function)
      );
    });

    test('Authorization header is sent verbatim (no Bearer/Basic prefix)', async () => {
      configStore.getApiKey.mockReturnValue('lin_api_abc123');
      const promise = linearService.listTeams();

      mockResponse.emit('data', JSON.stringify({ data: { teams: { nodes: [] } } }));
      mockResponse.emit('end');
      await promise;

      const auth = httpsRequestSpy.mock.calls[0][0].headers.Authorization;
      expect(auth).toBe('lin_api_abc123');
      expect(auth).not.toMatch(/^(Bearer|Basic)\s/i);
    });

    test('request handles network error', async () => {
      const promise = linearService.listTeams();

      const error = new Error('Network error');
      const errorCallback = mockRequest.on.mock.calls.find((call) => call[0] === 'error')[1];
      errorCallback(error);

      await expect(promise).rejects.toThrow('Linear request failed: Network error');
    });

    test('request rejects on GraphQL errors envelope', async () => {
      const promise = linearService.listTeams();

      mockResponse.emit('data', JSON.stringify({ errors: [{ message: 'Something broke' }] }));
      mockResponse.emit('end');

      await expect(promise).rejects.toThrow(/Something broke/);
    });

    test('request handles 401 Unauthorized', async () => {
      mockResponse.statusCode = 401;
      const promise = linearService.listTeams();

      mockResponse.emit('data', JSON.stringify({ errors: [{ message: 'Unauthorized' }] }));
      mockResponse.emit('end');

      await expect(promise).rejects.toThrow(/Authentication failed/);
    });

    test('request handles 403 Forbidden', async () => {
      mockResponse.statusCode = 403;
      const promise = linearService.listTeams();

      mockResponse.emit('data', JSON.stringify({ message: 'Forbidden' }));
      mockResponse.emit('end');

      await expect(promise).rejects.toThrow(/Access forbidden/);
    });

    test('request handles 429 Rate Limited', async () => {
      mockResponse.statusCode = 429;
      const promise = linearService.listTeams();

      mockResponse.emit('data', JSON.stringify({ message: 'Too many requests' }));
      mockResponse.emit('end');

      await expect(promise).rejects.toThrow(/Rate limited/);
    });
  });

  describe('Service Methods', () => {
    test('testConnection sends viewer query and returns success with user', async () => {
      const viewer = { id: 'user-1', name: 'AJ', email: 'aj@example.com' };
      const promise = linearService.testConnection();

      mockResponse.emit('data', JSON.stringify({ data: { viewer } }));
      mockResponse.emit('end');

      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.user).toEqual({ id: 'user-1', name: 'AJ', email: 'aj@example.com' });
      expect(lastRequestBody().query).toMatch(/viewer\s*\{\s*id\s+name\s+email\s*\}/);
    });

    test('testConnection returns failure when API key is not configured', async () => {
      configStore.getApiKey.mockReturnValue('');
      const result = await linearService.testConnection();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Linear API key not configured');
    });

    test('testConnection returns failure on 401', async () => {
      mockResponse.statusCode = 401;
      const promise = linearService.testConnection();

      mockResponse.emit('data', JSON.stringify({ errors: [{ message: 'Unauthorized' }] }));
      mockResponse.emit('end');

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication failed');
    });

    test('listTeams maps teams nodes to id/name/key', async () => {
      const promise = linearService.listTeams();

      const nodes = [
        { id: 'team-1', name: 'Engineering', key: 'ENG', issueCountOrder: 1 },
        { id: 'team-2', name: 'Design', key: 'DSN', issueCountOrder: 2 },
      ];
      mockResponse.emit('data', JSON.stringify({ data: { teams: { nodes } } }));
      mockResponse.emit('end');

      const result = await promise;
      expect(result).toEqual([
        { id: 'team-1', name: 'Engineering', key: 'ENG' },
        { id: 'team-2', name: 'Design', key: 'DSN' },
      ]);
    });

    test('listIssues posts team-filtered query with first 50', async () => {
      const promise = linearService.listIssues('team-1');

      mockResponse.emit('data', JSON.stringify({ data: { issues: { nodes: [] } } }));
      mockResponse.emit('end');
      await promise;

      const body = lastRequestBody();
      expect(body.query).toMatch(/query\s*\(\s*\$teamId:\s*String!/);
      expect(body.query).toMatch(
        /filter:\s*\{\s*team:\s*\{\s*id:\s*\{\s*eq:\s*\$teamId\s*\}\s*\}\s*\}/
      );
      expect(body.query).toMatch(/first:\s*\$first/);
      expect(body.variables).toEqual({ teamId: 'team-1', first: 50 });
    });

    test('listIssues maps nodes to normalized issues', async () => {
      const promise = linearService.listIssues('team-1');

      mockResponse.emit('data', JSON.stringify({ data: { issues: { nodes: [issueNode] } } }));
      mockResponse.emit('end');

      const result = await promise;
      expect(result).toEqual([normalizedIssue]);
    });

    test('listIssues normalizes missing optional fields to null', async () => {
      const bareNode = {
        id: 'issue-uuid-2',
        identifier: 'ENG-43',
        title: 'No extras',
        description: null,
        state: null,
        priority: 0,
        url: 'https://linear.app/acme/issue/ENG-43/no-extras',
        updatedAt: '2026-09-11T00:00:00.000Z',
      };
      const promise = linearService.listIssues('team-1');

      mockResponse.emit('data', JSON.stringify({ data: { issues: { nodes: [bareNode] } } }));
      mockResponse.emit('end');

      const result = await promise;
      expect(result).toEqual([
        {
          id: 'issue-uuid-2',
          key: 'ENG-43',
          title: 'No extras',
          description: '',
          state: null,
          priority: 0,
          url: 'https://linear.app/acme/issue/ENG-43/no-extras',
          project: null,
          assignee: null,
          updatedAt: '2026-09-11T00:00:00.000Z',
        },
      ]);
    });

    test('getIssue returns the normalized issue shape', async () => {
      const promise = linearService.getIssue('issue-uuid-1');

      mockResponse.emit('data', JSON.stringify({ data: { issue: issueNode } }));
      mockResponse.emit('end');

      const result = await promise;
      expect(result).toEqual(normalizedIssue);

      const body = lastRequestBody();
      expect(body.query).toMatch(/issue\(id:\s*\$id\)/);
      expect(body.variables).toEqual({ id: 'issue-uuid-1' });
    });
  });
});
