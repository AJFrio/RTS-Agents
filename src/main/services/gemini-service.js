const fs = require('fs');
const path = require('path');
const os = require('os');

class GeminiService {
  constructor() {
    this.baseDir = path.join(os.homedir(), '.gemini', 'tmp');
    this.historyDir = path.join(os.homedir(), '.gemini', 'history');
  }

  /**
   * Get the default Gemini CLI directory
   */
  getDefaultPath() {
    return this.baseDir;
  }

  /**
   * Check if Gemini CLI directory exists
   */
  isGeminiInstalled() {
    return fs.existsSync(this.baseDir);
  }

  /**
   * Scan for all Gemini project directories
   * @param {string[]} additionalPaths - Additional paths to scan
   */
  async discoverProjects(additionalPaths = []) {
    const projects = [];
    const pathsToScan = [this.baseDir, ...additionalPaths];

    for (const basePath of pathsToScan) {
      if (!fs.existsSync(basePath)) continue;

      try {
        const entries = fs.readdirSync(basePath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const projectPath = path.join(basePath, entry.name);
            const chatsPath = path.join(projectPath, 'chats');
            
            if (fs.existsSync(chatsPath)) {
              projects.push({
                hash: entry.name,
                path: projectPath,
                chatsPath: chatsPath
              });
            }
          }
        }
      } catch (err) {
        console.error(`Error scanning ${basePath}:`, err);
      }
    }

    return projects;
  }

  /**
   * Get all sessions/tasks from a project
   * @param {string} projectPath - Path to the project directory
   */
  async getProjectSessions(projectPath) {
    const chatsPath = path.join(projectPath, 'chats');
    const sessions = [];

    if (!fs.existsSync(chatsPath)) {
      return sessions;
    }

    try {
      const files = fs.readdirSync(chatsPath).filter(f => f.endsWith('.json'));

      for (const file of files) {
        try {
          const filePath = path.join(chatsPath, file);
          const stats = fs.statSync(filePath);
          const content = fs.readFileSync(filePath, 'utf-8');
          const session = JSON.parse(content);

          sessions.push({
            id: `gemini-${path.basename(projectPath)}-${file.replace('.json', '')}`,
            provider: 'gemini',
            name: this.extractSessionName(session),
            status: this.inferStatus(session, stats),
            prompt: this.extractInitialPrompt(session),
            repository: this.extractRepository(projectPath),
            createdAt: stats.birthtime,
            updatedAt: stats.mtime,
            summary: this.extractSummary(session),
            filePath: filePath,
            projectHash: path.basename(projectPath),
            messageCount: this.countMessages(session)
          });
        } catch (err) {
          console.error(`Error parsing session file ${file}:`, err);
        }
      }
    } catch (err) {
      console.error(`Error reading chats directory:`, err);
    }

    return sessions;
  }

  /**
   * Get all agents/tasks across all discovered projects
   * @param {string[]} additionalPaths - Additional paths to scan
   */
  async getAllAgents(additionalPaths = []) {
    const projects = await this.discoverProjects(additionalPaths);
    const allSessions = [];

    for (const project of projects) {
      const sessions = await this.getProjectSessions(project.path);
      allSessions.push(...sessions);
    }

    // Sort by most recent first
    return allSessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  /**
   * Get detailed session data
   * Returns lightweight data structure with only essential fields
   * @param {string} filePath - Path to the session JSON file
   */
  async getSessionDetails(filePath) {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const session = JSON.parse(content);
      const stats = fs.statSync(filePath);

      // Extract only essential data - ignore heavy fields like thoughts, tokens, toolCalls
      return {
        // Session metadata
        sessionId: session.sessionId || null,
        projectHash: session.projectHash || null,
        name: this.extractSessionName(session),
        prompt: this.extractInitialPrompt(session),
        summary: this.extractSummary(session),
        status: this.inferStatus(session, stats),
        
        // Timestamps - prefer session metadata over file stats
        createdAt: session.startTime || stats.birthtime,
        updatedAt: session.lastUpdated || stats.mtime,
        
        // Lightweight messages array (content only, no thoughts/tokens/toolCalls)
        messages: this.parseMessages(session),
        messageCount: (session.messages || session.conversation || []).length,
        
        // File stats for reference
        filePath: filePath,
        fileSize: stats.size
      };
    } catch (err) {
      console.error(`Error reading session details:`, err);
      return null;
    }
  }

  /**
   * Extract a readable session name from session data
   */
  extractSessionName(session) {
    // Try to get from metadata or first user message
    if (session.title) return session.title;
    if (session.name) return session.name;
    
    // Look for first user message - Gemini CLI uses 'type' not 'role'
    const messages = session.messages || session.conversation || [];
    for (const msg of messages) {
      // Support both 'type' (Gemini CLI format) and 'role' (legacy format)
      const msgType = msg.type || msg.role;
      if (msgType === 'user' && msg.content) {
        const content = typeof msg.content === 'string' ? msg.content : msg.content[0]?.text || '';
        return content.substring(0, 50) + (content.length > 50 ? '...' : '');
      }
    }
    
    return 'Gemini CLI Session';
  }

  /**
   * Extract the initial prompt from session
   */
  extractInitialPrompt(session) {
    const messages = session.messages || session.conversation || [];
    for (const msg of messages) {
      // Support both 'type' (Gemini CLI format) and 'role' (legacy format)
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
    // Look for last assistant/gemini message or summary field
    if (session.summary) return session.summary;
    
    const messages = session.messages || session.conversation || [];
    for (let i = messages.length - 1; i >= 0; i--) {
      // Support both 'type' (Gemini CLI format) and 'role' (legacy format)
      // Gemini CLI uses 'gemini' type, legacy format uses 'assistant' role
      const msgType = messages[i].type || messages[i].role;
      if ((msgType === 'assistant' || msgType === 'gemini') && messages[i].content) {
        const content = typeof messages[i].content === 'string' 
          ? messages[i].content 
          : messages[i].content[0]?.text || '';
        // Skip empty content (e.g., tool-only responses)
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
   * Try to extract repository info from project path
   */
  extractRepository(projectPath) {
    // The project hash doesn't directly map to a repo, but we can check for .git
    try {
      // Look for a mapping file if it exists
      const mappingFile = path.join(projectPath, 'project-info.json');
      if (fs.existsSync(mappingFile)) {
        const info = JSON.parse(fs.readFileSync(mappingFile, 'utf-8'));
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
   * Only extracts essential fields (id, role, content, timestamp) - ignores thoughts, tokens, toolCalls
   * Filters out messages with empty content and non-conversation types (info, error)
   */
  parseMessages(session) {
    const messages = session.messages || session.conversation || [];
    return messages
      .filter(msg => {
        // Get message type
        const msgType = msg.type || msg.role;
        // Only include user and gemini/assistant messages
        if (msgType !== 'user' && msgType !== 'gemini' && msgType !== 'assistant') {
          return false;
        }
        // Filter out messages with empty content (e.g., tool-only responses)
        const content = typeof msg.content === 'string' ? msg.content : msg.content?.[0]?.text || '';
        return content.trim().length > 0;
      })
      .map((msg, idx) => {
        // Support both 'type' (Gemini CLI format) and 'role' (legacy format)
        // Normalize 'gemini' type to 'assistant' for UI consistency
        const msgType = msg.type || msg.role;
        const normalizedRole = msgType === 'gemini' ? 'assistant' : msgType;
        
        return {
          id: msg.id || `msg-${idx}`,
          role: normalizedRole,
          content: typeof msg.content === 'string' ? msg.content : msg.content?.[0]?.text || '',
          timestamp: msg.timestamp || null
          // Intentionally omitting: thoughts, tokens, toolCalls (to keep data lightweight)
        };
      });
  }

  /**
   * Get available local projects that can be used with Gemini CLI
   * Scans for directories with .git folders in common locations
   */
  async getAvailableProjects(additionalPaths = []) {
    const projects = [];
    const scannedPaths = new Set();

    // Scan the Gemini tmp directory for existing project hashes
    const geminiProjects = await this.discoverProjects(additionalPaths);
    
    for (const project of geminiProjects) {
      // Try to find the original project path from project-info.json if it exists
      const infoPath = path.join(project.path, 'project-info.json');
      let projectPath = project.path;
      let projectName = project.hash;

      if (fs.existsSync(infoPath)) {
        try {
          const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
          if (info.path) {
            projectPath = info.path;
            projectName = path.basename(info.path);
          }
        } catch (err) {
          // Ignore parse errors
        }
      }

      if (!scannedPaths.has(projectPath)) {
        scannedPaths.add(projectPath);
        projects.push({
          id: project.hash,
          name: projectName,
          path: projectPath,
          geminiPath: project.path,
          displayName: projectName,
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
                geminiPath: null,
                displayName: entry.name,
                hasExistingSessions: false
              });
            }
          }
        }
      } catch (err) {
        console.error(`Error scanning ${basePath}:`, err);
      }
    }

    return projects;
  }

  /**
   * Start a new Gemini CLI session
   * @param {object} options - Session options
   * @param {string} options.prompt - The task description/prompt
   * @param {string} options.projectPath - Path to the project directory
   * @param {boolean} [options.sandbox] - Whether to run in sandbox mode
   */
  async startSession(options) {
    const { spawn } = require('child_process');
    const { prompt, projectPath, sandbox = false } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!projectPath) {
      throw new Error('Project path is required');
    }

    if (!fs.existsSync(projectPath)) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    // Build the gemini command
    const args = ['-p', prompt];
    
    if (sandbox) {
      args.push('--sandbox');
    }

    return new Promise((resolve, reject) => {
      // Check if gemini CLI is available
      const geminiCmd = process.platform === 'win32' ? 'gemini.cmd' : 'gemini';
      
      const child = spawn(geminiCmd, args, {
        cwd: projectPath,
        shell: true,
        detached: true,
        stdio: 'ignore'
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error('Gemini CLI not found. Please ensure it is installed and in your PATH.'));
        } else {
          reject(new Error(`Failed to start Gemini CLI: ${err.message}`));
        }
      });

      // Detach the process so it runs independently
      child.unref();

      // Give it a moment to start, then resolve
      setTimeout(() => {
        resolve({
          id: `gemini-${Date.now()}`,
          provider: 'gemini',
          name: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
          status: 'running',
          prompt: prompt,
          repository: projectPath,
          createdAt: new Date(),
          message: 'Gemini CLI session started. Check your terminal for the interactive session.'
        });
      }, 500);
    });
  }
}

module.exports = new GeminiService();
