const { spawnSync } = require('child_process');
const configStore = require('./config-store');
const cloudflareKvService = require('./cloudflare-kv-service');
const geminiService = require('./gemini-service');
const claudeService = require('./claude-service');
const codexService = require('./codex-service');
const projectService = require('./project-service');

class QueueProcessorService {
  constructor() {
    this.isProcessing = false;
  }

  isCommandRunnable(cmd) {
    if (!cmd) return false;
    try {
      const res = spawnSync(String(cmd), ['--version'], {
        shell: true,
        stdio: 'ignore',
        timeout: 2000,
        windowsHide: true
      });
      if (res.error) return false;
      return res.status === 0;
    } catch {
      return false;
    }
  }

  async processQueue(namespaceId) {
    if (!namespaceId) return;
    if (!configStore.hasCloudflareConfig()) return;
    if (this.isProcessing) return;

    this.isProcessing = true;
    const identity = configStore.getOrCreateDeviceIdentity();
    const nowIso = new Date().toISOString();

    try {
      const queue = await cloudflareKvService.getDeviceQueue(namespaceId, identity.id);
      if (!Array.isArray(queue) || queue.length === 0) return;

      // Process a single item per tick
      const item = queue[0];
      const rest = queue.slice(1);

      await cloudflareKvService.putDeviceQueue(namespaceId, identity.id, rest);

      const baseStatus = {
        status: 'starting',
        tool: item?.tool || null,
        repo: item?.repo || null,
        prompt: item?.prompt || null,
        requestedBy: item?.requestedBy || null,
        taskRequestId: item?.id || null,
        device: { id: identity.id, name: identity.name },
        updatedAt: nowIso
      };

      await cloudflareKvService.setDeviceTaskStatus(namespaceId, identity.id, baseStatus);

      const tool = item?.tool;
      if (!tool) throw new Error('Queued task missing tool');

      // Project/repo creation tasks
      if (tool === 'project:create') {
        const repoName = item?.repo?.name || item?.repoName || item?.name;
        if (!repoName) throw new Error('Queued task missing repo.name');

        const githubPaths = configStore.getGithubPaths();
        const baseDir = Array.isArray(githubPaths) && githubPaths.length > 0 ? githubPaths[0] : null;
        if (!baseDir) {
          throw new Error('No GitHub repository paths configured on target device');
        }

        await cloudflareKvService.setDeviceTaskStatus(namespaceId, identity.id, {
          ...baseStatus,
          status: 'running',
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        const createdPath = await projectService.createLocalRepo({ directory: baseDir, name: String(repoName) });

        await cloudflareKvService.setDeviceTaskStatus(namespaceId, identity.id, {
          ...baseStatus,
          status: 'completed',
          result: { path: createdPath, directory: baseDir, name: String(repoName) },
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        return;
      }

      const repoPath = item?.repo?.path;
      const prompt = item?.prompt;
      const attachments = item?.attachments || [];

      if (!prompt) throw new Error('Queued task missing prompt');
      if (!repoPath) throw new Error('Queued task missing repo.path');

      const cliCommands = configStore.getSetting('cliCommands') || {};
      const geminiCmd = typeof cliCommands?.gemini === 'string' ? cliCommands.gemini : '';
      const claudeCmd = typeof cliCommands?.claude === 'string' ? cliCommands.claude : '';

      let started;
      if (tool === 'gemini') {
        if (!geminiService.isGeminiInstalled() && !this.isCommandRunnable(geminiCmd || 'gemini')) {
          throw new Error('Gemini CLI not detected on target device');
        }
        started = await geminiService.startSession({
            prompt,
            projectPath: repoPath,
            command: geminiCmd || undefined
        });
      } else if (tool === 'claude-cli') {
        if (!claudeService.isClaudeInstalled() && !this.isCommandRunnable(claudeCmd || 'claude')) {
          throw new Error('Claude CLI not detected on target device');
        }
        started = await claudeService.startLocalSession({
            prompt,
            projectPath: repoPath,
            command: claudeCmd || undefined
        });
      } else if (tool === 'codex') {
        if (!configStore.hasApiKey('codex')) throw new Error('Codex API key not configured on target device');

        started = await codexService.createTask({
          prompt,
          repository: repoPath,
          title: prompt.substring(0, 50),
          attachments: attachments
        });
        configStore.setCodexThreads(codexService.getTrackedThreads());
      } else {
        throw new Error(`Unsupported queued tool: ${tool}`);
      }

      await cloudflareKvService.setDeviceTaskStatus(namespaceId, identity.id, {
        ...baseStatus,
        status: 'running',
        startedAt: new Date().toISOString(),
        startedTask: started || null,
        updatedAt: new Date().toISOString()
      });

    } catch (err) {
      await cloudflareKvService.setDeviceTaskStatus(namespaceId, identity.id, {
        status: 'error',
        error: err?.message || String(err),
        device: { id: identity.id, name: identity.name },
        updatedAt: new Date().toISOString()
      });
    } finally {
      this.isProcessing = false;
    }
  }
}

module.exports = new QueueProcessorService();
