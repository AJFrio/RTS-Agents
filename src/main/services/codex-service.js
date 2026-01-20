const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://api.openai.com/v1';

// Store for tracking created thread IDs (since OpenAI doesn't have a list threads endpoint)
let trackedThreads = [];

class CodexService {
  constructor() {
    this.apiKey = null;
  }

  /**
   * Set the API key for OpenAI Codex API
   * @param {string} apiKey 
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Make an HTTP request to the OpenAI API
   * @param {string} endpoint 
   * @param {string} method 
   * @param {object} body 
   */
  async request(endpoint, method = 'GET', body = null) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const url = new URL(`${BASE_URL}${endpoint}`);
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
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
            reject(new Error(`OpenAI API error: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('OpenAI API request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    });
  }

  /**
   * Create a new thread
   * @param {object} options - Thread creation options
   */
  async createThread(options = {}) {
    const body = {};
    
    // Add initial messages if provided
    if (options.messages && options.messages.length > 0) {
      body.messages = options.messages;
    }

    // Add metadata if provided
    if (options.metadata) {
      body.metadata = options.metadata;
    }

    const response = await this.request('/threads', 'POST', body);
    
    // Track this thread ID for listing later
    this.trackThread(response.id, options);
    
    return response;
  }

  /**
   * Get a specific thread by ID
   * @param {string} threadId 
   */
  async getThread(threadId) {
    return this.request(`/threads/${threadId}`);
  }

  /**
   * List messages in a thread
   * @param {string} threadId 
   * @param {number} limit 
   */
  async listMessages(threadId, limit = 100) {
    return this.request(`/threads/${threadId}/messages?limit=${limit}`);
  }

  /**
   * Create a message in a thread
   * @param {string} threadId 
   * @param {string} content 
   * @param {string} role 
   */
  async createMessage(threadId, content, role = 'user') {
    return this.request(`/threads/${threadId}/messages`, 'POST', {
      role: role,
      content: content
    });
  }

  /**
   * Create and run a thread with an assistant
   * @param {string} threadId 
   * @param {object} options 
   */
  async createRun(threadId, options = {}) {
    const body = {
      assistant_id: options.assistantId || 'asst_codex', // Default Codex assistant
      ...options
    };

    return this.request(`/threads/${threadId}/runs`, 'POST', body);
  }

  /**
   * List runs for a thread
   * @param {string} threadId 
   * @param {number} limit 
   */
  async listRuns(threadId, limit = 20) {
    return this.request(`/threads/${threadId}/runs?limit=${limit}`);
  }

  /**
   * Get a specific run
   * @param {string} threadId 
   * @param {string} runId 
   */
  async getRun(threadId, runId) {
    return this.request(`/threads/${threadId}/runs/${runId}`);
  }

  /**
   * Track a thread ID for later listing
   * @param {string} threadId 
   * @param {object} metadata 
   */
  trackThread(threadId, metadata = {}) {
    const existingIndex = trackedThreads.findIndex(t => t.id === threadId);
    const threadInfo = {
      id: threadId,
      createdAt: new Date().toISOString(),
      prompt: metadata.prompt || metadata.messages?.[0]?.content || '',
      repository: metadata.repository || null,
      ...metadata
    };

    if (existingIndex >= 0) {
      trackedThreads[existingIndex] = { ...trackedThreads[existingIndex], ...threadInfo };
    } else {
      trackedThreads.unshift(threadInfo);
    }

    // Keep only last 100 threads in memory
    if (trackedThreads.length > 100) {
      trackedThreads = trackedThreads.slice(0, 100);
    }
  }

  /**
   * Set tracked threads (used to restore from config)
   * @param {Array} threads 
   */
  setTrackedThreads(threads) {
    trackedThreads = threads || [];
  }

  /**
   * Get tracked threads
   * @returns {Array}
   */
  getTrackedThreads() {
    return trackedThreads;
  }

  /**
   * Get all agents (threads) formatted for the dashboard
   * Fetches all thread details in parallel for better performance
   */
  async getAllAgents() {
    try {
      // Fetch details for all tracked threads in parallel
      const results = await Promise.allSettled(
        trackedThreads.map(async (tracked) => {
          // Fetch thread and runs in parallel for each thread
          const [thread, runsResponse] = await Promise.all([
            this.getThread(tracked.id),
            this.listRuns(tracked.id, 1)
          ]);
          const latestRun = runsResponse.data?.[0];
          return this.normalizeThread(thread, tracked, latestRun);
        })
      );

      // Filter out failed fetches and extract successful results
      const agents = results
        .filter((result, index) => {
          if (result.status === 'rejected') {
            // Thread might have been deleted, skip it
            console.warn(`Could not fetch thread ${trackedThreads[index].id}:`, result.reason?.message);
            return false;
          }
          return true;
        })
        .map(result => result.value);

      return agents;
    } catch (err) {
      console.error('Error fetching Codex threads:', err);
      throw err;
    }
  }

  /**
   * Normalize a Codex thread to the common AgentTask format
   * @param {object} thread 
   * @param {object} tracked 
   * @param {object} latestRun 
   */
  normalizeThread(thread, tracked = {}, latestRun = null) {
    return {
      id: `codex-${thread.id}`,
      provider: 'codex',
      name: this.extractThreadName(tracked, thread),
      status: this.mapStatus(latestRun),
      prompt: tracked.prompt || '',
      repository: tracked.repository || null,
      branch: tracked.branch || null,
      prUrl: tracked.prUrl || null,
      createdAt: thread.created_at ? new Date(thread.created_at * 1000) : null,
      updatedAt: latestRun?.created_at ? new Date(latestRun.created_at * 1000) : null,
      summary: latestRun?.status || null,
      rawId: thread.id,
      webUrl: `https://platform.openai.com/playground/assistants?thread=${thread.id}`,
      runId: latestRun?.id || null
    };
  }

  /**
   * Extract a readable name from thread/tracked data
   */
  extractThreadName(tracked, thread) {
    if (tracked.title) return tracked.title;
    if (tracked.prompt) {
      // Take first 50 chars of prompt as name
      return tracked.prompt.substring(0, 50) + (tracked.prompt.length > 50 ? '...' : '');
    }
    return `Codex Thread ${thread.id.substring(0, 8)}`;
  }

  /**
   * Map OpenAI run status to common status
   */
  mapStatus(run) {
    if (!run) return 'pending';

    const status = run.status?.toLowerCase();
    
    switch (status) {
      case 'queued':
      case 'in_progress':
        return 'running';
      case 'completed':
        return 'completed';
      case 'failed':
      case 'cancelled':
      case 'expired':
        return 'failed';
      case 'requires_action':
        return 'pending';
      default:
        return 'pending';
    }
  }

  /**
   * Get detailed thread with messages
   * @param {string} threadId - The raw thread ID (without 'codex-' prefix)
   */
  async getAgentDetails(threadId) {
    const [thread, messagesResponse, runsResponse] = await Promise.all([
      this.getThread(threadId),
      this.listMessages(threadId, 100),
      this.listRuns(threadId, 10)
    ]);

    const tracked = trackedThreads.find(t => t.id === threadId) || {};
    const latestRun = runsResponse.data?.[0];

    return {
      ...this.normalizeThread(thread, tracked, latestRun),
      messages: (messagesResponse.data || []).map(msg => ({
        id: msg.id,
        role: msg.role,
        content: this.extractMessageContent(msg),
        createdAt: msg.created_at ? new Date(msg.created_at * 1000) : null
      })).reverse(), // Reverse to get chronological order
      runs: (runsResponse.data || []).map(run => ({
        id: run.id,
        status: run.status,
        model: run.model,
        createdAt: run.created_at ? new Date(run.created_at * 1000) : null,
        completedAt: run.completed_at ? new Date(run.completed_at * 1000) : null,
        failedAt: run.failed_at ? new Date(run.failed_at * 1000) : null
      }))
    };
  }

  /**
   * Extract text content from a message
   */
  extractMessageContent(message) {
    if (!message.content || message.content.length === 0) return '';
    
    // Messages can have multiple content blocks
    return message.content
      .filter(c => c.type === 'text')
      .map(c => c.text?.value || '')
      .join('\n');
  }

  /**
   * Check if API key is valid by making a test request
   */
  async testConnection() {
    try {
      // Try to list models as a simple API test
      await this.request('/models');
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
   * Get available repositories (for Codex, we return tracked threads as "projects")
   * Since Codex works with local projects or GitHub, we provide a way to list recent projects
   * @param {string[]} localPaths - Paths to scan for local repositories
   */
  async getAvailableProjects(localPaths = []) {
    // Return unique repositories from tracked threads
    const repos = new Map();
    
    for (const thread of trackedThreads) {
      if (thread.repository) {
        repos.set(thread.repository, {
          id: thread.repository,
          name: thread.repository,
          displayName: thread.repository
        });
      }
    }

    // Add local repositories
    const localRepos = await this.getAvailableLocalRepositories(localPaths);
    for (const repo of localRepos) {
      // Use path as key to avoid duplicates
      if (!repos.has(repo.path)) {
        repos.set(repo.path, repo);
      }
    }

    return Array.from(repos.values());
  }

  /**
   * Create a new Codex task (thread with initial message and run)
   * @param {object} options - Task creation options
   * @param {string} options.prompt - The task description/prompt
   * @param {string} [options.repository] - Repository context
   * @param {string} [options.branch] - Branch context
   * @param {string} [options.title] - Task title
   */
  async createTask(options) {
    const { prompt, repository, branch, title } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    // Create thread with initial message
    const thread = await this.createThread({
      messages: [{
        role: 'user',
        content: prompt
      }],
      metadata: {
        title: title || prompt.substring(0, 50),
        repository: repository || null,
        branch: branch || null
      },
      prompt: prompt,
      repository: repository,
      branch: branch,
      title: title
    });

    // Track this thread
    this.trackThread(thread.id, {
      prompt: prompt,
      repository: repository,
      branch: branch,
      title: title
    });

    return this.normalizeThread(thread, {
      prompt: prompt,
      repository: repository,
      branch: branch,
      title: title
    });
  }
}

module.exports = new CodexService();
