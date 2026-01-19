const pty = require('node-pty');
const os = require('os');
const path = require('path');

// Session lifecycle states
const SessionStatus = {
  STARTING: 'starting',
  RUNNING: 'running',
  COMPLETED: 'completed',
  IDLE: 'idle',
  TERMINATED: 'terminated'
};

// Auto-cleanup timeout (5 minutes in milliseconds)
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

// Maximum output buffer size (10MB)
const MAX_OUTPUT_BUFFER_SIZE = 10 * 1024 * 1024;

class CliProcessManager {
  constructor() {
    // Map of sessionId -> session data
    this.sessions = new Map();
    
    // Reference to main window for sending IPC events
    this.mainWindow = null;
    
    // Cleanup interval timer
    this.cleanupInterval = null;
    
    // Start the cleanup monitor
    this.startCleanupMonitor();
    
    console.log('[CliProcessManager] Initialized');
  }

  /**
   * Set the main window reference for IPC communication
   * @param {BrowserWindow} window 
   */
  setMainWindow(window) {
    this.mainWindow = window;
  }

  /**
   * Start the cleanup monitor that checks for idle sessions
   */
  startCleanupMonitor() {
    // Check every 30 seconds for idle sessions
    this.cleanupInterval = setInterval(() => {
      this.checkIdleSessions();
    }, 30000);
  }

  /**
   * Stop the cleanup monitor
   */
  stopCleanupMonitor() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Check for and cleanup idle sessions
   */
  checkIdleSessions() {
    const now = Date.now();
    
    for (const [sessionId, session] of this.sessions.entries()) {
      // Only check completed sessions
      if (session.status === SessionStatus.COMPLETED || session.status === SessionStatus.IDLE) {
        const idleTime = now - session.lastActivity;
        
        if (idleTime >= IDLE_TIMEOUT_MS) {
          console.log(`[CliProcessManager] Session ${sessionId} idle for ${Math.round(idleTime / 1000)}s, terminating`);
          this.terminateSession(sessionId, true);
        } else if (session.status === SessionStatus.COMPLETED) {
          // Mark as idle if completed but not yet idle
          session.status = SessionStatus.IDLE;
          this.notifyStatusChange(sessionId, SessionStatus.IDLE);
        }
      }
    }
  }

  /**
   * Create a new CLI session with PTY
   * @param {string} sessionId - Unique session identifier
   * @param {string} provider - 'gemini' or 'claude'
   * @param {string} projectPath - Working directory for the CLI
   * @param {string} prompt - The task prompt to send
   * @returns {object} Session info
   */
  createSession(sessionId, provider, projectPath, prompt) {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    console.log(`[CliProcessManager] Creating session: ${sessionId} for ${provider}`);

    // Determine shell and CLI command based on platform
    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';
    const cliCommand = this.getCliCommand(provider);
    
    // Build the command with prompt
    const escapedPrompt = this.escapePrompt(prompt);
    const fullCommand = `${cliCommand} -p "${escapedPrompt}"`;

    // Create PTY instance
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: projectPath,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      }
    });

    // Create session data
    const session = {
      id: sessionId,
      provider: provider,
      projectPath: projectPath,
      prompt: prompt,
      pty: ptyProcess,
      status: SessionStatus.STARTING,
      outputBuffer: '',
      lastActivity: Date.now(),
      createdAt: Date.now(),
      exitCode: null
    };

    this.sessions.set(sessionId, session);

    // Set up PTY event handlers
    ptyProcess.onData((data) => {
      this.handlePtyOutput(sessionId, data);
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      this.handlePtyExit(sessionId, exitCode, signal);
    });

    // Send the CLI command to the shell
    // Small delay to let the shell initialize
    setTimeout(() => {
      if (this.sessions.has(sessionId)) {
        session.status = SessionStatus.RUNNING;
        this.notifyStatusChange(sessionId, SessionStatus.RUNNING);
        ptyProcess.write(fullCommand + '\r');
      }
    }, 500);

    return {
      id: sessionId,
      provider: provider,
      status: session.status,
      createdAt: session.createdAt
    };
  }

  /**
   * Get the CLI command for a provider
   * @param {string} provider 
   * @returns {string}
   */
  getCliCommand(provider) {
    if (process.platform === 'win32') {
      switch (provider) {
        case 'gemini':
          return 'gemini';
        case 'claude':
          return 'claude';
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
    } else {
      switch (provider) {
        case 'gemini':
          return 'gemini';
        case 'claude':
          return 'claude';
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
    }
  }

  /**
   * Escape prompt for shell command
   * @param {string} prompt 
   * @returns {string}
   */
  escapePrompt(prompt) {
    // Escape double quotes and backslashes
    return prompt
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');
  }

  /**
   * Handle PTY output data
   * @param {string} sessionId 
   * @param {string} data 
   */
  handlePtyOutput(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Update last activity
    session.lastActivity = Date.now();

    // Append to output buffer (with size limit)
    if (session.outputBuffer.length + data.length <= MAX_OUTPUT_BUFFER_SIZE) {
      session.outputBuffer += data;
    } else {
      // Trim old content to make room
      const trimAmount = Math.max(data.length, MAX_OUTPUT_BUFFER_SIZE / 10);
      session.outputBuffer = session.outputBuffer.substring(trimAmount) + data;
    }

    // Send to renderer
    this.sendToRenderer('cli:output', {
      sessionId: sessionId,
      data: data
    });
  }

  /**
   * Handle PTY process exit
   * @param {string} sessionId 
   * @param {number} exitCode 
   * @param {number} signal 
   */
  handlePtyExit(sessionId, exitCode, signal) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    console.log(`[CliProcessManager] Session ${sessionId} exited with code ${exitCode}, signal ${signal}`);

    session.exitCode = exitCode;
    session.status = SessionStatus.COMPLETED;
    session.lastActivity = Date.now();

    // Notify renderer
    this.sendToRenderer('cli:exit', {
      sessionId: sessionId,
      exitCode: exitCode,
      signal: signal
    });

    this.notifyStatusChange(sessionId, SessionStatus.COMPLETED);
  }

  /**
   * Write data to a session's PTY
   * @param {string} sessionId 
   * @param {string} data 
   */
  writeToSession(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status === SessionStatus.TERMINATED) {
      throw new Error(`Session ${sessionId} is terminated`);
    }

    // Update last activity
    session.lastActivity = Date.now();

    // If session was idle/completed, it's now active again
    if (session.status === SessionStatus.IDLE || session.status === SessionStatus.COMPLETED) {
      session.status = SessionStatus.RUNNING;
      this.notifyStatusChange(sessionId, SessionStatus.RUNNING);
    }

    session.pty.write(data);
  }

  /**
   * Resize a session's terminal
   * @param {string} sessionId 
   * @param {number} cols 
   * @param {number} rows 
   */
  resizeTerminal(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== SessionStatus.TERMINATED && session.pty) {
      session.pty.resize(cols, rows);
    }
  }

  /**
   * Get the status of a session
   * @param {string} sessionId 
   * @returns {object|null}
   */
  getSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      id: session.id,
      provider: session.provider,
      status: session.status,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      exitCode: session.exitCode
    };
  }

  /**
   * Get all active sessions
   * @returns {Array}
   */
  getAllSessions() {
    const sessions = [];
    for (const [sessionId, session] of this.sessions.entries()) {
      sessions.push({
        id: session.id,
        provider: session.provider,
        status: session.status,
        projectPath: session.projectPath,
        prompt: session.prompt,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        exitCode: session.exitCode
      });
    }
    return sessions;
  }

  /**
   * Check if a session is active (has live PTY)
   * @param {string} sessionId 
   * @returns {boolean}
   */
  isSessionActive(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    return session.status !== SessionStatus.TERMINATED;
  }

  /**
   * Terminate a session
   * @param {string} sessionId 
   * @param {boolean} saveOutput - Whether to return the output buffer
   * @returns {string|null} Output buffer if saveOutput is true
   */
  terminateSession(sessionId, saveOutput = false) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    console.log(`[CliProcessManager] Terminating session: ${sessionId}`);

    const outputBuffer = saveOutput ? session.outputBuffer : null;

    // Kill the PTY process if it exists
    if (session.pty) {
      try {
        session.pty.kill();
      } catch (err) {
        console.error(`[CliProcessManager] Error killing PTY for ${sessionId}:`, err);
      }
    }

    // Update status
    session.status = SessionStatus.TERMINATED;
    session.pty = null;

    // Notify renderer
    this.notifyStatusChange(sessionId, SessionStatus.TERMINATED);

    // Remove from sessions map after a delay (to allow final status to be read)
    setTimeout(() => {
      this.sessions.delete(sessionId);
    }, 5000);

    return outputBuffer;
  }

  /**
   * Get the output buffer for a session
   * @param {string} sessionId 
   * @returns {string|null}
   */
  getOutputBuffer(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.outputBuffer;
  }

  /**
   * Send an event to the renderer process
   * @param {string} channel 
   * @param {object} data 
   */
  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Notify about session status change
   * @param {string} sessionId 
   * @param {string} status 
   */
  notifyStatusChange(sessionId, status) {
    this.sendToRenderer('cli:status-change', {
      sessionId: sessionId,
      status: status
    });
  }

  /**
   * Cleanup all sessions (called on app quit)
   */
  cleanup() {
    console.log('[CliProcessManager] Cleaning up all sessions');
    
    this.stopCleanupMonitor();
    
    for (const sessionId of this.sessions.keys()) {
      this.terminateSession(sessionId, false);
    }
    
    this.sessions.clear();
  }

  /**
   * Record user activity for a session (resets idle timer)
   * @param {string} sessionId 
   */
  recordActivity(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      
      // If session was idle, mark as completed (user is viewing)
      if (session.status === SessionStatus.IDLE) {
        session.status = SessionStatus.COMPLETED;
        this.notifyStatusChange(sessionId, SessionStatus.COMPLETED);
      }
    }
  }
}

// Export singleton instance
module.exports = new CliProcessManager();
module.exports.SessionStatus = SessionStatus;
