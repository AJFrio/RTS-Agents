jest.mock('../../src/main/services/config-store', () => ({
  hasApiKey: jest.fn(() => false),
}));

jest.mock('../../src/main/services/acp-service', () => ({
  buildSpawnArgs: jest.fn((command, args) => ({ command, args })),
  resolveAdapter: jest.fn(() => null),
}));

jest.mock('../../src/main/services/opencode-service', () => ({
  getExecutable: jest.fn(() => 'opencode'),
}));

jest.mock('../../src/main/services/antigravity-service', () => ({
  getExecutable: jest.fn(() => 'agy'),
}));

jest.mock('../../src/main/services/cursor-service', () => ({
  listModels: jest.fn(),
}));

jest.mock('../../src/main/services/codex-service', () => ({
  listModels: jest.fn(),
}));

jest.mock('../../src/main/services/claude-service', () => ({
  listModels: jest.fn(),
}));

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn(),
}));

const { spawn } = require('child_process');
const configStore = require('../../src/main/services/config-store');
const acpService = require('../../src/main/services/acp-service');
const cursorService = require('../../src/main/services/cursor-service');
const codexService = require('../../src/main/services/codex-service');
const claudeService = require('../../src/main/services/claude-service');
const modelRegistry = require('../../src/main/services/model-registry');

function fakeCliChild(stdoutText, closeCode = 0) {
  return {
    stdout: {
      on: (event, handler) => {
        if (event === 'data') setImmediate(() => handler(Buffer.from(stdoutText)));
      },
    },
    stderr: { on: jest.fn() },
    on: (event, handler) => {
      if (event === 'close') setImmediate(() => handler(closeCode));
    },
  };
}

describe('model-registry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configStore.hasApiKey.mockReturnValue(false);
    acpService.resolveAdapter.mockReturnValue(null);
    modelRegistry.clearModelCache();
  });

  test('parses opencode models CLI output into provider/model ids', async () => {
    spawn.mockImplementation(() =>
      fakeCliChild('anthropic/claude-sonnet-4-5  latest\nopenai/gpt-5.2\n\ngoogle/gemini-3-pro\n')
    );

    const result = await modelRegistry.getModelsForProvider('opencode');

    expect(result.success).toBe(true);
    expect(result.source).toBe('cli');
    expect(result.models).toEqual([
      'anthropic/claude-sonnet-4-5',
      'openai/gpt-5.2',
      'google/gemini-3-pro',
    ]);
    expect(spawn).toHaveBeenCalledWith(
      'opencode',
      ['models'],
      expect.objectContaining({ shell: false, timeout: expect.any(Number) })
    );
  });

  test('parses antigravity models CLI output', async () => {
    spawn.mockImplementation(() =>
      fakeCliChild('gemini-3.7-flash-high\nclaude-sonnet-4-6\n')
    );

    const result = await modelRegistry.getModelsForProvider('antigravity');

    expect(result.success).toBe(true);
    expect(result.source).toBe('cli');
    expect(result.models).toEqual(['gemini-3.7-flash-high', 'claude-sonnet-4-6']);
  });

  test('returns the documented alias list for claude-cli', async () => {
    const result = await modelRegistry.getModelsForProvider('claude-cli');

    expect(result.success).toBe(true);
    expect(result.source).toBe('static');
    expect(result.models).toContain('sonnet');
    expect(result.models).toContain('opus');
    expect(result.models).toContain('default');
    expect(spawn).not.toHaveBeenCalled();
  });

  test('lists codex models via the OpenAI API when a key is configured', async () => {
    configStore.hasApiKey.mockImplementation((id) => id === 'codex');
    codexService.listModels.mockResolvedValue({
      data: [{ id: 'gpt-5.2' }, { id: 'gpt-5.2-codex' }],
    });

    const result = await modelRegistry.getModelsForProvider('codex');

    expect(result.success).toBe(true);
    expect(result.source).toBe('api');
    expect(result.models).toEqual(['gpt-5.2', 'gpt-5.2-codex']);
  });

  test('returns no codex models without an API key', async () => {
    const result = await modelRegistry.getModelsForProvider('codex');

    expect(result.models).toEqual([]);
    expect(result.source).toBe('none');
    expect(codexService.listModels).not.toHaveBeenCalled();
  });

  test('normalizes cursor cloud model payloads when a key is configured', async () => {
    configStore.hasApiKey.mockImplementation((id) => id === 'cursor');
    cursorService.listModels.mockResolvedValue({
      models: [{ name: 'gpt-5' }, { slug: 'composer' }, { id: 'claude-sonnet-4-6' }],
    });

    const result = await modelRegistry.getModelsForProvider('cursor');

    expect(result.success).toBe(true);
    expect(result.source).toBe('api');
    expect(result.models).toEqual(['gpt-5', 'composer', 'claude-sonnet-4-6']);
    expect(acpService.resolveAdapter).not.toHaveBeenCalled();
  });

  test('falls back to the cursor CLI model list without an API key', async () => {
    acpService.resolveAdapter.mockReturnValue('agent');
    spawn.mockImplementation(() => fakeCliChild('gpt-5\nclaude-opus-4-8\n'));

    const result = await modelRegistry.getModelsForProvider('cursor');

    expect(result.success).toBe(true);
    expect(result.source).toBe('cli');
    expect(result.models).toEqual(['gpt-5', 'claude-opus-4-8']);
    expect(spawn).toHaveBeenCalledWith('agent', ['models'], expect.anything());
  });

  test('lists claude cloud models via the Anthropic API when a key is configured', async () => {
    configStore.hasApiKey.mockImplementation((id) => id === 'claude');
    claudeService.listModels.mockResolvedValue({
      data: [{ id: 'claude-sonnet-5' }, { id: 'claude-opus-5' }],
    });

    const result = await modelRegistry.getModelsForProvider('claude-cloud');

    expect(result.success).toBe(true);
    expect(result.source).toBe('api');
    expect(result.models).toEqual(['claude-sonnet-5', 'claude-opus-5']);
  });

  test('returns no models for providers without model selection', async () => {
    const result = await modelRegistry.getModelsForProvider('jules');

    expect(result.success).toBe(true);
    expect(result.models).toEqual([]);
    expect(result.source).toBe('none');
  });

  test('caches successful listings until the cache is cleared', async () => {
    spawn.mockImplementation(() => fakeCliChild('anthropic/claude-sonnet-4-5\n'));

    await modelRegistry.getModelsForProvider('opencode');
    await modelRegistry.getModelsForProvider('opencode');

    expect(spawn).toHaveBeenCalledTimes(1);

    modelRegistry.clearModelCache();
    await modelRegistry.getModelsForProvider('opencode');

    expect(spawn).toHaveBeenCalledTimes(2);
  });

  test('reports failure without caching when the CLI list command fails', async () => {
    spawn.mockImplementation(() => fakeCliChild('boom', 1));

    const result = await modelRegistry.getModelsForProvider('opencode');

    expect(result.success).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.error).toBeTruthy();

    spawn.mockImplementation(() => fakeCliChild('openai/gpt-5.2\n'));
    const retried = await modelRegistry.getModelsForProvider('opencode');

    expect(retried.success).toBe(true);
    expect(retried.models).toEqual(['openai/gpt-5.2']);
  });
});
