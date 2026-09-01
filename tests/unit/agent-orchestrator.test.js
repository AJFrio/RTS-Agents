// Define mocks at top
jest.mock('../../src/main/services/openrouter-service', () => ({
  chat: jest.fn(),
  getModels: jest.fn(),
  setApiKey: jest.fn()
}));
jest.mock('../../src/main/services/config-store', () => ({
  hasApiKey: jest.fn(),
  hasCloudflareConfig: jest.fn(),
  getOrCreateDeviceIdentity: jest.fn(),
  getGithubPaths: jest.fn()
}));
jest.mock('../../src/main/services/cloudflare-kv-service', () => ({
  ensureNamespace: jest.fn(),
  getValueJson: jest.fn()
}));
jest.mock('../../src/main/services/project-service', () => ({
  getLocalRepos: jest.fn(),
  createLocalRepo: jest.fn(),
  pullRepo: jest.fn()
}));
jest.mock('../../src/main/services/github-service', () => ({
  getUserRepos: jest.fn(),
  getPullRequests: jest.fn(),
  getAllPullRequests: jest.fn(),
  getPullRequestDetails: jest.fn(),
  createRepository: jest.fn(),
  mergePullRequest: jest.fn(),
  closePullRequest: jest.fn(),
  markPullRequestReadyForReview: jest.fn()
}));

const TOOLS_ARG = expect.arrayContaining([
  expect.objectContaining({
    type: 'function',
    function: expect.objectContaining({ name: 'list_computers' })
  })
]);

describe('AgentOrchestrator', () => {
  let agentOrchestrator;
  let configStore;
  let openRouterService;
  let cloudflareKvService;
  let projectService;

  beforeEach(() => {
    jest.resetModules();
    agentOrchestrator = require('../../src/main/services/agent-orchestrator');
    configStore = require('../../src/main/services/config-store');
    openRouterService = require('../../src/main/services/openrouter-service');
    cloudflareKvService = require('../../src/main/services/cloudflare-kv-service');
    projectService = require('../../src/main/services/project-service');

    configStore.hasApiKey.mockReturnValue(true);
    configStore.hasCloudflareConfig.mockReturnValue(true);
    configStore.getOrCreateDeviceIdentity.mockReturnValue({ id: 'local-id', name: 'This PC' });
    configStore.getGithubPaths.mockReturnValue(['/repos']);
    projectService.getLocalRepos.mockResolvedValue([
      { name: 'RTS-Agents', path: '/repos/RTS-Agents' }
    ]);
    cloudflareKvService.ensureNamespace.mockResolvedValue('ns-123');
    cloudflareKvService.getValueJson.mockResolvedValue([]);

    openRouterService.getModels.mockResolvedValue([]);
  });

  test('chat sends message to OpenRouter with system prompt and tools', async () => {
    openRouterService.chat.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'Hello!' } }]
    });

    const messages = [{ role: 'user', content: 'Hi' }];
    const result = await agentOrchestrator.chat(messages, 'openrouter/openai/gpt-4o');

    expect(openRouterService.chat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system', content: expect.stringContaining('You are Janus') }),
        { role: 'user', content: 'Hi' }
      ]),
      'openai/gpt-4o',
      TOOLS_ARG
    );
    expect(result.role).toBe('assistant');
    expect(result.content).toBe('Hello!');
    expect(result.toolCalls).toEqual([]);
    expect(result.taskCards).toEqual([]);
  });

  test('chat parses JSON tool call and continues with role:tool', async () => {
    openRouterService.chat.mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: '{"tool": "list_computers", "args": {}}' } }]
    });

    cloudflareKvService.getValueJson.mockResolvedValue([
      { id: 'dev-1', name: 'Dev Machine', status: 'on' }
    ]);

    openRouterService.chat.mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: 'You have one computer.' } }]
    });

    const messages = [{ role: 'user', content: 'List computers' }];
    const result = await agentOrchestrator.chat(messages, 'openrouter/model');

    expect(openRouterService.chat).toHaveBeenNthCalledWith(1, expect.anything(), 'model', TOOLS_ARG);
    expect(cloudflareKvService.getValueJson).toHaveBeenCalled();
    expect(openRouterService.chat).toHaveBeenNthCalledWith(2,
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          tool_call_id: expect.any(String),
          content: expect.stringContaining('dev-1')
        })
      ]),
      'model',
      TOOLS_ARG
    );
    expect(result.role).toBe('assistant');
    expect(result.content).toBe('You have one computer.');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].tool).toBe('list_computers');
    const listed = JSON.parse(result.toolCalls[0].result);
    expect(listed).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'local-id', thisDevice: true, repos: ['RTS-Agents'] }),
      expect.objectContaining({ id: 'dev-1', name: 'Dev Machine', thisDevice: false, repos: [] })
    ]));
    expect(result.taskCards).toEqual([]);
  });

  test('chat prefers native tool_calls over JSON in content', async () => {
    openRouterService.chat.mockResolvedValueOnce({
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'list_computers', arguments: '{}' }
          }]
        }
      }]
    });
    openRouterService.chat.mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: 'Listed.' } }]
    });

    const result = await agentOrchestrator.chat([{ role: 'user', content: 'devices' }], 'openrouter/model');

    expect(openRouterService.chat).toHaveBeenNthCalledWith(2,
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          tool_call_id: 'call_1',
          content: expect.stringContaining('local-id')
        })
      ]),
      'model',
      TOOLS_ARG
    );
    expect(result.content).toBe('Listed.');
    expect(result.toolCalls[0].tool).toBe('list_computers');
  });

  test('chat records task cards and trace for started tasks', async () => {
    const createdTask = { id: 'jules-1', provider: 'jules', name: 'Fix bug', status: 'running' };
    const mockCallback = jest.fn().mockResolvedValue({ success: true, task: createdTask });
    agentOrchestrator.setCreateTaskCallback(mockCallback);

    openRouterService.chat
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content:
                '{"tool": "start_task", "args": {"repo_path": "/repo", "task_description": "Fix bug", "provider": "jules"}}'
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: 'assistant', content: 'Started the task.' } }]
      });

    const result = await agentOrchestrator.chat([{ role: 'user', content: 'Fix the bug in /repo' }], 'openrouter/model');

    expect(result.content).toBe('Started the task.');
    expect(result.taskCards).toEqual([expect.objectContaining({ id: 'jules-1', name: 'Fix bug' })]);
    expect(result.toolCalls).toEqual([
      expect.objectContaining({ tool: 'start_task', args: expect.objectContaining({ repo_path: '/repo' }) })
    ]);
  });

  test('list_computers includes this device without Cloudflare', async () => {
    configStore.hasCloudflareConfig.mockReturnValue(false);

    const result = await agentOrchestrator.executeTool({ tool: 'list_computers', args: {} });

    expect(cloudflareKvService.getValueJson).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        id: 'local-id',
        name: 'This PC',
        status: 'local',
        thisDevice: true,
        repos: ['RTS-Agents']
      })
    ]);
  });

  test('list_repos uses local scan for this device', async () => {
    const result = await agentOrchestrator.executeTool({
      tool: 'list_repos',
      args: { computer_id: 'local' }
    });

    expect(projectService.getLocalRepos).toHaveBeenCalledWith(['/repos']);
    expect(result).toEqual([
      expect.objectContaining({ name: 'RTS-Agents', path: '/repos/RTS-Agents' })
    ]);
  });

  test('list_tasks filters by provider, repo, and status', async () => {
    const listTasksCallback = jest.fn().mockResolvedValue([
      { id: 'jules-1', provider: 'jules', status: 'running', repository: '/repo/a', name: 'A', updatedAt: '2026-01-01' },
      { id: 'codex-2', provider: 'codex', status: 'completed', repository: '/repo/b', name: 'B', updatedAt: '2026-01-02' }
    ]);
    agentOrchestrator.setListTasksCallback(listTasksCallback);

    const result = await agentOrchestrator.executeTool({ tool: 'list_tasks', args: { provider: 'codex' } });

    expect(result).toEqual([
      { id: 'codex-2', provider: 'codex', name: 'B', status: 'completed', repository: '/repo/b', branch: null, summary: null, updatedAt: '2026-01-02' }
    ]);
  });

  test('show_task records a card and returns a summary', async () => {
    const task = {
      id: 'jules-1',
      provider: 'jules',
      name: 'Fix bug',
      status: 'running',
      repository: '/repo/a',
      branch: 'main',
      updatedAt: '2026-01-01'
    };
    agentOrchestrator.setListTasksCallback(jest.fn().mockResolvedValue([task]));

    const taskCards = [];
    const result = await agentOrchestrator.executeTool({ tool: 'show_task', args: { task_id: 'jules-1' } }, taskCards);

    expect(result).toEqual(
      expect.objectContaining({ id: 'jules-1', provider: 'jules', status: 'running', branch: 'main' })
    );
    expect(taskCards).toEqual([expect.objectContaining({ id: 'jules-1', name: 'Fix bug' })]);
  });

  test('show_device records a card without Cloudflare', async () => {
    configStore.hasCloudflareConfig.mockReturnValue(false);
    const cards = [];
    const result = await agentOrchestrator.executeTool({
      tool: 'show_device',
      args: { computer_id: 'local' }
    }, cards);

    expect(result).toEqual(expect.objectContaining({ id: 'local-id', thisDevice: true }));
    expect(cards).toEqual([
      expect.objectContaining({ kind: 'device', id: 'local-id', name: 'This PC' })
    ]);
  });

  test('show_repo records a local repo card', async () => {
    const cards = [];
    const result = await agentOrchestrator.executeTool({
      tool: 'show_repo',
      args: { computer_id: 'local', repo_path: 'RTS-Agents' }
    }, cards);

    expect(result).toEqual(expect.objectContaining({ kind: 'repo', source: 'local', name: 'RTS-Agents' }));
    expect(cards).toEqual([
      expect.objectContaining({ kind: 'repo', path: '/repos/RTS-Agents' })
    ]);
  });

  test('list_pull_requests requires GitHub', async () => {
    configStore.hasApiKey.mockImplementation((provider) => provider === 'openrouter');
    const result = await agentOrchestrator.executeTool({ tool: 'list_pull_requests', args: {} });
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining('GitHub') }));
  });

  test('show_pull_request records a PR card', async () => {
    const githubService = require('../../src/main/services/github-service');
    githubService.getPullRequestDetails.mockResolvedValue({
      number: 12,
      title: 'Fix composer border',
      state: 'open',
      draft: false,
      body: 'Details',
      html_url: 'https://github.com/acme/web/pull/12',
      node_id: 'PR_1',
      created_at: '2026-09-01T00:00:00Z',
      user: { login: 'aj' },
      base: { ref: 'main', repo: { name: 'web', owner: { login: 'acme' }, full_name: 'acme/web' } },
      head: { ref: 'fix', sha: 'abc', repo: { name: 'web', owner: { login: 'acme' } } }
    });

    const cards = [];
    const result = await agentOrchestrator.executeTool({
      tool: 'show_pull_request',
      args: { owner: 'acme', repo: 'web', pr_number: 12 }
    }, cards);

    expect(result).toEqual(expect.objectContaining({ number: 12, title: 'Fix composer border', repo: 'acme/web' }));
    expect(cards).toEqual([
      expect.objectContaining({ kind: 'pr', id: 'pr:acme/web#12', number: 12 })
    ]);
  });

  test('list_tasks surfaces cards and reuses one task-list fetch', async () => {
    const listTasksCallback = jest.fn().mockResolvedValue([
      {
        id: 'jules-1',
        provider: 'jules',
        status: 'running',
        repository: '/repo/a',
        name: 'Fix login',
        branch: 'main',
        updatedAt: '2026-01-02'
      },
      {
        id: 'codex-2',
        provider: 'codex',
        status: 'completed',
        repository: '/repo/b',
        name: 'Done',
        updatedAt: '2026-01-01'
      }
    ]);
    agentOrchestrator.setListTasksCallback(listTasksCallback);

    const cards = [];
    const listed = await agentOrchestrator.executeTool({ tool: 'list_tasks', args: {} }, cards);
    const shown = await agentOrchestrator.executeTool({
      tool: 'show_task',
      args: { task_id: 'jules-1' }
    }, cards);

    expect(listTasksCallback).toHaveBeenCalledTimes(1);
    expect(listed[0]).toEqual(expect.objectContaining({ id: 'jules-1', status: 'running' }));
    expect(shown).toEqual(expect.objectContaining({ id: 'jules-1', branch: 'main' }));
    expect(cards).toEqual([
      expect.objectContaining({ kind: 'task', id: 'jules-1', name: 'Fix login' }),
      expect.objectContaining({ kind: 'task', id: 'codex-2', name: 'Done' })
    ]);
  });

  test('chat answers running-task questions from a peeked snapshot', async () => {
    const peek = jest.fn().mockReturnValue([
      { id: 'jules-1', provider: 'jules', status: 'running', name: 'Fix login', repository: '/repo/a' }
    ]);
    const listTasksCallback = jest.fn().mockResolvedValue([]);
    agentOrchestrator.setListTasksCallback(listTasksCallback, { peek });

    openRouterService.chat.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'Jules is fixing login.' } }]
    });

    const result = await agentOrchestrator.chat(
      [{ role: 'user', content: 'what tasks are running?' }],
      'openrouter/model'
    );

    expect(openRouterService.chat).toHaveBeenCalledTimes(1);
    expect(listTasksCallback).not.toHaveBeenCalled();
    expect(openRouterService.chat.mock.calls[0][0][0].content).toContain('jules-1');
    expect(openRouterService.chat.mock.calls[0][0][0].content).toContain('Fix login');
    expect(result.content).toBe('Jules is fixing login.');
  });

  test('runs independent read tools in parallel', async () => {
    const githubService = require('../../src/main/services/github-service');
    let resolveRepos;
    let resolveGithub;
    projectService.getLocalRepos.mockImplementation(() => new Promise((resolve) => {
      resolveRepos = resolve;
    }));
    githubService.getUserRepos.mockImplementation(() => new Promise((resolve) => {
      resolveGithub = resolve;
    }));

    openRouterService.chat
      .mockResolvedValueOnce({
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              { id: 'c1', type: 'function', function: { name: 'list_computers', arguments: '{}' } },
              { id: 'c2', type: 'function', function: { name: 'list_github_repos', arguments: '{}' } }
            ]
          }
        }]
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: 'assistant', content: 'Listed both.' } }]
      });

    const chatPromise = agentOrchestrator.chat(
      [{ role: 'user', content: 'show devices and github repos' }],
      'openrouter/model'
    );

    for (let i = 0; i < 20 && (!resolveRepos || !resolveGithub); i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(resolveRepos).toEqual(expect.any(Function));
    expect(resolveGithub).toEqual(expect.any(Function));

    resolveRepos([{ name: 'RTS-Agents', path: '/repos/RTS-Agents' }]);
    resolveGithub([{ name: 'web', full_name: 'acme/web', private: false }]);

    const result = await chatPromise;
    expect(result.content).toBe('Listed both.');
    expect(result.toolCalls.map((entry) => entry.tool)).toEqual(['list_computers', 'list_github_repos']);
  });

  test('startTask callback is invoked', async () => {
    const mockCallback = jest.fn().mockResolvedValue({ success: true, task: { id: 't1' } });
    agentOrchestrator.setCreateTaskCallback(mockCallback);

    const args = { computer_id: 'remote-1', repo_path: '/repo', task_description: 'Do it' };
    const result = await agentOrchestrator.executeTool({ tool: 'start_task', args });

    expect(mockCallback).toHaveBeenCalledWith({
      provider: 'jules',
      options: {
        prompt: 'Do it',
        projectPath: '/repo',
        repository: '/repo',
        targetDeviceId: 'remote-1'
      }
    });
    expect(result).toEqual({ success: true, task: { id: 't1' } });
  });

  describe('getAvailableModels', () => {
    test('fetches models from OpenRouter only', async () => {
      configStore.hasApiKey.mockReturnValue(true);

      openRouterService.getModels.mockResolvedValue(['or-1', 'or-2']);

      const result = await agentOrchestrator.getAvailableModels();

      expect(result.errors).toHaveLength(0);
      expect(result.models).toEqual(['or-1', 'or-2']);

      expect(openRouterService.getModels).toHaveBeenCalled();
    });

    test('returns no models when OpenRouter is not configured', async () => {
      configStore.hasApiKey.mockReturnValue(false);

      const result = await agentOrchestrator.getAvailableModels();

      expect(result.models).toEqual([]);
      expect(openRouterService.getModels).not.toHaveBeenCalled();
    });

    test('handles OpenRouter errors gracefully', async () => {
      configStore.hasApiKey.mockReturnValue(true);

      openRouterService.getModels.mockRejectedValue(new Error('Auth failed'));

      const result = await agentOrchestrator.getAvailableModels();

      expect(result.models).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({ provider: 'openrouter', error: 'Auth failed' });
    });
  });
});
