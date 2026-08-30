const fsPromises = require('fs').promises;
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { upsertItem } = require('../utils/collection-utils');
const httpService = require('./http-service');
const { pathExists } = require('../utils/path-exists');
const installStatus = require('../utils/install-status');
const providerHealth = require('./provider-health');
const acpService = require('./acp-service');
const configStore = require('./config-store');
const { appendStreamMessage, appendAgentChunk } = require('./opencode-session-parser');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1';
const CLAUDE_HOME = path.join(os.homedir(), '.claude');
const CLAUDE_PROJECTS_DIR = path.join(CLAUDE_HOME, 'projects');

const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const ANTHROPIC_API_VERSION = '2023-06-01';
const CLAUDE_DEFAULT_TOOLS = 'Read,Edit,Bash';
const CLAUDE_BIN = process.platform === 'win32' ? 'claude.cmd' : 'claude';
const ACP_PERSIST_DEBOUNCE_MS = 1000;
const TRACKED_LOCAL_SESSION_LIMIT = 100;
const CLI_PROBE_TIMEOUT_MS = 3000;

function isCommandRunnable(cmd) {
  if (!cmd) return false;
  try {
    const probe = spawnSync(String(cmd), ['--version'], {
      shell: false,
      stdio: 'ignore',
      timeout: CLI_PROBE_TIMEOUT_MS,
      windowsHide: true,
      env: { ...process.env },
    });
    if (probe.error) return false;
    return probe.status === 0;
  } catch {
    return false;
  }
}

// Store for tracking cloud conversations (since Anthropic doesn't have a list conversations endpoint)
let trackedConversations = [];

class ClaudeService {
  constructor() {
    this.apiKey = null;
    this.trackedLocalSessions = [];
    this._persistTimer = null;
  }

  setTrackedLocalSessions(sessions) {
    this.trackedLocalSessions = Array.isArray(sessions) ? sessions : [];
  }

  getTrackedLocalSessions() {
    return this.trackedLocalSessions;
  }

  // ============================================
  // Local CLI Detection & Session Reading
  // ============================================

  /**
   * Get the default Claude CLI directory
   */
  getDefaultPath() {
    return CLAUDE_HOME;
  }

  /**
   * Check if Claude Code CLI is installed (async; warms install cache).
   */
  async isClaudeInstalled() {
    const cached = installStatus.getCached('claude');
    if (cached !== undefined) {
      return cached;
    }
    return this.refreshInstallStatus();
  }

  /** @returns {boolean} Last known install state (false until warmed). */
  isClaudeInstalledSync() {
    const cached = installStatus.getCached('claude');
    return cached === undefined ? false : cached;
  }

  async refreshInstallStatus() {
    // A bare ~/.claude can be created by other tooling (e.g. transcript
    // writers), so treat Claude Code as installed only with real session
    // data or a runnable CLI.
    const hasProjectsDir = await pathExists(CLAUDE_PROJECTS_DIR);
    const installed = hasProjectsDir || isCommandRunnable(CLAUDE_BIN);
    installStatus.setCached('claude', installed);
    return installed;
  }

  /**
   * Scan for all Claude Code project directories
   * @param {string[]} additionalPaths - Additional paths to scan
   */
  async discoverProjects(additionalPaths = []) {
    const projects = [];
    const pathsToScan = [CLAUDE_PROJECTS_DIR, ...additionalPaths];

    const pathPromises = pathsToScan.map(async (basePath) => {
      try {
        await fsPromises.access(basePath);
      } catch {
        return [];
      }

      try {
        const entries = await fsPromises.readdir(basePath, { withFileTypes: true });

        const entryPromises = entries.map(async (entry) => {
          if (!entry.isDirectory()) return null;
          // Skip known non-project directories
          if (entry.name === 'bin' || entry.name === 'cache' || entry.name === 'tmp') {
            return null;
          }

          const projectPath = path.join(basePath, entry.name);
          const sessionsPath = path.join(projectPath, 'sessions');
          const chatsPath = path.join(projectPath, 'chats');

          // Check for sessions directory or session files
          try {
            await fsPromises.access(sessionsPath);
            return {
              hash: entry.name,
              path: projectPath,
              sessionsPath: sessionsPath,
            };
          } catch {}

          try {
            await fsPromises.access(chatsPath);
            return {
              hash: entry.name,
              path: projectPath,
              sessionsPath: chatsPath,
            };
          } catch {}

          try {
            // Check if the directory itself contains session files
            const files = await fsPromises.readdir(projectPath);
            const hasSessionFiles = files.some((f) => f.endsWith('.json'));
            if (hasSessionFiles) {
              return {
                hash: entry.name,
                path: projectPath,
                sessionsPath: projectPath,
              };
            }
          } catch {}

          return null;
        });

        const results = await Promise.all(entryPromises);
        return results.filter((r) => r !== null);
      } catch (err) {
        // Ignore errors
        return [];
      }
    });

    const allResults = await Promise.all(pathPromises);
    allResults.forEach((res) => projects.push(...res));

    return projects;
  }

  /**
   * Get all sessions from a project
   * @param {string} projectPath - Path to the project directory
   * @param {string} sessionsPath - Path to the sessions directory
   */
  async getProjectSessions(projectPath, sessionsPath) {
    const sessions = [];

    try {
      await fsPromises.access(sessionsPath);
    } catch {
      return sessions;
    }

    try {
      const files = (await fsPromises.readdir(sessionsPath)).filter((f) => f.endsWith('.json'));

      const sessionPromises = files.map(async (file) => {
        try {
          const filePath = path.join(sessionsPath, file);
          const [stats, content] = await Promise.all([
            fsPromises.stat(filePath),
            fsPromises.readFile(filePath, 'utf-8'),
          ]);
          const session = JSON.parse(content);

          // Use session timestamps if available, fall back to file stats
          const createdAt =
            session.startTime || session.created_at
              ? new Date(session.startTime || session.created_at)
              : stats.birthtime;
          const updatedAt =
            session.lastUpdated || session.updated_at
              ? new Date(session.lastUpdated || session.updated_at)
              : stats.mtime;

          return {
            id: `claude-local-${path.basename(projectPath)}-${file.replace('.json', '')}`,
            provider: 'claude',
            source: 'local',
            name: this.extractSessionName(session),
            status: this.inferStatus(session, stats),
            prompt: this.extractInitialPrompt(session),
            repository: await this.extractRepository(projectPath, session),
            createdAt: createdAt,
            updatedAt: updatedAt,
            summary: this.extractSummary(session),
            filePath: filePath,
            projectHash: path.basename(projectPath),
            messageCount: this.countMessages(session),
          };
        } catch (err) {
          return null;
        }
      });

      const results = await Promise.all(sessionPromises);
      return results.filter((s) => s !== null);
    } catch (err) {
      // Ignore error
    }

    return sessions;
  }

  /**
   * Get all local agents/sessions across all discovered projects
   * @param {string[]} additionalPaths - Additional paths to scan
   */
  async getAllLocalSessions(additionalPaths = []) {
    const projects = await this.discoverProjects(additionalPaths);
    const allSessions = [];

    for (const project of projects) {
      const sessions = await this.getProjectSessions(project.path, project.sessionsPath);
      allSessions.push(...sessions);
    }

    return allSessions.concat(
      this.trackedLocalSessions.map((record) => this._normalizeTrackedLocal(record))
    );
  }

  // ============================================
  // Cloud API Methods
  // ============================================

  /**
   * Set the API key for Anthropic API
   * @param {string} apiKey
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Make an HTTP request to the Anthropic API
   * @param {string} endpoint
   * @param {string} method
   * @param {object} body
   */
  async request(endpoint, method = 'GET', body = null) {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const url = `${ANTHROPIC_API_URL}${endpoint}`;

    try {
      return await httpService.requestJson(
        url,
        method,
        body,
        {
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
        },
        60000
      );
    } catch (err) {
      if (err.statusCode) {
        const dataStr = typeof err.data === 'object' ? JSON.stringify(err.data) : err.data;
        throw new Error(`Anthropic API error: ${err.statusCode} - ${dataStr}`);
      }
      throw err;
    }
  }

  /**
   * Create a message using the Anthropic Messages API
   * @param {Array} messages - Array of message objects
   * @param {object} options - Additional options (model, max_tokens, etc.)
   */
  async createMessage(messages, options = {}) {
    const body = {
      model: options.model || CLAUDE_DEFAULT_MODEL,
      max_tokens: options.max_tokens || 4096,
      messages: messages,
      ...options,
    };

    // Remove custom options that aren't part of the API
    delete body.title;
    delete body.repository;
    delete body.projectPath;

    return this.request('/messages', 'POST', body);
  }

  async listModels() {
    return this.request('/models');
  }

  /**
   * Check if API key is valid by making a test request
   */
  async testConnection() {
    try {
      const response = await this.listModels();
      const models = Array.isArray(response?.data) ? response.data : [];
      return providerHealth.ok('claude-cloud', {
        configured: true,
        docsUrl: 'https://platform.claude.com/docs/en/api/authentication/overview',
        endpointLabel: 'GET /v1/models',
        message: `Connected to Anthropic. ${models.length} models available.`,
        diagnostics: { modelCount: models.length },
      });
    } catch (err) {
      return providerHealth.fail('claude-cloud', err, {
        configured: !!this.apiKey,
        docsUrl: 'https://platform.claude.com/docs/en/api/authentication/overview',
        endpointLabel: 'GET /v1/models',
      });
    }
  }

  // ============================================
  // Conversation Tracking (Cloud Mode)
  // ============================================

  /**
   * Track a conversation ID for later listing
   * @param {string} conversationId
   * @param {object} metadata
   */
  trackConversation(conversationId, metadata = {}) {
    const conversationInfo = {
      id: conversationId,
      createdAt: new Date().toISOString(),
      prompt: metadata.prompt || '',
      repository: metadata.repository || null,
      title: metadata.title || null,
      messages: metadata.messages || [],
      lastResponse: metadata.lastResponse || null,
      ...metadata,
    };

    trackedConversations = upsertItem(trackedConversations, conversationInfo, { limit: 100 });
  }

  /**
   * Set tracked conversations (used to restore from config)
   * @param {Array} conversations
   */
  setTrackedConversations(conversations) {
    trackedConversations = conversations || [];
  }

  /**
   * Get tracked conversations
   * @returns {Array}
   */
  getTrackedConversations() {
    return trackedConversations;
  }

  /**
   * Get all cloud conversations formatted for the dashboard
   */
  async getAllCloudConversations() {
    // Return tracked conversations normalized to AgentTask format
    return trackedConversations.map((conv) => this.normalizeCloudConversation(conv));
  }

  /**
   * Normalize a cloud conversation to the common AgentTask format
   * @param {object} conversation
   */
  normalizeCloudConversation(conversation) {
    return {
      id: `claude-cloud-${conversation.id}`,
      provider: 'claude',
      source: 'cloud',
      name: conversation.title || this.extractConversationName(conversation),
      status: this.mapCloudStatus(conversation),
      prompt: conversation.prompt || '',
      repository: conversation.repository || null,
      branch: null,
      prUrl: null,
      createdAt: conversation.createdAt ? new Date(conversation.createdAt) : null,
      updatedAt: conversation.updatedAt ? new Date(conversation.updatedAt) : null,
      summary: conversation.lastResponse?.content?.[0]?.text?.substring(0, 200) || null,
      rawId: conversation.id,
      messages: conversation.messages || [],
    };
  }

  /**
   * Extract a readable name from conversation
   */
  extractConversationName(conversation) {
    if (conversation.title) return conversation.title;
    if (conversation.prompt) {
      return conversation.prompt.substring(0, 50) + (conversation.prompt.length > 50 ? '...' : '');
    }
    return `Claude Conversation ${conversation.id.substring(0, 8)}`;
  }

  /**
   * Map cloud conversation status
   */
  mapCloudStatus(conversation) {
    if (conversation.status) return conversation.status;
    // Cloud conversations are typically completed once we get a response
    if (conversation.lastResponse) return 'completed';
    return 'pending';
  }

  // ============================================
  // Unified Interface
  // ============================================

  /**
   * Get all agents from both local CLI and cloud
   * @param {string[]} additionalPaths - Additional paths to scan for local sessions
   */
  async getAllAgents(additionalPaths = []) {
    const results = [];

    // Get local sessions if CLI is installed
    if (await this.isClaudeInstalled()) {
      try {
        const localSessions = await this.getAllLocalSessions(additionalPaths);
        results.push(...localSessions);
      } catch (err) {
        // Ignore error
      }
    }

    // Get cloud conversations if API key is set
    if (this.apiKey) {
      try {
        const cloudConversations = await this.getAllCloudConversations();
        results.push(...cloudConversations);
      } catch (err) {
        // Ignore error
      }
    }

    // Sort by most recent first
    return results.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || 0);
      const dateB = new Date(b.updatedAt || b.createdAt || 0);
      return dateB - dateA;
    });
  }

  /**
   * Get detailed session/conversation data
   * @param {string} id - Session ID (with prefix indicating source)
   * @param {string} filePath - For local sessions, the path to the session file
   */
  async getAgentDetails(id, filePath = null) {
    // Tracked ACP-dispatched local sessions (live-streamed output)
    if (id.startsWith('claude-cli-')) {
      const tracked = this.trackedLocalSessions.find((s) => s.id === id);
      if (tracked) {
        return this._getTrackedLocalDetails(tracked);
      }
    }

    // Check if it's a local session
    if (id.startsWith('claude-local-') && filePath) {
      return this.getLocalSessionDetails(filePath);
    }

    // Check if it's a cloud conversation
    if (id.startsWith('claude-cloud-')) {
      const rawId = id.replace('claude-cloud-', '');
      return this.getCloudConversationDetails(rawId);
    }

    throw new Error(`Unknown Claude session type: ${id}`);
  }

  /**
   * Get detailed local session data
   * @param {string} filePath - Path to the session JSON file
   */
  async getLocalSessionDetails(filePath) {
    try {
      const [content, stats] = await Promise.all([
        fsPromises.readFile(filePath, 'utf-8'),
        fsPromises.stat(filePath),
      ]);
      const session = JSON.parse(content);

      return {
        sessionId: session.sessionId || session.id || null,
        projectHash: session.projectHash || null,
        name: this.extractSessionName(session),
        prompt: this.extractInitialPrompt(session),
        summary: this.extractSummary(session),
        status: this.inferStatus(session, stats),
        source: 'local',

        // Timestamps
        createdAt: session.startTime || session.created_at || stats.birthtime,
        updatedAt: session.lastUpdated || session.updated_at || stats.mtime,

        // Messages
        messages: this.parseMessages(session),
        messageCount: (session.messages || session.conversation || []).length,

        // File info
        filePath: filePath,
        fileSize: stats.size,
      };
    } catch (err) {
      return null;
    }
  }

  /**
   * Get detailed cloud conversation data
   * @param {string} conversationId - The conversation ID
   */
  async getCloudConversationDetails(conversationId) {
    const conversation = trackedConversations.find((c) => c.id === conversationId);

    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    return {
      ...this.normalizeCloudConversation(conversation),
      messages: (conversation.messages || []).map((msg, idx) => ({
        id: `msg-${idx}`,
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : msg.content?.[0]?.text || '',
        timestamp: null,
      })),
    };
  }

  // ============================================
  // Task Creation
  // ============================================

  /**
   * Create a new Claude task/conversation via the API
   * @param {object} options - Task creation options
   * @param {string} options.prompt - The task description/prompt
   * @param {string} [options.repository] - Repository context
   * @param {string} [options.title] - Task title
   * @param {string} [options.projectPath] - For local CLI, the project path
   */
  async createTask(options) {
    const { prompt, repository, title, projectPath, attachments } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    // If projectPath is provided and CLI is installed, start a local session
    if (projectPath && (await this.isClaudeInstalled())) {
      return this.startLocalSession(options);
    }

    // Otherwise, use the cloud API
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    // Create conversation ID
    const conversationId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Build initial messages
    let messageContent = prompt;

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      messageContent = [];

      // Add text prompt
      messageContent.push({
        type: 'text',
        text: prompt,
      });

      // Add attachments
      for (const attachment of attachments) {
        if (attachment.dataUrl) {
          const match = attachment.dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (match) {
            messageContent.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: match[1],
                data: match[2],
              },
            });
          }
        }
      }
    }

    const messages = [{ role: 'user', content: messageContent }];

    try {
      // Make the API request
      const response = await this.createMessage(messages, {
        model: CLAUDE_DEFAULT_MODEL,
        max_tokens: 4096,
      });

      // Track this conversation
      this.trackConversation(conversationId, {
        prompt: prompt,
        repository: repository,
        title: title || prompt.substring(0, 50),
        messages: messages,
        lastResponse: response,
        status: 'completed',
        updatedAt: new Date().toISOString(),
      });

      return this.normalizeCloudConversation({
        id: conversationId,
        prompt: prompt,
        repository: repository,
        title: title || prompt.substring(0, 50),
        messages: messages,
        lastResponse: response,
        status: 'completed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      // Track failed conversation
      this.trackConversation(conversationId, {
        prompt: prompt,
        repository: repository,
        title: title,
        messages: messages,
        status: 'failed',
        error: err.message,
      });
      throw err;
    }
  }

  /**
   * Start a new local Claude Code CLI session.
   * Dispatches over ACP (Agent Client Protocol) when an adapter is installed
   * so output streams live; otherwise falls back to a detached
   * `claude -p "prompt" --allowedTools "Read,Edit,Bash"` process.
   * @param {object} options - Session options
   * @param {string} options.prompt - The task description/prompt
   * @param {string} options.projectPath - Path to the project directory
   * @param {string} [options.allowedTools] - Tools to auto-approve (default: "Read,Edit,Bash")
   */
  async startLocalSession(options) {
    const { prompt, projectPath, allowedTools = CLAUDE_DEFAULT_TOOLS, command } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!projectPath) {
      throw new Error('Project path is required');
    }

    try {
      await fsPromises.access(projectPath);
    } catch {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    const sessionId = `claude-cli-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const adapter = acpService.resolveAdapter('claude');

    if (adapter) {
      return this._startAcpSession(adapter, { prompt, projectPath }, sessionId);
    }
    return this._spawnLegacySession({ prompt, projectPath, allowedTools, command }, sessionId);
  }

  _startAcpSession(adapter, { prompt, projectPath }, sessionId) {
    const record = {
      id: sessionId,
      rawId: sessionId,
      prompt,
      projectPath,
      status: 'running',
      streamMessages: [],
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.trackedLocalSessions = [record, ...this.trackedLocalSessions].slice(
      0,
      TRACKED_LOCAL_SESSION_LIMIT
    );
    this._persistTrackedLocalSessions();

    const buildCard = (status, message) => ({
      id: sessionId,
      provider: 'claude',
      source: 'local',
      name: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
      status,
      prompt,
      repository: projectPath,
      createdAt: new Date(),
      message,
    });

    return new Promise((resolveCard) => {
      let cardResolved = false;
      const resolveOnce = (card) => {
        if (!cardResolved) {
          cardResolved = true;
          resolveCard(card);
        }
      };

      acpService
        .runPrompt({
          command: adapter,
          cwd: projectPath,
          prompt,
          permissionPolicy: 'safe-tools',
          onSessionId: () => {
            resolveOnce(
              buildCard(
                'running',
                'Claude Code session started via ACP. Live output streams into the task details.'
              )
            );
          },
          onUpdate: (update) => {
            if (update?.sessionUpdate !== 'agent_message_chunk') return;
            const text =
              typeof update.content === 'string' ? update.content : update.content?.text;
            if (!text || !text.trim()) return;
            record.streamMessages = appendStreamMessage(record.streamMessages, {
              role: 'assistant',
              content: text,
              timestamp: new Date().toISOString(),
            });
            this._updateTrackedLocalSession(
              sessionId,
              { streamMessages: record.streamMessages },
              true
            );
          },
        })
        .then(({ stopReason }) => {
          const failed = stopReason === 'error' || stopReason === 'cancelled';
          this._updateTrackedLocalSession(sessionId, {
            status: failed ? 'failed' : 'completed',
            error: failed ? `Claude Code ACP turn ended with stopReason ${stopReason}` : null,
          });
          resolveOnce(buildCard(failed ? 'failed' : 'completed', 'Claude Code task finished.'));
        })
        .catch((err) => {
          // Fallback is only legal before any agent work began; after that
          // re-dispatching through the legacy CLI would run the prompt twice.
          if (!cardResolved && err?.fallbackAllowed) {
            this.trackedLocalSessions = this.trackedLocalSessions.filter(
              (s) => s.id !== sessionId
            );
            this._persistTrackedLocalSessions();
            this._spawnLegacySession({ prompt, projectPath }, sessionId).then(
              (card) => resolveOnce(card),
              () => resolveOnce(buildCard('failed', err.message))
            );
            return;
          }
          this._updateTrackedLocalSession(sessionId, {
            status: 'failed',
            error: err?.message || String(err),
          });
          resolveOnce(buildCard('failed', err?.message || 'ACP dispatch failed.'));
        });
    });
  }

  _spawnLegacySession({ prompt, projectPath, allowedTools = CLAUDE_DEFAULT_TOOLS, command }, sessionId) {
    const { spawn } = require('child_process');

    // Build command: claude -p "prompt" --allowedTools "Read,Edit,Bash"
    // -p: prompt/headless mode
    // --allowedTools: auto-approve these tools
    const args = ['-p', prompt, '--allowedTools', allowedTools];

    return new Promise((resolve, reject) => {
      const claudeCmd =
        command && String(command).trim()
          ? String(command).trim()
          : process.platform === 'win32'
            ? 'claude.cmd'
            : 'claude';

      const child = spawn(claudeCmd, args, {
        cwd: projectPath,
        shell: false,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(
            new Error('Claude Code CLI not found. Please ensure it is installed and in your PATH.')
          );
        } else {
          reject(new Error(`Failed to start Claude Code CLI: ${err.message}`));
        }
      });

      // Detach the child process so it runs independently
      child.unref();

      // Return immediately after spawning
      // The process will run in the background and create session files
      // that we can discover later through the normal scanning
      setTimeout(() => {
        resolve({
          id: sessionId,
          provider: 'claude',
          source: 'local',
          name: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
          status: 'running',
          prompt: prompt,
          repository: projectPath,
          createdAt: new Date(),
          message: 'Claude Code CLI session started. The task is running in the background.',
        });
      }, 500);
    });
  }

  _updateTrackedLocalSession(sessionId, patch, debounced = false) {
    const idx = this.trackedLocalSessions.findIndex((x) => x.id === sessionId);
    if (idx === -1) return;
    this.trackedLocalSessions[idx] = {
      ...this.trackedLocalSessions[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (debounced) {
      this._persistTrackedLocalSessionsDebounced();
    } else {
      this._persistTrackedLocalSessions();
    }
  }

  _persistTrackedLocalSessions() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }
    try {
      configStore.setClaudeCliSessions(this.trackedLocalSessions);
    } catch (err) {
      console.error('Failed to persist Claude CLI sessions:', err?.message || err);
    }
  }

  _persistTrackedLocalSessionsDebounced() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
    }
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      this._persistTrackedLocalSessions();
    }, ACP_PERSIST_DEBOUNCE_MS);
  }

  _normalizeTrackedLocal(record) {
    const stream = Array.isArray(record.streamMessages) ? record.streamMessages : [];
    const lastContent = stream.length ? String(stream[stream.length - 1].content || '') : '';
    return {
      id: record.id,
      provider: 'claude',
      source: 'local',
      name: record.prompt
        ? record.prompt.substring(0, 50) + (record.prompt.length > 50 ? '...' : '')
        : 'Claude Code Session',
      status: record.status || 'running',
      prompt: record.prompt || '',
      repository: record.projectPath || null,
      createdAt: record.createdAt ? new Date(record.createdAt) : null,
      updatedAt: record.updatedAt ? new Date(record.updatedAt) : null,
      summary: lastContent ? lastContent.substring(0, 200) : null,
      rawId: record.id,
      filePath: null,
      messageCount: stream.length + 1,
    };
  }

  _getTrackedLocalDetails(record) {
    const stream = Array.isArray(record.streamMessages) ? record.streamMessages : [];
    return {
      sessionId: null,
      projectPath: record.projectPath || null,
      name: record.prompt ? record.prompt.substring(0, 80) : 'Claude Code Session',
      prompt: record.prompt || '',
      summary: this._normalizeTrackedLocal(record).summary,
      status: record.status || 'running',
      source: 'local',
      createdAt: record.createdAt || null,
      updatedAt: record.updatedAt || null,
      messages: [
        {
          id: 'prompt',
          role: 'user',
          content: record.prompt || '',
          timestamp: record.createdAt || null,
        },
        ...stream.map((msg) => ({
          id: msg.id || null,
          role: msg.role || 'assistant',
          content: msg.content || '',
          timestamp: msg.timestamp || null,
        })),
      ],
      filePath: null,
    };
  }

  /**
   * Get available local projects that can be used with Claude Code CLI
   * Scans for directories with .git folders in the provided paths
   * Only returns actual Git repositories, not Claude session folders
   * @param {string[]} additionalPaths - Additional paths to scan
   */
  async getAvailableProjects(additionalPaths = []) {
    const projects = [];
    const scannedPaths = new Set();

    // Only scan the provided paths for git repositories
    // Do NOT include Claude session folders from .claude/projects
    const pathPromises = additionalPaths.map(async (basePath) => {
      // Skip the Claude directories - these are session data, not project repos
      if (basePath.includes('.claude')) return [];

      try {
        await fsPromises.access(basePath);
      } catch {
        return [];
      }

      try {
        const entries = await fsPromises.readdir(basePath, { withFileTypes: true });

        const entryPromises = entries.map(async (entry) => {
          if (!entry.isDirectory()) return null;

          // Skip hidden directories and common non-project folders
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            return null;
          }

          const dirPath = path.join(basePath, entry.name);
          const gitPath = path.join(dirPath, '.git');

          try {
            await fsPromises.access(gitPath);
            if (!scannedPaths.has(dirPath)) {
              scannedPaths.add(dirPath);
              return {
                id: entry.name,
                name: entry.name,
                path: dirPath,
                claudePath: null,
                displayName: entry.name,
                hasExistingSessions: false,
              };
            }
          } catch {
            // Not a git repo or access error
          }
          return null;
        });

        const results = await Promise.all(entryPromises);
        return results.filter((r) => r !== null);
      } catch (err) {
        // Ignore error
        return [];
      }
    });

    const allResults = await Promise.all(pathPromises);
    allResults.forEach((res) => projects.push(...res));

    return projects;
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Extract a readable session name from session data
   */
  extractSessionName(session) {
    if (session.title) return session.title;
    if (session.name) return session.name;

    // Look for first user message
    const messages = session.messages || session.conversation || [];
    for (const msg of messages) {
      const msgType = msg.type || msg.role;
      if (msgType === 'user' && msg.content) {
        const content = typeof msg.content === 'string' ? msg.content : msg.content[0]?.text || '';
        if (content.trim().length > 5) {
          return content.substring(0, 50) + (content.length > 50 ? '...' : '');
        }
      }
    }

    return 'Claude Code Session';
  }

  /**
   * Extract the initial prompt from session
   */
  extractInitialPrompt(session) {
    const messages = session.messages || session.conversation || [];
    for (const msg of messages) {
      const msgType = msg.type || msg.role;
      if (msgType === 'user' && msg.content) {
        return typeof msg.content === 'string' ? msg.content : msg.content[0]?.text || '';
      }
    }
    return '';
  }

  /**
   * Extract summary from session
   */
  extractSummary(session) {
    if (session.summary) return session.summary;

    const messages = session.messages || session.conversation || [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgType = messages[i].type || messages[i].role;
      if ((msgType === 'assistant' || msgType === 'claude') && messages[i].content) {
        const content =
          typeof messages[i].content === 'string'
            ? messages[i].content
            : messages[i].content[0]?.text || '';
        if (content.trim().length === 0) continue;
        return content.substring(0, 200) + (content.length > 200 ? '...' : '');
      }
    }
    return '';
  }

  /**
   * Infer session status based on content and file modification time
   */
  inferStatus(session, stats) {
    // Check if recently modified (within last 5 minutes = likely running)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (stats.mtime > fiveMinutesAgo) {
      return 'running';
    }

    // Check for completion markers in session
    if (session.status) {
      const statusLower = session.status.toLowerCase();
      if (statusLower.includes('complete') || statusLower.includes('finished')) {
        return 'completed';
      }
      if (statusLower.includes('error') || statusLower.includes('fail')) {
        return 'failed';
      }
    }

    // Default to completed for older sessions
    return 'completed';
  }

  /**
   * Try to extract repository info from project path or session
   */
  async extractRepository(projectPath, session = {}) {
    if (session.repository) return session.repository;
    if (session.project?.path) return session.project.path;

    try {
      const infoPath = path.join(projectPath, 'project-info.json');
      const content = await fsPromises.readFile(infoPath, 'utf-8');
      const info = JSON.parse(content);
      return info.repository || info.path || null;
    } catch {
      return null;
    }
  }

  /**
   * Count messages in session
   */
  countMessages(session) {
    const messages = session.messages || session.conversation || [];
    return messages.length;
  }

  /**
   * Parse messages from session for display
   */
  parseMessages(session) {
    const messages = session.messages || session.conversation || [];
    return messages
      .filter((msg) => {
        const msgType = msg.type || msg.role;
        if (msgType !== 'user' && msgType !== 'claude' && msgType !== 'assistant') {
          return false;
        }
        const content =
          typeof msg.content === 'string' ? msg.content : msg.content?.[0]?.text || '';
        return content.trim().length > 0;
      })
      .map((msg, idx) => {
        const msgType = msg.type || msg.role;
        const normalizedRole =
          msgType === 'claude' || msgType === 'assistant' ? 'assistant' : msgType;

        return {
          id: msg.id || `msg-${idx}`,
          role: normalizedRole,
          content: typeof msg.content === 'string' ? msg.content : msg.content?.[0]?.text || '',
          timestamp: msg.timestamp || null,
        };
      });
  }
}

module.exports = new ClaudeService();
