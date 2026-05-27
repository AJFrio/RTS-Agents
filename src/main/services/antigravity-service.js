const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const configStore = require('./config-store');
const geminiService = require('./gemini-service');
const { pathExists, pathExistsAny } = require('../utils/path-exists');
const installStatus = require('../utils/install-status');

function isCommandRunnable(cmd) {
  if (!cmd) return false;
  try {
    const r = spawnSync(String(cmd), ['--version'], {
      shell: false,
      stdio: 'ignore',
      timeout: 3000,
      windowsHide: true
    });
    if (r.error) return false;
    return r.status === 0;
  } catch {
    return false;
  }
}

class AntigravityService {
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
    const custom = typeof cli?.antigravity === 'string' ? cli.antigravity.trim() : '';
    return custom || 'agy';
  }

  getDefaultDataPath() {
    return path.join(os.homedir(), '.gemini', 'antigravity-cli');
  }

  async isAntigravityInstalled() {
    const cached = installStatus.getCached('antigravity');
    if (cached !== undefined) {
      return cached;
    }
    return this.refreshInstallStatus();
  }

  isAntigravityInstalledSync() {
    const cached = installStatus.getCached('antigravity');
    return cached === undefined ? false : cached;
  }

  async refreshInstallStatus() {
    if (isCommandRunnable(this.getExecutable())) {
      installStatus.setCached('antigravity', true);
      return true;
    }

    const candidates = [this.getDefaultDataPath()];
    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, 'Antigravity'));
    }

    const installed = await pathExistsAny(candidates);
    installStatus.setCached('antigravity', installed);
    return installed;
  }

  async testConnection() {
    if (await this.isAntigravityInstalled()) {
      return { success: true };
    }
    return { success: false, error: 'Antigravity CLI not found' };
  }

  async startSession(options) {
    const { prompt, projectPath, command } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!projectPath) {
      throw new Error('Project path is required');
    }
    if (!(await pathExists(projectPath))) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    const antigravityCmd = (command && String(command).trim()) ? String(command).trim() : this.getExecutable();
    const args = ['-p', prompt, '--print-timeout', '30m'];
    const sessionId = `antigravity-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    return new Promise((resolve, reject) => {
      const child = spawn(antigravityCmd, args, {
        cwd: projectPath,
        shell: false,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
        windowsHide: true
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error('Antigravity CLI not found. Install it from https://antigravity.google or set a custom agy executable.'));
        } else {
          reject(new Error(`Failed to start Antigravity CLI: ${err.message}`));
        }
      });

      child.unref();

      const entry = {
        id: sessionId,
        rawId: sessionId,
        prompt,
        projectPath,
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.trackedSessions = [entry, ...this.trackedSessions].slice(0, 100);
      configStore.setAntigravitySessions(this.trackedSessions);

      setTimeout(() => {
        resolve({
          id: sessionId,
          provider: 'antigravity',
          name: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
          status: 'running',
          prompt,
          repository: projectPath,
          rawId: sessionId,
          filePath: null,
          message: 'Antigravity CLI task started in the background.',
          createdAt: new Date()
        });
      }, 400);
    });
  }

  getAllAgents() {
    return this.trackedSessions.map((t) => ({
      id: t.id,
      provider: 'antigravity',
      name: (t.prompt && t.prompt.substring(0, 50) + (t.prompt.length > 50 ? '...' : '')) || 'Antigravity',
      status: t.status || 'running',
      prompt: t.prompt,
      repository: t.projectPath,
      rawId: t.id,
      filePath: t.filePath || null,
      summary: t.prompt || '',
      createdAt: t.createdAt,
      updatedAt: t.updatedAt
    }));
  }

  getSessionDetails(rawId) {
    const t = this.trackedSessions.find((x) => x.id === rawId);
    if (!t) return null;
    return {
      name: t.prompt ? t.prompt.substring(0, 80) : 'Antigravity',
      prompt: t.prompt,
      messages: [
        { role: 'user', content: t.prompt, timestamp: t.createdAt },
        {
          role: 'assistant',
          content: 'Session started via Antigravity CLI. For full history, use Antigravity CLI or the Antigravity desktop app in that repository.'
        }
      ],
      filePath: null
    };
  }

  async getAvailableProjects(additionalPaths = []) {
    if (!(await this.isAntigravityInstalled())) {
      return [];
    }
    return geminiService.getAvailableProjects(additionalPaths);
  }
}

module.exports = new AntigravityService();
