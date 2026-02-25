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
jest.mock('../../src/main/services/codex-service', () => ({
  getModels: jest.fn()
}));
jest.mock('../../src/main/services/claude-service', () => ({
  getModels: jest.fn()
}));
jest.mock('../../src/main/services/gemini-service', () => ({
  getModels: jest.fn()
}));

describe('AgentOrchestrator', () => {
  let agentOrchestrator;
  let configStore;
  let openRouterService;
  let cloudflareKvService;
  let codexService;
  let claudeService;
  let geminiService;

  beforeEach(() => {
    jest.resetModules();
    agentOrchestrator = require('../../src/main/services/agent-orchestrator');
    configStore = require('../../src/main/services/config-store');
    openRouterService = require('../../src/main/services/openrouter-service');
    cloudflareKvService = require('../../src/main/services/cloudflare-kv-service');
    codexService = require('../../src/main/services/codex-service');
    claudeService = require('../../src/main/services/claude-service');
    geminiService = require('../../src/main/services/gemini-service');

    configStore.hasApiKey.mockReturnValue(true);
    configStore.hasCloudflareConfig.mockReturnValue(true);
    cloudflareKvService.ensureNamespace.mockResolvedValue('ns-123');
    cloudflareKvService.getValueJson.mockResolvedValue([]);

    // Default mocks for model services
    openRouterService.getModels.mockResolvedValue([]);
    codexService.getModels.mockResolvedValue([]);
    claudeService.getModels.mockResolvedValue([]);
    geminiService.getModels.mockResolvedValue([]);
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
    expect(result).toEqual({ role: 'assistant', content: 'Hello!' });
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
    expect(result).toEqual({ role: 'assistant', content: 'You have one computer.' });
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
    test('fetches models from all configured providers', async () => {
      // Setup
      configStore.hasApiKey.mockReturnValue(true);

      openRouterService.getModels.mockResolvedValue(['or-1', 'or-2']);
      codexService.getModels.mockResolvedValue(['cx-1']);
      claudeService.getModels.mockResolvedValue(['cl-1']);
      geminiService.getModels.mockResolvedValue(['gm-1']);

      // Execute
      const result = await agentOrchestrator.getAvailableModels();

      // Verify
      expect(result.errors).toHaveLength(0);
      expect(result.models).toHaveLength(5);
      expect(result.models).toEqual(expect.arrayContaining(['or-1', 'or-2', 'cx-1', 'cl-1', 'gm-1']));

      expect(openRouterService.getModels).toHaveBeenCalled();
      expect(codexService.getModels).toHaveBeenCalled();
      expect(claudeService.getModels).toHaveBeenCalled();
      expect(geminiService.getModels).toHaveBeenCalled();
    });

    test('only calls configured providers', async () => {
      // Setup: Only OpenRouter configured
      configStore.hasApiKey.mockImplementation((key) => key === 'openrouter');

      openRouterService.getModels.mockResolvedValue(['or-1']);

      // Execute
      const result = await agentOrchestrator.getAvailableModels();

      // Verify
      expect(result.models).toEqual(['or-1']);
      expect(openRouterService.getModels).toHaveBeenCalled();
      expect(codexService.getModels).not.toHaveBeenCalled();
      expect(claudeService.getModels).not.toHaveBeenCalled();
      expect(geminiService.getModels).not.toHaveBeenCalled();
    });

    test('handles provider errors gracefully', async () => {
      // Setup
      configStore.hasApiKey.mockReturnValue(true);

      openRouterService.getModels.mockResolvedValue(['or-1']);
      codexService.getModels.mockRejectedValue(new Error('Auth failed'));
      claudeService.getModels.mockResolvedValue(['cl-1']);
      geminiService.getModels.mockResolvedValue(['gm-1']);

      // Execute
      const result = await agentOrchestrator.getAvailableModels();

      // Verify
      expect(result.models).toEqual(expect.arrayContaining(['or-1', 'cl-1', 'gm-1']));
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({ provider: 'openai', error: 'Auth failed' });
    });
  });
});
