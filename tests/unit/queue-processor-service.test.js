// Explicitly mock the services to ensure they have the expected methods
jest.mock('../../src/main/services/config-store', () => ({
  hasCloudflareConfig: jest.fn(),
  getOrCreateDeviceIdentity: jest.fn(),
  getCloudflareConfig: jest.fn(),
  setCloudflareConfig: jest.fn(),
  getGithubPaths: jest.fn(),
  getSetting: jest.fn(),
  hasApiKey: jest.fn(),
  setCodexThreads: jest.fn(),
}));

jest.mock('../../src/main/services/cloudflare-kv-service', () => ({
  getDeviceQueue: jest.fn(),
  putDeviceQueue: jest.fn(),
  setDeviceTaskStatus: jest.fn(),
}));

jest.mock('../../src/main/services/gemini-service', () => ({
  isGeminiInstalled: jest.fn(),
  startSession: jest.fn(),
}));

jest.mock('../../src/main/services/claude-service', () => ({
  isClaudeInstalled: jest.fn(),
  startLocalSession: jest.fn(),
}));

jest.mock('../../src/main/services/codex-service', () => ({
  createTask: jest.fn(),
  getTrackedThreads: jest.fn(),
}));

jest.mock('../../src/main/services/project-service', () => ({
  createLocalRepo: jest.fn(),
}));

jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
  exec: jest.fn(),
  spawn: jest.fn()
}));

const queueProcessorService = require('../../src/main/services/queue-processor-service');
const { spawnSync } = require('child_process');
const configStore = require('../../src/main/services/config-store');
const cloudflareKvService = require('../../src/main/services/cloudflare-kv-service');
const geminiService = require('../../src/main/services/gemini-service');
const claudeService = require('../../src/main/services/claude-service');
const codexService = require('../../src/main/services/codex-service');
const projectService = require('../../src/main/services/project-service');

describe('QueueProcessorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queueProcessorService.isProcessing = false;

    // Default mocks
    configStore.hasCloudflareConfig.mockReturnValue(true);
    configStore.getOrCreateDeviceIdentity.mockReturnValue({ id: 'device1', name: 'Test Device' });
    cloudflareKvService.getDeviceQueue.mockResolvedValue([]);
    spawnSync.mockReturnValue({ status: 0 }); // Default successful command execution
  });

  describe('isCommandRunnable', () => {
    it('should return true for successful command', () => {
      spawnSync.mockReturnValue({ status: 0 });
      expect(queueProcessorService.isCommandRunnable('git')).toBe(true);
    });

    it('should return false for failed command', () => {
        spawnSync.mockReturnValue({ status: 1 });
        expect(queueProcessorService.isCommandRunnable('git')).toBe(false);
    });

    it('should return false on error', () => {
        spawnSync.mockReturnValue({ error: new Error('fail') });
        expect(queueProcessorService.isCommandRunnable('git')).toBe(false);
    });
  });

  describe('processQueue', () => {
    it('should do nothing if namespaceId is missing', async () => {
      await queueProcessorService.processQueue(null);
      expect(cloudflareKvService.getDeviceQueue).not.toHaveBeenCalled();
    });

    it('should do nothing if already processing', async () => {
      queueProcessorService.isProcessing = true;
      await queueProcessorService.processQueue('ns1');
      expect(cloudflareKvService.getDeviceQueue).not.toHaveBeenCalled();
    });

    it('should process project:create task', async () => {
      const task = { tool: 'project:create', repo: { name: 'new-repo' } };
      cloudflareKvService.getDeviceQueue.mockResolvedValue([task]);
      configStore.getGithubPaths.mockReturnValue(['/tmp/github']);
      projectService.createLocalRepo.mockResolvedValue('/tmp/github/new-repo');

      await queueProcessorService.processQueue('ns1');

      expect(projectService.createLocalRepo).toHaveBeenCalledWith({ directory: '/tmp/github', name: 'new-repo' });
      expect(cloudflareKvService.setDeviceTaskStatus).toHaveBeenCalledWith(
        'ns1',
        'device1',
        expect.objectContaining({ status: 'completed' })
      );
    });

    it('should process gemini task', async () => {
      const task = { tool: 'gemini', repo: { path: '/path/to/repo' }, prompt: 'test prompt' };
      cloudflareKvService.getDeviceQueue.mockResolvedValue([task]);
      geminiService.isGeminiInstalled.mockReturnValue(true);
      geminiService.startSession.mockResolvedValue({ id: 'session1' });

      await queueProcessorService.processQueue('ns1');

      expect(geminiService.startSession).toHaveBeenCalledWith({
        prompt: 'test prompt',
        projectPath: '/path/to/repo',
        command: undefined
      });
    });

    it('should process claude-cli task', async () => {
      const task = { tool: 'claude-cli', repo: { path: '/path/to/repo' }, prompt: 'test prompt' };
      cloudflareKvService.getDeviceQueue.mockResolvedValue([task]);
      claudeService.isClaudeInstalled.mockReturnValue(true);
      claudeService.startLocalSession.mockResolvedValue({ id: 'session1' });

      await queueProcessorService.processQueue('ns1');

      expect(claudeService.startLocalSession).toHaveBeenCalledWith({
        prompt: 'test prompt',
        projectPath: '/path/to/repo',
        command: undefined
      });
    });

    it('should process codex task', async () => {
      const task = { tool: 'codex', repo: { path: '/path/to/repo' }, prompt: 'test prompt', attachments: [] };
      cloudflareKvService.getDeviceQueue.mockResolvedValue([task]);
      configStore.hasApiKey.mockReturnValue(true);
      codexService.createTask.mockResolvedValue({ id: 'task1' });

      await queueProcessorService.processQueue('ns1');

      expect(codexService.createTask).toHaveBeenCalledWith({
        prompt: 'test prompt',
        repository: '/path/to/repo',
        title: expect.any(String),
        attachments: []
      });
    });

    it('should handle unsupported tool', async () => {
      const task = { tool: 'unknown', repo: { path: '/path' }, prompt: 'test' };
      cloudflareKvService.getDeviceQueue.mockResolvedValue([task]);

      await queueProcessorService.processQueue('ns1');

      expect(cloudflareKvService.setDeviceTaskStatus).toHaveBeenCalledWith(
        'ns1',
        'device1',
        expect.objectContaining({ status: 'error', error: expect.stringContaining('Unsupported queued tool') })
      );
    });
  });
});
