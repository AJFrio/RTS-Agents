const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1';
const CLAUDE_HOME = path.join(os.homedir(), '.claude');
const CLAUDE_PROJECTS_DIR = path.join(CLAUDE_HOME, 'projects');

// Store for tracking cloud conversations (since Anthropic doesn't have a list conversations endpoint)
let trackedConversations = [];

class ClaudeService {
  constructor() {
    this.apiKey = null;
    // Debug: log the paths being used
    console.log('[ClaudeService] Claude home dir:', CLAUDE_HOME);
    console.log('[ClaudeService] Projects dir:', CLAUDE_PROJECTS_DIR);
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
   * Check if Claude Code CLI is installed
   */
  isClaudeInstalled() {
    return fs.existsSync(CLAUDE_HOME);
  }

  /**
   * Scan for all Claude Code project directories
   * @param {string[]} additionalPaths - Additional paths to scan
   */
  async discoverProjects(additionalPaths = []) {
    const projects = [];
    const pathsToScan = [CLAUDE_PROJECTS_DIR, ...additionalPaths];

    console.log(`[ClaudeService] Scanning paths:`, pathsToScan);

    for (const basePath of pathsToScan) {
      if (!fs.existsSync(basePath)) {
        console.log(`[ClaudeService] Path does not exist: ${basePath}`);
        continue;
      }

      try {
        const entries = fs.readdirSync(basePath, { withFileTypes: true });
        console.log(`[ClaudeService] Found ${entries.length} entries in ${basePath}`);

        for (const entry of entries) {
          if (entry.isDirectory()) {
            // Skip known non-project directories
            if (entry.name === 'bin' || entry.name === 'cache' || entry.name === 'tmp') {
              continue;
            }

            const projectPath = path.join(basePath, entry.name);
            
            // Check for sessions directory or session files
            const sessionsPath = path.join(projectPath, 'sessions');
            const chatsPath = path.join(projectPath, 'chats');
            
            if (fs.existsSync(sessionsPath) || fs.existsSync(chatsPath)) {
              console.log(`[ClaudeService] Found project: ${entry.name}`);
              projects.push({
                hash: entry.name,
                path: projectPath,
                sessionsPath: fs.existsSync(sessionsPath) ? sessionsPath : chatsPath
              });
            } else {
              // Check if the directory itself contains session files
              const files = fs.readdirSync(projectPath);
              const hasSessionFiles = files.some(f => f.endsWith('.json'));
              if (hasSessionFiles) {
                console.log(`[ClaudeService] Found project with direct sessions: ${entry.name}`);
                projects.push({
                  hash: entry.name,
                  path: projectPath,
                  sessionsPath: projectPath
                });
              }
            }
          }
        }
      } catch (err) {
        console.error(`[ClaudeService] Error scanning ${basePath}:`, err);
      }
    }

    console.log(`[ClaudeService] Total projects discovered: ${projects.length}`);
    return projects;
  }

  /**
   * Get all sessions from a project
   * @param {string} projectPath - Path to the project directory
   * @param {string} sessionsPath - Path to the sessions directory
   */
  async getProjectSessions(projectPath, sessionsPath) {
    const sessions = [];

    if (!fs.existsSync(sessionsPath)) {
      console.log(`[ClaudeService] No sessions directory at: ${sessionsPath}`);
      return sessions;
    }

    try {
      const files = fs.readdirSync(sessionsPath).filter(f => f.endsWith('.json'));
      console.log(`[ClaudeService] Found ${files.length} session files in ${sessionsPath}`);

      for (const file of files) {
        try {
          const filePath = path.join(sessionsPath, file);
          const stats = fs.statSync(filePath);
          const content = fs.readFileSync(filePath, 'utf-8');
          const session = JSON.parse(content);

          // Use session timestamps if available, fall back to file stats
          const createdAt = session.startTime || session.created_at ? 
            new Date(session.startTime || session.created_at) : stats.birthtime;
          const updatedAt = session.lastUpdated || session.updated_at ? 
            new Date(session.lastUpdated || session.updated_at) : stats.mtime;

          sessions.push({
            id: `claude-local-${path.basename(projectPath)}-${file.replace('.json', '')}`,
            provider: 'claude',
            source: 'local',
            name: this.extractSessionName(session),
            status: this.inferStatus(session, stats),
            prompt: this.extractInitialPrompt(session),
            repository: this.extractRepository(projectPath, session),
            createdAt: createdAt,
            updatedAt: updatedAt,
            summary: this.extractSummary(session),
            filePath: filePath,
            projectHash: path.basename(projectPath),
            messageCount: this.countMessages(session)
          });
        } catch (err) {
          console.error(`[ClaudeService] Error parsing session file ${file}:`, err);
        }
      }
    } catch (err) {
      console.error(`[ClaudeService] Error reading sessions directory:`, err);
    }

    console.log(`[ClaudeService] Returning ${sessions.length} sessions from ${projectPath}`);
    return sessions;
  }

  /**
   * Get all local agents/sessions across all discovered projects
   * @param {string[]} additionalPaths - Additional paths to scan
   */
  async getAllLocalSessions(additionalPaths = []) {
    console.log('[ClaudeService] getAllLocalSessions called with paths:', additionalPaths);
    const projects = await this.discoverProjects(additionalPaths);
    const allSessions = [];

    for (const project of projects) {
      const sessions = await this.getProjectSessions(project.path, project.sessionsPath);
      allSessions.push(...sessions);
    }

    console.log(`[ClaudeService] Total local sessions found: ${allSessions.length}`);
    return allSessions;
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

    const url = new URL(`${ANTHROPIC_API_URL}${endpoint}`);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve(data);
            }
          } else {
            reject(new Error(`Anthropic API error: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(60000, () => {
        req.destroy();
        reject(new Error('Anthropic API request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Create a message using the Anthropic Messages API
   * @param {Array} messages - Array of message objects
   * @param {object} options - Additional options (model, max_tokens, etc.)
   */
  async createMessage(messages, options = {}) {
    const body = {
      model: options.model || 'claude-sonnet-4-20250514',
      max_tokens: options.max_tokens || 4096,
      messages: messages,
      ...options
    };

    // Remove custom options that aren't part of the API
    delete body.title;
    delete body.repository;
    delete body.projectPath;

    return this.request('/messages', 'POST', body);
  }

  /**
   * Check if API key is valid by making a test request
   */
  async testConnection() {
    try {
      // Make a minimal request to verify the API key
      await this.createMessage([
        { role: 'user', content: 'Hi' }
      ], { max_tokens: 10 });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
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
    const existingIndex = trackedConversations.findIndex(c => c.id === conversationId);
    const conversationInfo = {
      id: conversationId,
      createdAt: new Date().toISOString(),
      prompt: metadata.prompt || '',
      repository: metadata.repository || null,
      title: metadata.title || null,
      messages: metadata.messages || [],
      lastResponse: metadata.lastResponse || null,
      ...metadata
    };

    if (existingIndex >= 0) {
      trackedConversations[existingIndex] = { ...trackedConversations[existingIndex], ...conversationInfo };
    } else {
      trackedConversations.unshift(conversationInfo);
    }

    // Keep only last 100 conversations in memory
    if (trackedConversations.length > 100) {
      trackedConversations = trackedConversations.slice(0, 100);
    }
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
    return trackedConversations.map(conv => this.normalizeCloudConversation(conv));
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
      messages: conversation.messages || []
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
    if (this.isClaudeInstalled()) {
      try {
        const localSessions = await this.getAllLocalSessions(additionalPaths);
        results.push(...localSessions);
      } catch (err) {
        console.error('[ClaudeService] Error getting local sessions:', err);
      }
    }

    // Get cloud conversations if API key is set
    if (this.apiKey) {
      try {
        const cloudConversations = await this.getAllCloudConversations();
        results.push(...cloudConversations);
      } catch (err) {
        console.error('[ClaudeService] Error getting cloud conversations:', err);
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
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const session = JSON.parse(content);
      const stats = fs.statSync(filePath);

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
        fileSize: stats.size
      };
    } catch (err) {
      console.error(`[ClaudeService] Error reading session details:`, err);
      return null;
    }
  }

  /**
   * Get detailed cloud conversation data
   * @param {string} conversationId - The conversation ID
   */
  async getCloudConversationDetails(conversationId) {
    const conversation = trackedConversations.find(c => c.id === conversationId);
    
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    return {
      ...this.normalizeCloudConversation(conversation),
      messages: (conversation.messages || []).map((msg, idx) => ({
        id: `msg-${idx}`,
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : msg.content?.[0]?.text || '',
        timestamp: null
      }))
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
    const { prompt, repository, title, projectPath } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    // If projectPath is provided and CLI is installed, start a local session
    if (projectPath && this.isClaudeInstalled()) {
      return this.startLocalSession(options);
    }

    // Otherwise, use the cloud API
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    // Create conversation ID
    const conversationId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Build initial messages
    const messages = [
      { role: 'user', content: prompt }
    ];

    try {
      // Make the API request
      const response = await this.createMessage(messages, {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096
      });

      // Track this conversation
      this.trackConversation(conversationId, {
        prompt: prompt,
        repository: repository,
        title: title || prompt.substring(0, 50),
        messages: messages,
        lastResponse: response,
        status: 'completed',
        updatedAt: new Date().toISOString()
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
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      // Track failed conversation
      this.trackConversation(conversationId, {
        prompt: prompt,
        repository: repository,
        title: title,
        messages: messages,
        status: 'failed',
        error: err.message
      });
      throw err;
    }
  }

  /**
   * Start a new local Claude Code CLI session
   * @param {object} options - Session options
   * @param {string} options.prompt - The task description/prompt
   * @param {string} options.projectPath - Path to the project directory
   */
  async startLocalSession(options) {
    const { spawn } = require('child_process');
    const { prompt, projectPath } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!projectPath) {
      throw new Error('Project path is required');
    }

    if (!fs.existsSync(projectPath)) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    // Build the claude command
    const args = ['-p', prompt, '--print'];

    return new Promise((resolve, reject) => {
      // Check if claude CLI is available
      const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';

      const child = spawn(claudeCmd, args, {
        cwd: projectPath,
        shell: true,
        detached: true,
        stdio: 'ignore'
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error('Claude Code CLI not found. Please ensure it is installed and in your PATH.'));
        } else {
          reject(new Error(`Failed to start Claude Code CLI: ${err.message}`));
        }
      });

      // Detach the process so it runs independently
      child.unref();

      // Give it a moment to start, then resolve
      setTimeout(() => {
        resolve({
          id: `claude-local-${Date.now()}`,
          provider: 'claude',
          source: 'local',
          name: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
          status: 'running',
          prompt: prompt,
          repository: projectPath,
          createdAt: new Date(),
          message: 'Claude Code CLI session started. Check your terminal for the interactive session.'
        });
      }, 500);
    });
  }

  /**
   * Get available local projects that can be used with Claude Code CLI
   * @param {string[]} additionalPaths - Additional paths to scan
   */
  async getAvailableProjects(additionalPaths = []) {
    const projects = [];
    const scannedPaths = new Set();

    // Scan the Claude projects directory for existing project hashes
    const claudeProjects = await this.discoverProjects(additionalPaths);

    for (const project of claudeProjects) {
      if (!scannedPaths.has(project.path)) {
        scannedPaths.add(project.path);
        projects.push({
          id: project.hash,
          name: project.hash,
          path: project.path,
          claudePath: project.path,
          displayName: project.hash,
          hasExistingSessions: true
        });
      }
    }

    // Also scan additional paths for git repositories
    for (const basePath of additionalPaths) {
      if (!fs.existsSync(basePath)) continue;

      try {
        const entries = fs.readdirSync(basePath, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const dirPath = path.join(basePath, entry.name);
            const gitPath = path.join(dirPath, '.git');

            if (fs.existsSync(gitPath) && !scannedPaths.has(dirPath)) {
              scannedPaths.add(dirPath);
              projects.push({
                id: entry.name,
                name: entry.name,
                path: dirPath,
                claudePath: null,
                displayName: entry.name,
                hasExistingSessions: false
              });
            }
          }
        }
      } catch (err) {
        console.error(`[ClaudeService] Error scanning ${basePath}:`, err);
      }
    }

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
        const content = typeof messages[i].content === 'string'
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
  extractRepository(projectPath, session = {}) {
    // Check session for repository info
    if (session.repository) return session.repository;
    if (session.project?.path) return session.project.path;

    // Try to find project-info.json
    try {
      const infoPath = path.join(projectPath, 'project-info.json');
      if (fs.existsSync(infoPath)) {
        const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
        return info.repository || info.path || null;
      }
    } catch (err) {
      // Ignore
    }
    return null;
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
      .filter(msg => {
        const msgType = msg.type || msg.role;
        if (msgType !== 'user' && msgType !== 'claude' && msgType !== 'assistant') {
          return false;
        }
        const content = typeof msg.content === 'string' ? msg.content : msg.content?.[0]?.text || '';
        return content.trim().length > 0;
      })
      .map((msg, idx) => {
        const msgType = msg.type || msg.role;
        const normalizedRole = (msgType === 'claude' || msgType === 'assistant') ? 'assistant' : msgType;

        return {
          id: msg.id || `msg-${idx}`,
          role: normalizedRole,
          content: typeof msg.content === 'string' ? msg.content : msg.content?.[0]?.text || '',
          timestamp: msg.timestamp || null
        };
      });
  }
}

module.exports = new ClaudeService();
