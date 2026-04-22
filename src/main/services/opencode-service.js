const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const configStore = require('./config-store');
const geminiService = require('./gemini-service');

function isCommandRunnable(cmd) {
  if (!cmd) return false;
  try {
    const r = spawnSync(String(cmd), ['--version'], {
      shell: false,
      stdio: 'ignore',
      timeout: 2000,
      windowsHide: true
    });
    if (r.error) return false;
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
   * Heuristic: CLI on PATH, or a typical config directory from an install.
   */
  isOpenCodeInstalled() {
    if (isCommandRunnable(this.getExecutable())) {
      return true;
    }
    const home = os.homedir();
    const candidates = [path.join(home, '.opencode'), path.join(home, '.config', 'opencode')];
    if (candidates.some((p) => fs.existsSync(p))) {
      return true;
    }
    return false;
  }

  getDefaultDataPath() {
    return path.join(os.homedir(), '.opencode');
  }

  testConnection() {
    if (this.isOpenCodeInstalled()) {
      return { success: true };
    }
    return { success: false, error: 'OpenCode CLI not found' };
  }

  _pickRunArgsFor(executable, prompt) {
    const h = spawnSync(executable, ['run', '-h'], { stdio: 'ignore', windowsHide: true, timeout: 6000 });
    if (h.error) {
      if (h.error.code === 'ENOENT') {
        return { error: 'OpenCode executable not found' };
      }
    }
    if (h.status === 0) {
      return { args: ['run', prompt] };
    }
    return { args: ['-p', prompt] };
  }

  /**
   * Start a detached OpenCode run in a project directory.
   * Uses `opencode run` when available, otherwise `opencode -p` (legacy builds).
   */
  async startSession(options) {
    const { prompt, projectPath, command } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!projectPath) {
      throw new Error('Project path is required');
    }

    const fsPromises = fs.promises;
    try {
      await fsPromises.access(projectPath);
    } catch (err) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    const opencodeCmd = (command && String(command).trim()) ? String(command).trim() : this.getExecutable();
    const run = this._pickRunArgsFor(opencodeCmd, prompt);
    if (run.error) {
      throw new Error(run.error);
    }
    const { args } = run;

    const sessionId = `opencode-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    return new Promise((resolve, reject) => {
      const child = spawn(opencodeCmd, args, {
        cwd: projectPath,
        shell: false,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
        windowsHide: true
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error('OpenCode CLI not found. Install from https://opencode.ai or set a custom executable in headless/CLI settings.'));
        } else {
          reject(new Error(`Failed to start OpenCode: ${err.message}`));
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
          message: 'OpenCode task started in the background.',
          createdAt: new Date()
        });
      }, 400);
    });
  }

  getAllAgents() {
    return this.trackedSessions.map((t) => ({
      id: t.id,
      provider: 'opencode',
      name: (t.prompt && t.prompt.substring(0, 50) + (t.prompt.length > 50 ? '...' : '')) || 'OpenCode',
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
      name: t.prompt ? t.prompt.substring(0, 80) : 'OpenCode',
      prompt: t.prompt,
      messages: [
        { role: 'user', content: t.prompt, timestamp: t.createdAt },
        {
          role: 'assistant',
          content: 'Session started via OpenCode CLI. For full history, use the OpenCode UI or your terminal in that repository.'
        }
      ],
      filePath: null
    };
  }

  async getAvailableProjects(additionalPaths = []) {
    if (!this.isOpenCodeInstalled()) {
      return [];
    }
    return geminiService.getAvailableProjects(additionalPaths);
  }
}

module.exports = new OpenCodeService();
