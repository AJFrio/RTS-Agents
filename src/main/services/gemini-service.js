const fs = require('fs');
const path = require('path');
const os = require('os');

class GeminiService {
  constructor() {
    this.baseDir = path.join(os.homedir(), '.gemini', 'tmp');
    this.historyDir = path.join(os.homedir(), '.gemini', 'history');
    // Debug: log the paths being used
    console.log('[GeminiService] Base dir:', this.baseDir);
    console.log('[GeminiService] History dir:', this.historyDir);
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

    console.log(`[GeminiService] Scanning paths:`, pathsToScan);

    for (const basePath of pathsToScan) {
      if (!fs.existsSync(basePath)) {
        console.log(`[GeminiService] Path does not exist: ${basePath}`);
        continue;
      }

      try {
        const entries = fs.readdirSync(basePath, { withFileTypes: true });
        console.log(`[GeminiService] Found ${entries.length} entries in ${basePath}`);
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            // Skip known non-project directories
            if (entry.name === 'bin' || entry.name === 'cache') {
              continue;
            }
            
            const projectPath = path.join(basePath, entry.name);
            const chatsPath = path.join(projectPath, 'chats');
            
            if (fs.existsSync(chatsPath)) {
              console.log(`[GeminiService] Found project: ${entry.name}`);
              projects.push({
                hash: entry.name,
                path: projectPath,
                chatsPath: chatsPath
              });
            }
          }
        }
      } catch (err) {
        console.error(`[GeminiService] Error scanning ${basePath}:`, err);
      }
    }

    console.log(`[GeminiService] Total projects discovered: ${projects.length}`);
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
      console.log(`[GeminiService] No chats directory at: ${chatsPath}`);
      return sessions;
    }

    try {
      const files = fs.readdirSync(chatsPath).filter(f => f.endsWith('.json'));
      console.log(`[GeminiService] Found ${files.length} session files in ${chatsPath}`);

      for (const file of files) {
        try {
          const filePath = path.join(chatsPath, file);
          const stats = fs.statSync(filePath);
          const content = fs.readFileSync(filePath, 'utf-8');
          const session = JSON.parse(content);

          // Use session timestamps if available, fall back to file stats
          const createdAt = session.startTime ? new Date(session.startTime) : stats.birthtime;
          const updatedAt = session.lastUpdated ? new Date(session.lastUpdated) : stats.mtime;

          sessions.push({
            id: `gemini-${path.basename(projectPath)}-${file.replace('.json', '')}`,
            provider: 'gemini',
            name: this.extractSessionName(session),
            status: this.inferStatus(session, stats),
            prompt: this.extractInitialPrompt(session),
            repository: this.extractRepository(projectPath),
            createdAt: createdAt,
            updatedAt: updatedAt,
            summary: this.extractSummary(session),
            filePath: filePath,
            projectHash: path.basename(projectPath),
            messageCount: this.countMessages(session)
          });
        } catch (err) {
          console.error(`[GeminiService] Error parsing session file ${file}:`, err);
        }
      }
    } catch (err) {
      console.error(`[GeminiService] Error reading chats directory:`, err);
    }

    console.log(`[GeminiService] Returning ${sessions.length} sessions from ${projectPath}`);
    return sessions;
  }

  /**
   * Get all agents/tasks across all discovered projects
   * @param {string[]} additionalPaths - Additional paths to scan
   */
  async getAllAgents(additionalPaths = []) {
    console.log('[GeminiService] getAllAgents called with paths:', additionalPaths);
    const projects = await this.discoverProjects(additionalPaths);
    const allSessions = [];

    for (const project of projects) {
      const sessions = await this.getProjectSessions(project.path);
      allSessions.push(...sessions);
    }

    console.log(`[GeminiService] Total sessions found: ${allSessions.length}`);
    
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
        // Skip very short inputs like "exit" or single commands
        if (content.trim().length > 5) {
          return content.substring(0, 50) + (content.length > 50 ? '...' : '');
        }
      }
    }
    
    // If no good user message found, try to get something meaningful from first info message
    for (const msg of messages) {
      const msgType = msg.type || msg.role;
      if ((msgType === 'info' || msgType === 'error') && msg.content) {
        const content = typeof msg.content === 'string' ? msg.content : msg.content[0]?.text || '';
        if (content.trim().length > 10) {
          return content.substring(0, 50) + (content.length > 50 ? '...' : '');
        }
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
   * Scans for directories with .git folders in the provided paths
   * Only returns actual Git repositories, not Gemini session folders
   */
  async getAvailableProjects(additionalPaths = []) {
    const projects = [];
    const scannedPaths = new Set();

    // Only scan the provided paths for git repositories
    // Do NOT include Gemini session folders from .gemini/tmp
    for (const basePath of additionalPaths) {
      if (!fs.existsSync(basePath)) continue;

      // Skip the Gemini directories - these are session data, not project repos
      if (basePath.includes('.gemini')) continue;

      try {
        const entries = fs.readdirSync(basePath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            // Skip hidden directories and common non-project folders
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            
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
   * Spawns a detached process running: gemini -p "prompt" -y
   * @param {object} options - Session options
   * @param {string} options.prompt - The task description/prompt
   * @param {string} options.projectPath - Path to the project directory
   */
  async startSession(options) {
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

    // Generate session ID
    const sessionId = `gemini-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Build command: gemini -p "prompt" -y
    // -p: prompt/headless mode
    // -y: yolo mode (auto-approve all actions)
    // Wrap prompt in quotes to handle spaces and special characters
    const args = ['-p', `"${prompt.replace(/"/g, '\\"')}"`, '-y'];

    return new Promise((resolve, reject) => {
      const geminiCmd = process.platform === 'win32' ? 'gemini.cmd' : 'gemini';
      
      console.log(`Starting Gemini CLI in ${projectPath}`);
      console.log(`Command: ${geminiCmd} ${args.join(' ')}`);
      
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

      // Detach the child process so it runs independently
      child.unref();

      // Return immediately after spawning
      // The process will run in the background and create session files
      // that we can discover later through the normal scanning
      setTimeout(() => {
        resolve({
          id: sessionId,
          provider: 'gemini',
          name: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
          status: 'running',
          prompt: prompt,
          repository: projectPath,
          createdAt: new Date(),
          message: 'Gemini CLI session started. The task is running in the background.'
        });
      }, 500);
    });
  }
}

module.exports = new GeminiService();
