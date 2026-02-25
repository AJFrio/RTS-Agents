const HttpService = require('./http-service');

const BASE_URL = 'https://jules.googleapis.com/v1alpha';

class JulesService {
  constructor() {
    this.apiKey = null;
    this.http = new HttpService(BASE_URL, {
      'Content-Type': 'application/json'
    }, 'Jules API');
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

    return this.http.request(endpoint, {
      method,
      body,
      headers: {
        'X-Goog-Api-Key': this.apiKey
      },
      timeout: 30000
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
      webUrl: `https://jules.google.com/session/${session.id}`,
      source: session.sourceContext?.source || null
    };
  }

  /**
   * Map Jules session state to common status
   * Jules states: QUEUED, PLANNING, AWAITING_PLAN_APPROVAL, AWAITING_USER_FEEDBACK,
   *               IN_PROGRESS, PAUSED, FAILED, COMPLETED, STATE_UNSPECIFIED
   */
  mapStatus(session) {
    // Check for outputs (completion) first
    if (session.outputs && session.outputs.length > 0) {
      return 'completed';
    }

    if (!session.state) {
      return 'pending';
    }

    const stateMap = {
      'QUEUED': 'pending',
      'PLANNING': 'running',
      'AWAITING_PLAN_APPROVAL': 'pending',
      'AWAITING_USER_FEEDBACK': 'pending',
      'IN_PROGRESS': 'running',
      'PAUSED': 'stopped',
      'FAILED': 'failed',
      'COMPLETED': 'completed',
      'STATE_UNSPECIFIED': 'pending'
    };

    return stateMap[session.state] || 'pending';
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
      activities: (activitiesResponse.activities || []).map(activity => {
        const artifacts = activity.artifacts || [];
        const commands = artifacts
          .filter(a => a.bashOutput)
          .map(a => a.bashOutput.command);

        const fileChanges = artifacts
          .filter(a => a.changeSet && a.changeSet.gitPatch)
          .map(a => this.extractFilesFromPatch(a.changeSet.gitPatch.unidiffPatch))
          .flat();

        const type = this.getActivityType(activity);
        const { title, description, message, planSteps } = this.getActivityTitleDescriptionMessage(activity, type, commands, fileChanges);

        return {
          id: activity.id,
          type,
          originator: activity.originator,
          title,
          description,
          message,
          planSteps,
          timestamp: activity.createTime,
          commands,
          fileChanges,
          artifacts
        };
      })
    };
  }

  /**
   * Extract file paths from a git patch
   * @param {string} patch
   */
  extractFilesFromPatch(patch) {
    if (!patch) return [];
    const files = [];
    const regex = /^\+\+\+ b\/(.+)$/gm;
    let match;
    while ((match = regex.exec(patch)) !== null) {
      files.push(match[1]);
    }
    return files;
  }

  /**
   * Get title, description, message, and planSteps for an activity for UI display.
   * @param {object} activity - Raw API activity
   * @param {string} type - Result of getActivityType(activity)
   * @param {string[]} commands - Extracted bash commands from artifacts
   * @param {string[]} fileChanges - Extracted file paths from changeSet artifacts
   */
  getActivityTitleDescriptionMessage(activity, type, commands, fileChanges) {
    let title = activity.description || null;
    let description = null;
    let message = null;
    let planSteps = null;

    if (activity.planGenerated?.plan?.steps?.length) {
      const steps = activity.planGenerated.plan.steps;
      planSteps = steps.map(s => ({ title: s.title || '', description: s.description || '' }));
      if (!title) title = steps[0]?.title || 'Plan generated';
      if (!description && steps[0]?.description) description = steps[0].description;
    } else if (activity.planApproved) {
      if (!title) title = 'Plan approved';
    } else if (activity.userMessaged?.userMessage) {
      if (!title) title = 'User message';
      message = activity.userMessaged.userMessage;
    } else if (activity.agentMessaged?.agentMessage) {
      if (!title) title = 'Agent message';
      message = activity.agentMessaged.agentMessage;
    } else if (activity.progressUpdated) {
      title = activity.progressUpdated.title || title || 'Progress';
      description = activity.progressUpdated.description || description;
    } else if (activity.sessionCompleted) {
      if (!title) title = 'Session completed';
    } else if (activity.sessionFailed?.reason) {
      if (!title) title = 'Session failed';
      message = activity.sessionFailed.reason;
    } else {
      if (commands.length > 0 && !title) title = 'Executed Command';
      if (fileChanges.length > 0 && !title) title = 'Code Changes';
    }

    return { title, description, message, planSteps };
  }

  /**
   * Determine activity type (per Jules Activities API: planGenerated, planApproved,
   * userMessaged, agentMessaged, progressUpdated, sessionCompleted, sessionFailed)
   */
  getActivityType(activity) {
    if (activity.planGenerated) return 'plan_generated';
    if (activity.planApproved) return 'plan_approved';
    if (activity.userMessaged) return 'user_messaged';
    if (activity.agentMessaged) return 'agent_messaged';
    if (activity.progressUpdated) return 'progress';
    if (activity.sessionCompleted) return 'completed';
    if (activity.sessionFailed) return 'session_failed';
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

    try {
      do {
        const response = await this.listSources(50, pageToken);
        if (response.sources) {
          allSources.push(...response.sources);
        }
        pageToken = response.nextPageToken || null;
      } while (pageToken);
    } catch (err) {
      console.warn('Error fetching Jules sources:', err.message);
      // Return whatever we managed to fetch (or empty array)
    }

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
   * @param {Array} [options.attachments] - Array of attachments with dataUrl
   */
  async createSession(options) {
    const { prompt, source, branch = 'main', title, autoCreatePr = true, requirePlanApproval = false, attachments } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!source) {
      throw new Error('Source is required');
    }

    let fullPrompt = prompt;

    // Append attachments to prompt if present
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      for (const attachment of attachments) {
        if (attachment?.dataUrl) {
          const name = attachment.name || 'Image';
          fullPrompt += `\n\n![${name}](${attachment.dataUrl})`;
        }
      }
    }

    const body = {
      prompt: fullPrompt,
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

  /**
   * Send a follow-up message to a session
   * @param {string} sessionId
   * @param {string} message
   */
  async sendMessage(sessionId, message) {
    if (!message) {
      throw new Error('Message is required');
    }

    const body = {
      prompt: message
    };

    // The API uses the custom verb :sendMessage
    await this.request(`/sessions/${sessionId}:sendMessage`, 'POST', body);
    return { success: true };
  }
}

module.exports = new JulesService();
