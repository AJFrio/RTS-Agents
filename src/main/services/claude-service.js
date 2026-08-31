const fs = require('fs');
const fsPromises = fs.promises;
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
const { createFollowUpController } = require('./acp-follow-up');

// Claude Code names each transcript after its session uuid.
const SESSION_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    // Interactive follow-up turns over live (or resumed) ACP adapters.
    this.followUp = createFollowUpController({
      provider: 'Claude Code',
      acpService,
      adapterName: 'claude',
      permissionPolicy: 'safe-tools',
      hooks: {
        getRecord: (taskId) => this.trackedLocalSessions.find((x) => x.id === taskId) || null,
        onUserMessage: (taskId, text) => this._appendTranscriptMessage(taskId, 'user', text),
        onTurnStart: (taskId) =>
          this._updateTrackedLocalSession(taskId, { status: 'running', error: null }),
        onTurnEnd: (taskId, { error }) =>
          this._updateTrackedLocalSession(taskId, {
            status: error ? 'failed' : 'completed',
            error: error || null,
          }),
        onStreamText: (taskId, text) => this._appendStreamChunk(taskId, text),
      },
    });
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
            const hasSessionFiles = files.some(
              (f) => f.endsWith('.json') || f.endsWith('.jsonl')
            );
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
      const files = (await fsPromises.readdir(sessionsPath)).filter(
        (f) => f.endsWith('.json') || f.endsWith('.jsonl')
      );

      const sessionPromises = files.map(async (file) => {
        try {
          const filePath = path.join(sessionsPath, file);
          const [stats, content] = await Promise.all([
            fsPromises.stat(filePath),
            fsPromises.readFile(filePath, 'utf-8'),
          ]);
          const session = file.endsWith('.jsonl')
            ? this.parseTranscript(content)
            : JSON.parse(content);

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
            id: `claude-local-${path.basename(projectPath)}-${file.replace(/\.jsonl?$/, '')}`,
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
      const session = filePath.endsWith('.jsonl')
        ? this.parseTranscript(content)
        : JSON.parse(content);

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
    const { prompt, repository, title, projectPath, attachments, model } = options;

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
        model: model || CLAUDE_DEFAULT_MODEL,
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
    const { prompt, projectPath, allowedTools = CLAUDE_DEFAULT_TOOLS, command, model } = options;

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
      return this._startAcpSession(adapter, { prompt, projectPath, model }, sessionId);
    }
    return this._spawnLegacySession({ prompt, projectPath, allowedTools, command, model }, sessionId);
  }

  _startAcpSession(adapter, { prompt, projectPath, model }, sessionId) {
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

      // Interactive path: keep the adapter alive after the opening turn so
      // the user can send follow-up prompts into the same conversation.
      acpService
        .openSession({
          command: adapter,
          cwd: projectPath,
          model,
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
            // Always read the live tracked entry: _updateTrackedLocalSession
            // replaces the object on every patch, so a closure over `record`
            // would drop follow-up turns and merge replies into the wrong
            // assistant message.
            this._appendStreamChunk(sessionId, text);
          },
        })
        .then((session) => {
          this.followUp.register(sessionId, session, { projectPath });
          // Persist the adapter's own session id so this task can be resumed
          // via session/load after a restart.
          if (session.sessionId) {
            this._updateTrackedLocalSession(sessionId, { acpSessionId: session.sessionId });
          }
          return session.prompt(prompt);
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
            this._spawnLegacySession({ prompt, projectPath, model }, sessionId).then(
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

  /**
   * Build a resumable record for a session discovered by scanning
   * the Claude Code projects directory as .jsonl transcripts.
   *
   * These are not tracked records - the app never dispatched them - but the
   * transcript filename IS the ACP session id, and `claude-agent-acp`
   * accepts it in session/load. Verified: prompting a loaded session appends
   * to the same transcript rather than forking a new one, so the follow-up
   * shows up in the existing conversation.
   *
   * Returns null when the id/path do not identify a resumable session.
   */
  recordForFollowUp(taskId, filePath) {
    const tracked = this.trackedLocalSessions.find((x) => x.id === taskId);
    if (tracked) return tracked;

    if (!filePath || !String(taskId).startsWith('claude-local-')) return null;

    // The filename is the session uuid; anything else is not resumable.
    const base = path.basename(String(filePath)).replace(/\.jsonl?$/, '');
    if (!SESSION_UUID_RE.test(base)) return null;

    // The project directory cannot be recovered from the parent folder name:
    // Claude Code replaces separators with dashes, which is ambiguous for any
    // directory that itself contains a dash. Each transcript record carries
    // the real cwd, so read it from the file instead of guessing.
    const projectPath = this._readTranscriptCwd(filePath);
    if (!projectPath) return null;

    return {
      id: taskId,
      acpSessionId: base,
      projectPath,
      filePath,
      discovered: true,
    };
  }

  /**
   * Recover the project directory a discovered session ran in. Reads only the
   * head of the transcript - `cwd` appears on the early records.
   */
  _readTranscriptCwd(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const line of content.split('\n', 40)) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line);
          if (record?.cwd && typeof record.cwd === 'string') return record.cwd;
        } catch {
          // Skip malformed lines; transcripts can contain partial writes.
        }
      }
    } catch (err) {
      console.error(`Could not read transcript cwd from ${filePath}:`, err?.message || err);
    }
    return null;
  }

  /**
   * Whether this task can take a follow-up right now: its adapter is still
   * live, we stored an ACP session id, or it is a discovered .jsonl session
   * whose filename gives us one. Sessions are lost on crash and idle
   * reaping, so this is a point-in-time answer.
   */
  supportsFollowUp(taskId, filePath = null) {
    if (this.followUp.supportsFollowUp(taskId)) return true;
    return Boolean(this.recordForFollowUp(taskId, filePath));
  }

  /** True when an adapter is already warm for this task (no resume needed). */
  hasLiveSession(taskId) {
    return this.followUp.hasLiveSession(taskId);
  }

  sendFollowUp(taskId, message, filePath = null) {
    // Discovered sessions have no tracked record, so hand the derived one to
    // the controller for this call.
    const derived = this.recordForFollowUp(taskId, filePath);
    if (derived?.discovered) {
      return this.followUp.sendFollowUp(taskId, message, { record: derived });
    }
    return this.followUp.sendFollowUp(taskId, message);
  }

  /** Tear down every live adapter (app quit). */
  disposeLiveSessions() {
    this.followUp.disposeAll();
  }

  /** Append a whole message, breaking any in-progress assistant merge. */
  _appendTranscriptMessage(taskId, role, content) {
    const record = this.trackedLocalSessions.find((x) => x.id === taskId);
    if (!record) return;
    const next = [
      ...(Array.isArray(record.streamMessages) ? record.streamMessages : []),
      {
        role,
        content,
        timestamp: new Date().toISOString(),
        id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      },
    ];
    this._updateTrackedLocalSession(taskId, { streamMessages: next });
  }

  /** Merge a streamed chunk into the trailing assistant message. */
  _appendStreamChunk(taskId, text) {
    const record = this.trackedLocalSessions.find((x) => x.id === taskId);
    if (!record) return;
    const next = appendAgentChunk(
      Array.isArray(record.streamMessages) ? record.streamMessages : [],
      text,
      new Date().toISOString()
    );
    this._updateTrackedLocalSession(taskId, { streamMessages: next }, true);
  }

  _spawnLegacySession({ prompt, projectPath, allowedTools = CLAUDE_DEFAULT_TOOLS, command, model }, sessionId) {
    const { spawn } = require('child_process');

    // Build command: claude -p "prompt" --allowedTools "Read,Edit,Bash"
    // -p: prompt/headless mode
    // --allowedTools: auto-approve these tools
    const args = ['-p', prompt, '--allowedTools', allowedTools];
    if (model) {
      args.push('--model', String(model));
    }

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
   * Normalize a Claude Code `.jsonl` transcript into the same shape the
   * legacy `.json` session files use, so every downstream extractor
   * (name/prompt/summary/status/messages) keeps working unchanged.
   *
   * Transcripts are line-delimited: one JSON record per line. Only `user`
   * and `assistant` records are conversation turns; the rest (`mode`,
   * `attachment`, `ai-title`, ...) are metadata. Malformed lines are
   * skipped so one truncated write cannot hide an entire session.
   *
   * @param {string} content - Raw file contents
   * @returns {{messages: Array, title?: string, startTime?: string, lastUpdated?: string}}
   */
  parseTranscript(content) {
    const messages = [];
    // tool_use id -> tool call entry, so a later tool_result can be attached
    const toolCallsById = new Map();
    let title = null;
    let startTime = null;
    let lastUpdated = null;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let record;
      try {
        record = JSON.parse(trimmed);
      } catch {
        // Truncated or partially-flushed line; skip it and keep going.
        continue;
      }

      if (record.type === 'ai-title' && record.aiTitle) {
        title = record.aiTitle;
        continue;
      }

      if (record.type !== 'user' && record.type !== 'assistant') continue;
      if (!record.message) continue;

      const content = record.message.content;

      // A turn carrying only tool results is the transport for the previous
      // tool call's output, not a message of its own. Attach it to the call
      // so the UI can show the result inline instead of as an empty bubble.
      const toolResults = this.extractToolResults(content);
      if (toolResults.length && !this.extractContentText(content)) {
        for (const result of toolResults) {
          const call = toolCallsById.get(result.toolUseId);
          if (call) call.result = result.content;
        }
        continue;
      }

      const text = this.extractContentText(content);
      const thinking = this.extractThinkingText(content);
      const toolCalls = this.extractToolCalls(content);
      if (!text && !toolCalls.length) continue;

      if (record.timestamp) {
        if (!startTime) startTime = record.timestamp;
        lastUpdated = record.timestamp;
      }

      for (const call of toolCalls) toolCallsById.set(call.id, call);

      const message = {
        id: record.uuid,
        role: record.message.role || record.type,
        content: text,
        timestamp: record.timestamp,
      };
      if (thinking) message.thinking = thinking;
      if (toolCalls.length) message.toolCalls = toolCalls;
      messages.push(message);
    }

    const session = { messages };
    if (title) session.title = title;
    if (startTime) session.startTime = startTime;
    if (lastUpdated) session.lastUpdated = lastUpdated;
    return session;
  }

  /**
   * Summarize a tool call's input into a short, human-readable target,
   * e.g. the command for Bash or the file for Read/Edit/Write.
   *
   * @param {object} input
   * @returns {string}
   */
  summarizeToolInput(input) {
    if (!input || typeof input !== 'object') return '';
    const candidate =
      input.command || input.file_path || input.path || input.pattern || input.url || '';
    return typeof candidate === 'string' ? candidate : '';
  }

  /**
   * Extract `tool_use` blocks as structured entries the UI can render as
   * collapsed chips. `result` is filled in later from the matching
   * `tool_result` block.
   *
   * @param {string|Array} content
   * @returns {Array<{id: string, name: string, target: string, input: object, result: string|null}>}
   */
  extractToolCalls(content) {
    if (!Array.isArray(content)) return [];
    return content
      .filter((block) => block && block.type === 'tool_use')
      .map((block) => ({
        id: block.id,
        name: block.name || 'tool',
        target: this.summarizeToolInput(block.input),
        input: block.input || {},
        result: null,
      }));
  }

  /**
   * Extract `tool_result` blocks, normalizing their content to text.
   *
   * @param {string|Array} content
   * @returns {Array<{toolUseId: string, content: string}>}
   */
  extractToolResults(content) {
    if (!Array.isArray(content)) return [];
    return content
      .filter((block) => block && block.type === 'tool_result')
      .map((block) => ({
        toolUseId: block.tool_use_id,
        content:
          typeof block.content === 'string'
            ? block.content
            : this.extractContentText(block.content),
      }));
  }

  /**
   * Extract `thinking` blocks so the UI can collapse them behind a
   * disclosure rather than mixing them into the visible reply.
   *
   * @param {string|Array} content
   * @returns {string}
   */
  extractThinkingText(content) {
    if (!Array.isArray(content)) return '';
    return content
      .filter((block) => block && block.type === 'thinking' && typeof block.thinking === 'string')
      .map((block) => block.thinking)
      .join('\n')
      .trim();
  }

  /**
   * Flatten Anthropic message content into plain text.
   * Content is either a bare string or an array of blocks; only `text`
   * blocks are user-visible, so `tool_use`/`tool_result`/`thinking`/`image`
   * blocks are dropped rather than rendered as noise.
   *
   * @param {string|Array} content
   * @returns {string}
   */
  extractContentText(content) {
    if (typeof content === 'string') return content.trim();
    if (!Array.isArray(content)) return '';

    return content
      .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n')
      .trim();
  }

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
        // Keep tool-only turns: they render as chips even with no prose.
        return content.trim().length > 0 || msg.toolCalls?.length > 0;
      })
      .map((msg, idx) => {
        const msgType = msg.type || msg.role;
        const normalizedRole =
          msgType === 'claude' || msgType === 'assistant' ? 'assistant' : msgType;

        const parsed = {
          id: msg.id || `msg-${idx}`,
          role: normalizedRole,
          content: typeof msg.content === 'string' ? msg.content : msg.content?.[0]?.text || '',
          timestamp: msg.timestamp || null,
        };
        if (msg.thinking) parsed.thinking = msg.thinking;
        if (msg.toolCalls?.length) parsed.toolCalls = msg.toolCalls;
        return parsed;
      });
  }
}

module.exports = new ClaudeService();
