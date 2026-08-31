// Define mocks at top
jest.mock('../../src/main/services/openrouter-service', () => ({
  chat: jest.fn(),
  getModels: jest.fn(),
  setApiKey: jest.fn()
}));
jest.mock('../../src/main/services/config-store', () => ({
  hasApiKey: jest.fn(),
  hasCloudflareConfig: jest.fn(),
  getOrCreateDeviceIdentity: jest.fn()
}));
jest.mock('../../src/main/services/cloudflare-kv-service', () => ({
  ensureNamespace: jest.fn(),
  getValueJson: jest.fn()
}));

describe('AgentOrchestrator', () => {
  let agentOrchestrator;
  let configStore;
  let openRouterService;
  let cloudflareKvService;

  beforeEach(() => {
    jest.resetModules();
    agentOrchestrator = require('../../src/main/services/agent-orchestrator');
    configStore = require('../../src/main/services/config-store');
    openRouterService = require('../../src/main/services/openrouter-service');
    cloudflareKvService = require('../../src/main/services/cloudflare-kv-service');

    configStore.hasApiKey.mockReturnValue(true);
    configStore.hasCloudflareConfig.mockReturnValue(true);
    cloudflareKvService.ensureNamespace.mockResolvedValue('ns-123');
    cloudflareKvService.getValueJson.mockResolvedValue([]);

    openRouterService.getModels.mockResolvedValue([]);
  });

  test('chat sends message to OpenRouter with system prompt', async () => {
    openRouterService.chat.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'Hello!' } }]
    });

    const messages = [{ role: 'user', content: 'Hi' }];
    const result = await agentOrchestrator.chat(messages, 'openrouter/openai/gpt-4o');

    expect(openRouterService.chat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        { role: 'user', content: 'Hi' }
      ]),
      'openai/gpt-4o'
    );
    expect(result.role).toBe('assistant');
    expect(result.content).toBe('Hello!');
    expect(result.toolCalls).toEqual([]);
    expect(result.taskCards).toEqual([]);
  });

  test('chat parses tool call and executes it', async () => {
    // First call returns tool call
    openRouterService.chat.mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: '{"tool": "list_computers", "args": {}}' } }]
    });

    // Mock tool execution result
    cloudflareKvService.getValueJson.mockResolvedValue([
      { id: 'dev-1', name: 'Dev Machine', status: 'on' }
    ]);

    // Second call (recursion) returns final answer
    openRouterService.chat.mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: 'You have one computer.' } }]
    });

    const messages = [{ role: 'user', content: 'List computers' }];
    const result = await agentOrchestrator.chat(messages, 'openrouter/model');

    expect(openRouterService.chat).toHaveBeenNthCalledWith(1, expect.anything(), 'model');
    expect(cloudflareKvService.getValueJson).toHaveBeenCalled();
    expect(openRouterService.chat).toHaveBeenNthCalledWith(2,
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: expect.stringContaining('Tool \'list_computers\' Output') })
      ]),
      'model'
    );
    expect(result.role).toBe('assistant');
    expect(result.content).toBe('You have one computer.');
    expect(result.toolCalls).toEqual([
      {
        tool: 'list_computers',
        args: {},
        result: JSON.stringify([{ id: 'dev-1', name: 'Dev Machine', status: 'on', repos: [] }])
      }
    ]);
    expect(result.taskCards).toEqual([]);
  });

  test('chat records task cards and trace for started tasks', async () => {
    const createdTask = { id: 'jules-1', provider: 'jules', name: 'Fix bug', status: 'running' };
    const mockCallback = jest.fn().mockResolvedValue({ success: true, task: createdTask });
    agentOrchestrator.setCreateTaskCallback(mockCallback);
    configStore.getOrCreateDeviceIdentity.mockReturnValue({ id: 'local-id' });

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

  test('list_tasks filters by provider, repo, and status', async () => {
    const listTasksCallback = jest.fn().mockResolvedValue([
      { id: 'jules-1', provider: 'jules', status: 'running', repository: '/repo/a', name: 'A', updatedAt: '2026-01-01' },
      { id: 'codex-2', provider: 'codex', status: 'completed', repository: '/repo/b', name: 'B', updatedAt: '2026-01-02' }
    ]);
    agentOrchestrator.setListTasksCallback(listTasksCallback);

    const result = await agentOrchestrator.executeTool({ tool: 'list_tasks', args: { provider: 'codex' } });

    expect(result).toEqual([
      { id: 'codex-2', provider: 'codex', name: 'B', status: 'completed', repository: '/repo/b', updatedAt: '2026-01-02' }
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

  test('startTask callback is invoked', async () => {
    const mockCallback = jest.fn().mockResolvedValue({ success: true, task: { id: 't1' } });
    agentOrchestrator.setCreateTaskCallback(mockCallback);
    configStore.getOrCreateDeviceIdentity.mockReturnValue({ id: 'local-id' });

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
      // Setup
      configStore.hasApiKey.mockReturnValue(true);

      openRouterService.getModels.mockResolvedValue(['or-1', 'or-2']);

      // Execute
      const result = await agentOrchestrator.getAvailableModels();

      // Verify
      expect(result.errors).toHaveLength(0);
      expect(result.models).toEqual(['or-1', 'or-2']);

      expect(openRouterService.getModels).toHaveBeenCalled();
    });

    test('returns no models when OpenRouter is not configured', async () => {
      configStore.hasApiKey.mockReturnValue(false);

      // Execute
      const result = await agentOrchestrator.getAvailableModels();

      // Verify
      expect(result.models).toEqual([]);
      expect(openRouterService.getModels).not.toHaveBeenCalled();
    });

    test('handles OpenRouter errors gracefully', async () => {
      // Setup
      configStore.hasApiKey.mockReturnValue(true);

      openRouterService.getModels.mockRejectedValue(new Error('Auth failed'));

      // Execute
      const result = await agentOrchestrator.getAvailableModels();

      // Verify
      expect(result.models).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({ provider: 'openrouter', error: 'Auth failed' });
    });
  });
});
