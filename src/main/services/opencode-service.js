const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const configStore = require('./config-store');
const projectService = require('./project-service');
const { pathExists, pathExistsAny } = require('../utils/path-exists');
const installStatus = require('../utils/install-status');
const providerHealth = require('./provider-health');

const STDERR_CAP = 2000;

function isCommandRunnable(cmd) {
  if (!cmd) return false;
  try {
    const r = spawnSync(String(cmd), ['--version'], {
      shell: false,
      stdio: 'ignore',
      timeout: 2000,
      windowsHide: true,
    });
    if (r.error) return false;
    return r.status === 0;
  } catch {
    return false;
  }
}

function supportsRunSubcommand(executable) {
  try {
    const r = spawnSync(executable, ['run', '-h'], {
      shell: false,
      stdio: 'ignore',
      timeout: 6000,
      windowsHide: true,
    });
    if (r.error) {
      return r.error.code !== 'ENOENT';
    }
    return r.status === 0;
  } catch {
    return false;
  }
}

class OpenCodeService {
  constructor() {
    this.trackedSessions = [];
  }

  setTrackedSessions(sessions) {
    this.trackedSessions = Array.isArray(sessions) ? sessions : [];
  }

  getTrackedSessions() {
    return this.trackedSessions;
  }

  getExecutable() {
    const cli = configStore.getSetting('cliCommands') || {};
    const custom = typeof cli?.opencode === 'string' ? cli.opencode.trim() : '';
    if (custom) return custom;
    return process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
  }

  /**
   * CLI args for non-interactive work per https://opencode.ai/docs/cli/#run
   */
  buildRunArgs(projectPath, prompt, options = {}) {
    const args = ['run', '--dir', projectPath];
    if (options.skipPermissions !== false) {
      args.push('--dangerously-skip-permissions');
    }
    if (options.model) {
      args.push('--model', String(options.model));
    }
    if (options.agent) {
      args.push('--agent', String(options.agent));
    }
    args.push(prompt);
    return args;
  }

  /**
   * Heuristic: CLI on PATH, or a typical config directory from an install.
   */
  async isOpenCodeInstalled() {
    const cached = installStatus.getCached('opencode');
    if (cached !== undefined) {
      return cached;
    }
    return this.refreshInstallStatus();
  }

  /** @returns {boolean} Last known install state (false until warmed). */
  isOpenCodeInstalledSync() {
    const cached = installStatus.getCached('opencode');
    return cached === undefined ? false : cached;
  }

  async refreshInstallStatus() {
    if (isCommandRunnable(this.getExecutable())) {
      installStatus.setCached('opencode', true);
      return true;
    }
    const home = os.homedir();
    const candidates = [path.join(home, '.opencode'), path.join(home, '.config', 'opencode')];
    const installed = await pathExistsAny(candidates);
    installStatus.setCached('opencode', installed);
    return installed;
  }

  getDefaultDataPath() {
    return path.join(os.homedir(), '.opencode');
  }

  async testConnection() {
    const installed = await this.isOpenCodeInstalled();
    if (installed) {
      return providerHealth.ok('opencode', {
        configured: true,
        installed: true,
        docsUrl: 'https://opencode.ai/docs/cli/',
        endpointLabel: `${this.getExecutable()} --version`,
        message: 'OpenCode CLI is available on this machine.',
      });
    }
    return providerHealth.fail('opencode', 'OpenCode CLI not found', {
      configured: false,
      installed: false,
      docsUrl: 'https://opencode.ai/docs/cli/',
      endpointLabel: `${this.getExecutable()} --version`,
    });
  }

  _updateSession(sessionId, patch) {
    const idx = this.trackedSessions.findIndex((x) => x.id === sessionId);
    if (idx === -1) return;
    this.trackedSessions[idx] = {
      ...this.trackedSessions[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    configStore.setOpenCodeSessions(this.trackedSessions);
  }

  _mapTrackedToAgent(t) {
    const failed = t.status === 'failed' || t.status === 'stopped';
    return {
      id: t.id,
      provider: 'opencode',
      name:
        (t.prompt && t.prompt.substring(0, 50) + (t.prompt.length > 50 ? '...' : '')) || 'OpenCode',
      status: t.status || 'running',
      prompt: t.prompt,
      repository: t.projectPath,
      rawId: t.id,
      filePath: t.filePath || null,
      summary: failed && t.error ? t.error : t.prompt || '',
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      exitCode: t.exitCode,
    };
  }

  /**
   * Start a detached `opencode run` in a project directory (non-interactive).
   */
  async startSession(options) {
    const { prompt, command } = options;
    const projectPath = options.projectPath || options.repository;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!projectPath) {
      throw new Error('Project path is required');
    }

    if (!(await pathExists(projectPath))) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    const opencodeCmd =
      command && String(command).trim() ? String(command).trim() : this.getExecutable();

    if (!supportsRunSubcommand(opencodeCmd)) {
      throw new Error(
        'OpenCode CLI is too old or missing the "run" subcommand. Upgrade from https://opencode.ai/docs/cli/'
      );
    }

    const args = this.buildRunArgs(projectPath, prompt, options);
    const sessionId = `opencode-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    return new Promise((resolve, reject) => {
      let stderr = '';
      const child = spawn(opencodeCmd, args, {
        cwd: projectPath,
        shell: false,
        detached: true,
        stdio: ['ignore', 'ignore', 'pipe'],
        env: { ...process.env },
        windowsHide: true,
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(
            new Error(
              'OpenCode CLI not found. Install from https://opencode.ai or set a custom executable in headless/CLI settings.'
            )
          );
        } else {
          reject(new Error(`Failed to start OpenCode: ${err.message}`));
        }
      });

      if (child.stderr) {
        child.stderr.on('data', (chunk) => {
          const text = chunk.toString();
          stderr += text;
          if (stderr.length > STDERR_CAP) {
            stderr = stderr.slice(-STDERR_CAP);
          }
        });
      }

      child.on('exit', (code) => {
        const trimmed = stderr.trim();
        if (code === 0) {
          this._updateSession(sessionId, {
            status: 'completed',
            exitCode: code,
            error: null,
          });
          return;
        }
        this._updateSession(sessionId, {
          status: 'failed',
          exitCode: code,
          error:
            trimmed ||
            `OpenCode exited with code ${code}. Check ~/.config/opencode and run "opencode run" in a terminal.`,
        });
      });

      child.unref();

      const entry = {
        id: sessionId,
        rawId: sessionId,
        prompt,
        projectPath,
        status: 'running',
        exitCode: null,
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.trackedSessions = [entry, ...this.trackedSessions].slice(0, 100);
      configStore.setOpenCodeSessions(this.trackedSessions);

      setTimeout(() => {
        resolve({
          id: sessionId,
          provider: 'opencode',
          name: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
          status: 'running',
          prompt,
          repository: projectPath,
          rawId: sessionId,
          filePath: null,
          message:
            'OpenCode task started with "opencode run". It runs in the background without opening a terminal window.',
          createdAt: new Date(),
        });
      }, 400);
    });
  }

  getAllAgents() {
    return this.trackedSessions.map((t) => this._mapTrackedToAgent(t));
  }

  getSessionDetails(rawId) {
    const t = this.trackedSessions.find((x) => x.id === rawId);
    if (!t) return null;

    const messages = [{ role: 'user', content: t.prompt, timestamp: t.createdAt }];
    if (t.status === 'running') {
      messages.push({
        role: 'assistant',
        content:
          'OpenCode is running via `opencode run` in the background. For live output, run the same command in a terminal in that repository.',
      });
    } else if (t.status === 'completed') {
      messages.push({
        role: 'assistant',
        content: 'OpenCode finished successfully. Review your repository for file changes.',
      });
    } else if (t.error) {
      messages.push({
        role: 'assistant',
        content: `OpenCode failed:\n\n${t.error}`,
      });
    } else {
      messages.push({
        role: 'assistant',
        content:
          'Session ended. For full history, use `opencode session list` or the OpenCode TUI in that repository.',
      });
    }

    return {
      name: t.prompt ? t.prompt.substring(0, 80) : 'OpenCode',
      prompt: t.prompt,
      messages,
      filePath: null,
      status: t.status,
      exitCode: t.exitCode,
    };
  }

  async getAvailableProjects(additionalPaths = []) {
    if (!(await this.isOpenCodeInstalled())) {
      return [];
    }
    return projectService.getLocalRepos(additionalPaths);
  }
}

module.exports = new OpenCodeService();
