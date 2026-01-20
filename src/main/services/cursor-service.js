const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://api.cursor.com/v0';

class CursorService {
  constructor() {
    this.apiKey = null;
  }

  /**
   * Set the API key for Cursor Cloud API
   * @param {string} apiKey 
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Make an HTTP request to the Cursor Cloud API
   * Uses Basic Auth with API key
   * @param {string} endpoint 
   * @param {string} method 
   * @param {object} body 
   */
  async request(endpoint, method = 'GET', body = null) {
    if (!this.apiKey) {
      throw new Error('Cursor API key not configured');
    }

    const url = new URL(`${BASE_URL}${endpoint}`);
    
    // Basic Auth: API_KEY as username, empty password
    const auth = Buffer.from(`${this.apiKey}:`).toString('base64');
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Authorization': `Basic ${auth}`,
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
            reject(new Error(`Cursor API error: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Cursor API request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    });
  }

  /**
   * List all cloud agents
   * @param {number} limit - Max number of agents to return (default: 20, max: 100)
   * @param {string} cursor - Pagination cursor
   */
  async listAgents(limit = 100, cursor = null) {
    let endpoint = `/agents?limit=${limit}`;
    if (cursor) {
      endpoint += `&cursor=${cursor}`;
    }
    return this.request(endpoint);
  }

  /**
   * Get a specific agent by ID
   * @param {string} agentId 
   */
  async getAgent(agentId) {
    return this.request(`/agents/${agentId}`);
  }

  /**
   * Get conversation history for an agent
   * @param {string} agentId 
   */
  async getConversation(agentId) {
    return this.request(`/agents/${agentId}/conversation`);
  }

  /**
   * Get all agents formatted for the dashboard
   */
  async getAllAgents() {
    try {
      const response = await this.listAgents(100);
      const agents = response.agents || [];

      return agents.map(agent => this.normalizeAgent(agent));
    } catch (err) {
      throw err;
    }
  }

  /**
   * Normalize a Cursor agent to the common AgentTask format
   * @param {object} agent 
   */
  normalizeAgent(agent) {
    return {
      id: `cursor-${agent.id}`,
      provider: 'cursor',
      name: agent.name || 'Cursor Cloud Agent',
      status: this.mapStatus(agent.status),
      prompt: '', // Prompt is in conversation, not in list response
      repository: agent.source?.repository || null,
      branch: agent.target?.branchName || null,
      prUrl: agent.target?.prUrl || null,
      createdAt: agent.createdAt ? new Date(agent.createdAt) : null,
      updatedAt: null, // Not provided in API
      summary: agent.summary || null,
      rawId: agent.id,
      webUrl: `https://cursor.com/agents/${agent.id}`,
      url: agent.target?.url || null,
      ref: agent.source?.ref || null,
      autoCreatePr: agent.target?.autoCreatePr || false
    };
  }

  /**
   * Map Cursor agent status to common status
   * Cursor statuses: CREATING, RUNNING, FINISHED, STOPPED
   */
  mapStatus(status) {
    if (!status) return 'pending';
    
    const statusMap = {
      'CREATING': 'pending',
      'RUNNING': 'running',
      'FINISHED': 'completed',
      'STOPPED': 'stopped'
    };

    return statusMap[status.toUpperCase()] || 'pending';
  }

  /**
   * Get detailed agent with conversation
   * @param {string} agentId - The raw Cursor agent ID (without 'cursor-' prefix)
   */
  async getAgentDetails(agentId) {
    const [agent, conversationResponse] = await Promise.all([
      this.getAgent(agentId),
      this.getConversation(agentId).catch(() => ({ messages: [] }))
    ]);

    const normalized = this.normalizeAgent(agent);
    const messages = conversationResponse.messages || [];

    // Extract prompt from first user message
    const firstUserMessage = messages.find(m => m.type === 'user_message');
    if (firstUserMessage) {
      normalized.prompt = firstUserMessage.text;
    }

    return {
      ...normalized,
      conversation: messages.map(msg => ({
        id: msg.id,
        type: msg.type,
        text: msg.text,
        isUser: msg.type === 'user_message'
      }))
    };
  }

  /**
   * Get API key info
   */
  async getApiKeyInfo() {
    return this.request('/me');
  }

  /**
   * List available models
   */
  async listModels() {
    return this.request('/models');
  }

  /**
   * List accessible repositories
   * Note: This endpoint has strict rate limits (1/user/minute, 30/user/hour)
   */
  async listRepositories() {
    return this.request('/repositories');
  }

  /**
   * Check if API key is valid by making a test request
   */
  async testConnection() {
    try {
      await this.getApiKeyInfo();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get available local projects from configured paths
   * @param {string[]} paths - Paths to scan
   */
  async getAvailableLocalRepositories(paths = []) {
    const projects = [];
    const scannedPaths = new Set();

    for (const basePath of paths) {
      if (!fs.existsSync(basePath)) continue;

      try {
        const entries = fs.readdirSync(basePath, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

            const dirPath = path.join(basePath, entry.name);
            const gitPath = path.join(dirPath, '.git');

            if (fs.existsSync(gitPath) && !scannedPaths.has(dirPath)) {
              scannedPaths.add(dirPath);
              projects.push({
                id: dirPath, // Use path as ID for local
                name: entry.name,
                url: dirPath, // Use path as URL
                path: dirPath,
                defaultBranch: 'main',
                displayName: entry.name
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
   * Get all available repositories for task creation
   * Note: This endpoint has strict rate limits (1/user/minute, 30/user/hour)
   * @param {string[]} localPaths - Paths to scan for local repositories
   */
  async getAllRepositories(localPaths = []) {
    let cloudRepos = [];
    try {
      if (this.apiKey) {
        const response = await this.listRepositories();
        const repos = response.repositories || response || [];

        cloudRepos = repos.map(repo => ({
          id: repo.url || repo.repository,
          name: repo.name || this.extractRepoName(repo.url || repo.repository),
          url: repo.url || repo.repository,
          defaultBranch: repo.defaultBranch || 'main',
          displayName: this.extractRepoName(repo.url || repo.repository)
        }));
      }
    } catch (err) {
      console.warn('Error fetching Cursor cloud repositories:', err.message);
      throw err;
    }

    const localRepos = await this.getAvailableLocalRepositories(localPaths);

    return [...cloudRepos, ...localRepos];
  }

  /**
   * Extract repository name from URL
   */
  extractRepoName(url) {
    if (!url) return 'Unknown';
    const match = url.match(/github\.com\/([^\/]+\/[^\/]+)/);
    return match ? match[1] : url;
  }

  /**
   * Create a new Cursor Cloud Agent (task)
   * @param {object} options - Agent creation options
   * @param {string} options.prompt - The task description/prompt
   * @param {string} options.repository - The repository URL
   * @param {string} [options.ref] - Git ref/branch (defaults to "main")
   * @param {boolean} [options.autoCreatePr] - Whether to auto-create PR (defaults to true)
   * @param {string} [options.branchName] - Custom branch name for changes
   * @param {string} [options.model] - Model to use (optional, uses default if not specified)
   */
  async createAgent(options) {
    const { prompt, repository, ref = 'main', autoCreatePr = true, branchName, model } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!repository) {
      throw new Error('Repository is required');
    }

    const body = {
      prompt: {
        text: prompt
      },
      source: {
        repository: repository,
        ref: ref
      },
      target: {
        autoCreatePr: autoCreatePr
      }
    };

    // Add optional branch name
    if (branchName) {
      body.target.branchName = branchName;
    }

    // Add optional model
    if (model) {
      body.model = model;
    }

    const response = await this.request('/agents', 'POST', body);
    return this.normalizeAgent(response);
  }

  /**
   * Add a follow-up instruction to an existing agent
   * @param {string} agentId
   * @param {string} message
   */
  async addFollowUp(agentId, message) {
    if (!message) {
      throw new Error('Message is required');
    }

    const body = {
      prompt: {
        text: message
      }
    };

    const response = await this.request(`/agents/${agentId}/followup`, 'POST', body);
    return response; // Returns { id: agentId }
  }
}

module.exports = new CursorService();
