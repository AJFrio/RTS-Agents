const https = require('https');

const BASE_URL = 'https://jules.googleapis.com/v1alpha';

class JulesService {
  constructor() {
    this.apiKey = null;
  }

  /**
   * Set the API key for Jules API
   * @param {string} apiKey 
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Make an HTTP request to the Jules API
   * @param {string} endpoint 
   * @param {string} method 
   * @param {object} body 
   */
  async request(endpoint, method = 'GET', body = null) {
    if (!this.apiKey) {
      throw new Error('Jules API key not configured');
    }

    const url = new URL(`${BASE_URL}${endpoint}`);
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'X-Goog-Api-Key': this.apiKey,
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
            reject(new Error(`Jules API error: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Jules API request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    });
  }

  /**
   * List all connected sources (repositories)
   * @param {number} pageSize 
   * @param {string} pageToken 
   */
  async listSources(pageSize = 20, pageToken = null) {
    let endpoint = `/sources?pageSize=${pageSize}`;
    if (pageToken) {
      endpoint += `&pageToken=${pageToken}`;
    }
    return this.request(endpoint);
  }

  /**
   * List all sessions
   * @param {number} pageSize 
   * @param {string} pageToken 
   */
  async listSessions(pageSize = 20, pageToken = null) {
    let endpoint = `/sessions?pageSize=${pageSize}`;
    if (pageToken) {
      endpoint += `&pageToken=${pageToken}`;
    }
    return this.request(endpoint);
  }

  /**
   * Get a specific session by ID
   * @param {string} sessionId 
   */
  async getSession(sessionId) {
    return this.request(`/sessions/${sessionId}`);
  }

  /**
   * List activities for a session
   * @param {string} sessionId 
   * @param {number} pageSize 
   * @param {string} pageToken 
   */
  async listActivities(sessionId, pageSize = 30, pageToken = null) {
    let endpoint = `/sessions/${sessionId}/activities?pageSize=${pageSize}`;
    if (pageToken) {
      endpoint += `&pageToken=${pageToken}`;
    }
    return this.request(endpoint);
  }

  /**
   * Get all agents (sessions) formatted for the dashboard
   */
  async getAllAgents() {
    try {
      const response = await this.listSessions(100);
      const sessions = response.sessions || [];

      return sessions.map(session => this.normalizeSession(session));
    } catch (err) {
      console.error('Error fetching Jules sessions:', err);
      throw err;
    }
  }

  /**
   * Normalize a Jules session to the common AgentTask format
   * @param {object} session 
   */
  normalizeSession(session) {
    return {
      id: `jules-${session.id}`,
      provider: 'jules',
      name: session.title || 'Jules Session',
      status: this.mapStatus(session),
      prompt: session.prompt || '',
      repository: this.extractRepository(session),
      branch: session.sourceContext?.githubRepoContext?.startingBranch || null,
      prUrl: this.extractPrUrl(session),
      createdAt: session.createTime ? new Date(session.createTime) : null,
      updatedAt: session.updateTime ? new Date(session.updateTime) : null,
      summary: this.extractSummary(session),
      rawId: session.id,
      source: session.sourceContext?.source || null
    };
  }

  /**
   * Map Jules session state to common status
   */
  mapStatus(session) {
    // Check for outputs (completion)
    if (session.outputs && session.outputs.length > 0) {
      return 'completed';
    }

    // Check for explicit state field if it exists
    if (session.state) {
      const state = session.state.toLowerCase();
      if (state.includes('running') || state.includes('active')) return 'running';
      if (state.includes('complete') || state.includes('finished')) return 'completed';
      if (state.includes('failed') || state.includes('error')) return 'failed';
      if (state.includes('stopped') || state.includes('paused')) return 'stopped';
    }

    // Default based on whether there's activity
    return 'pending';
  }

  /**
   * Extract repository URL from session
   */
  extractRepository(session) {
    const source = session.sourceContext?.source;
    if (source && source.startsWith('sources/github/')) {
      const parts = source.replace('sources/github/', '').split('/');
      if (parts.length >= 2) {
        return `https://github.com/${parts[0]}/${parts[1]}`;
      }
    }
    return null;
  }

  /**
   * Extract PR URL from session outputs
   */
  extractPrUrl(session) {
    if (session.outputs) {
      for (const output of session.outputs) {
        if (output.pullRequest?.url) {
          return output.pullRequest.url;
        }
      }
    }
    return null;
  }

  /**
   * Extract summary from session
   */
  extractSummary(session) {
    if (session.outputs) {
      for (const output of session.outputs) {
        if (output.pullRequest?.description) {
          return output.pullRequest.description;
        }
      }
    }
    return null;
  }

  /**
   * Get detailed session with activities
   * @param {string} sessionId - The raw Jules session ID (without 'jules-' prefix)
   */
  async getAgentDetails(sessionId) {
    const [session, activitiesResponse] = await Promise.all([
      this.getSession(sessionId),
      this.listActivities(sessionId, 100)
    ]);

    return {
      ...this.normalizeSession(session),
      activities: (activitiesResponse.activities || []).map(activity => ({
        id: activity.id,
        type: this.getActivityType(activity),
        originator: activity.originator,
        title: activity.progressUpdated?.title || activity.planGenerated?.plan?.steps?.[0]?.title || null,
        description: activity.progressUpdated?.description || null,
        timestamp: activity.createTime,
        artifacts: activity.artifacts || []
      }))
    };
  }

  /**
   * Determine activity type
   */
  getActivityType(activity) {
    if (activity.planGenerated) return 'plan_generated';
    if (activity.planApproved) return 'plan_approved';
    if (activity.progressUpdated) return 'progress';
    if (activity.sessionCompleted) return 'completed';
    return 'unknown';
  }

  /**
   * Check if API key is valid by making a test request
   */
  async testConnection() {
    try {
      await this.listSources(1);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get all available sources (repositories) for task creation
   * Returns paginated results, fetching all pages
   */
  async getAllSources() {
    const allSources = [];
    let pageToken = null;

    do {
      const response = await this.listSources(50, pageToken);
      if (response.sources) {
        allSources.push(...response.sources);
      }
      pageToken = response.nextPageToken || null;
    } while (pageToken);

    return allSources.map(source => ({
      id: source.name,
      name: source.id,
      owner: source.githubRepo?.owner || null,
      repo: source.githubRepo?.repo || null,
      displayName: source.githubRepo 
        ? `${source.githubRepo.owner}/${source.githubRepo.repo}`
        : source.id
    }));
  }

  /**
   * Create a new Jules session (task)
   * @param {object} options - Session creation options
   * @param {string} options.prompt - The task description/prompt
   * @param {string} options.source - The source name (e.g., "sources/github/owner/repo")
   * @param {string} [options.branch] - Starting branch (defaults to "main")
   * @param {string} [options.title] - Session title
   * @param {boolean} [options.autoCreatePr] - Whether to auto-create PR (defaults to true)
   * @param {boolean} [options.requirePlanApproval] - Whether to require plan approval (defaults to false)
   */
  async createSession(options) {
    const { prompt, source, branch = 'main', title, autoCreatePr = true, requirePlanApproval = false } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!source) {
      throw new Error('Source is required');
    }

    const body = {
      prompt: prompt,
      sourceContext: {
        source: source,
        githubRepoContext: {
          startingBranch: branch
        }
      }
    };

    // Set automation mode based on autoCreatePr
    if (autoCreatePr) {
      body.automationMode = 'AUTO_CREATE_PR';
    }

    // Add optional fields
    if (title) {
      body.title = title;
    }
    if (requirePlanApproval) {
      body.requirePlanApproval = true;
    }

    const response = await this.request('/sessions', 'POST', body);
    return this.normalizeSession(response);
  }
}

module.exports = new JulesService();
