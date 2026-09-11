const configStore = require('./config-store');
const cloudflareKvService = require('./cloudflare-kv-service');
const antigravityService = require('./antigravity-service');
const claudeService = require('./claude-service');
const codexService = require('./codex-service');
const cursorService = require('./cursor-service');
const opencodeService = require('./opencode-service');
const projectService = require('./project-service');
const { isCommandRunnable } = require('../utils/cli-spawn');

class QueueProcessorService {
  constructor() {
    this.isProcessing = false;
  }

  isCommandRunnable(cmd) {
    return isCommandRunnable(cmd, ['--version'], { timeout: 2000 });
  }

  /**
   * Mirror a remote-queue run into the shared KV run log so any device
   * (desktop or web) can view runs across cloud and local devices. Failures
   * here must never break queue processing.
   */
  async _upsertRun(namespaceId, identity, { item, status, extra } = {}) {
    try {
      const nowIso = new Date().toISOString();
      await cloudflareKvService.upsertRun(namespaceId, {
        id: `remote:${item?.id || `${identity.id}:${nowIso}`}`,
        remoteTaskId: item?.id || null,
        deviceId: identity.id,
        deviceName: identity.name,
        provider: item?.tool || null,
        name: item?.prompt ? String(item.prompt).substring(0, 80) : 'Remote task',
        status,
        repo: item?.repo?.path || null,
        branch: item?.branch || null,
        requestedBy: item?.requestedBy || null,
        ...(extra || {}),
        updatedAt: nowIso,
      });
    } catch (err) {
      console.warn('Run log upsert failed:', err?.message || err);
    }
  }

  async processQueue(namespaceId) {
    if (!namespaceId) return;
    if (!configStore.hasCloudflareConfig()) return;
    if (this.isProcessing) return;

    this.isProcessing = true;
    const identity = configStore.getOrCreateDeviceIdentity();
    const nowIso = new Date().toISOString();
    let currentItem = null;

    try {
      const queue = await cloudflareKvService.getDeviceQueue(namespaceId, identity.id);
      if (!Array.isArray(queue) || queue.length === 0) return;

      // Process a single item per tick
      const item = queue[0];
      const rest = queue.slice(1);
      currentItem = item;

      await cloudflareKvService.putDeviceQueue(namespaceId, identity.id, rest);

      const baseStatus = {
        status: 'starting',
        tool: item?.tool || null,
        repo: item?.repo || null,
        prompt: item?.prompt || null,
        requestedBy: item?.requestedBy || null,
        taskRequestId: item?.id || null,
        device: { id: identity.id, name: identity.name },
        updatedAt: nowIso,
      };

      await cloudflareKvService.setDeviceTaskStatus(namespaceId, identity.id, baseStatus);
      await this._upsertRun(namespaceId, identity, {
        item,
        status: 'starting',
        extra: { createdAt: nowIso },
      });

      const tool = item?.tool;
      if (!tool) throw new Error('Queued task missing tool');

      // Project/repo creation tasks
      if (tool === 'project:create') {
        const repoName = item?.repo?.name || item?.repoName || item?.name;
        if (!repoName) throw new Error('Queued task missing repo.name');

        const githubPaths = configStore.getGithubPaths();
        const baseDir =
          Array.isArray(githubPaths) && githubPaths.length > 0 ? githubPaths[0] : null;
        if (!baseDir) {
          throw new Error('No GitHub repository paths configured on target device');
        }

        await cloudflareKvService.setDeviceTaskStatus(namespaceId, identity.id, {
          ...baseStatus,
          status: 'running',
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        const createdPath = await projectService.createLocalRepo({
          directory: baseDir,
          name: String(repoName),
        });

        await this._upsertRun(namespaceId, identity, {
          item,
          status: 'completed',
          extra: {
            createdAt: nowIso,
            result: { path: createdPath, directory: baseDir, name: String(repoName) },
            completedAt: new Date().toISOString(),
          },
        });

        await cloudflareKvService.setDeviceTaskStatus(namespaceId, identity.id, {
          ...baseStatus,
          status: 'completed',
          result: { path: createdPath, directory: baseDir, name: String(repoName) },
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        return;
      }

      const repoPath = item?.repo?.path;
      const prompt = item?.prompt;
      const attachments = item?.attachments || [];

      if (!prompt) throw new Error('Queued task missing prompt');
      if (!repoPath) throw new Error('Queued task missing repo.path');

      // autoCreatePr: the agent itself lands the work when it finishes.
      const dispatchPrompt =
        item.autoCreatePr === true
          ? `${prompt}\n\nWhen the task is complete: commit your changes, push the branch to the remote, open a pull request targeting "${item.branch || 'main'}", and merge it.`
          : prompt;

      const cliCommands = configStore.getSetting('cliCommands') || {};
      const antigravityCmd =
        typeof cliCommands?.antigravity === 'string' ? cliCommands.antigravity : '';
      const claudeCmd = typeof cliCommands?.claude === 'string' ? cliCommands.claude : '';
      const codexCmd = typeof cliCommands?.codex === 'string' ? cliCommands.codex : '';
      const opencodeCmd = typeof cliCommands?.opencode === 'string' ? cliCommands.opencode : '';

      let started;
      if (tool === 'antigravity') {
        if (
          !(await antigravityService.isAntigravityInstalled()) &&
          !this.isCommandRunnable(antigravityCmd || 'agy')
        ) {
          throw new Error('Antigravity CLI not detected on target device');
        }
        started = await antigravityService.startSession({
          prompt: dispatchPrompt,
          projectPath: repoPath,
          command: antigravityCmd || undefined,
          model: item?.model || undefined,
        });
      } else if (tool === 'claude-cli') {
        if (!claudeService.isClaudeInstalled() && !this.isCommandRunnable(claudeCmd || 'claude')) {
          throw new Error('Claude CLI not detected on target device');
        }
        started = await claudeService.startLocalSession({
          prompt: dispatchPrompt,
          projectPath: repoPath,
          command: claudeCmd || undefined,
          model: item?.model || undefined,
        });
      } else if (tool === 'codex') {
        if (
          !(await codexService.isCodexInstalled()) &&
          !this.isCommandRunnable(codexCmd || 'codex')
        ) {
          throw new Error('Codex CLI not detected on target device');
        }
        started = await codexService.startSession({
          prompt: dispatchPrompt,
          projectPath: repoPath,
          command: codexCmd || undefined,
          attachments,
          model: item?.model || undefined,
        });
        configStore.setCodexThreads(codexService.getTrackedThreads());
      } else if (tool === 'opencode') {
        if (
          !(await opencodeService.isOpenCodeInstalled()) &&
          !this.isCommandRunnable(opencodeCmd || 'opencode')
        ) {
          throw new Error('OpenCode CLI not detected on target device');
        }
        started = await opencodeService.startSession({
          prompt: dispatchPrompt,
          projectPath: repoPath,
          command: opencodeCmd || undefined,
          model: item?.model || undefined,
        });
        configStore.setOpenCodeSessions(opencodeService.getTrackedSessions());
      } else if (tool === 'cursor') {
        if (!cursorService.isCursorCliAvailable()) {
          throw new Error('Cursor CLI not detected on target device');
        }
        started = await cursorService.startCliSession({
          prompt: dispatchPrompt,
          projectPath: repoPath,
          model: item?.model || undefined,
        });
        configStore.setCursorCliSessions(cursorService.getCursorCliSessions());
      } else {
        throw new Error(`Unsupported queued tool: ${tool}`);
      }

      await this._upsertRun(namespaceId, identity, {
        item,
        status: 'running',
        extra: { createdAt: nowIso, startedAt: new Date().toISOString() },
      });
      await cloudflareKvService.setDeviceTaskStatus(namespaceId, identity.id, {
        ...baseStatus,
        status: 'running',
        startedAt: new Date().toISOString(),
        startedTask: started || null,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      await this._upsertRun(namespaceId, identity, {
        item: currentItem,
        status: 'failed',
        extra: {
          createdAt: nowIso,
          error: err?.message || String(err),
          completedAt: new Date().toISOString(),
        },
      });
      await cloudflareKvService.setDeviceTaskStatus(namespaceId, identity.id, {
        status: 'error',
        error: err?.message || String(err),
        device: { id: identity.id, name: identity.name },
        updatedAt: new Date().toISOString(),
      });
    } finally {
      this.isProcessing = false;
    }
  }
}

module.exports = new QueueProcessorService();
