const https = require('https');
const http = require('http');
const { URL } = require('url');
const configStore = require('./config-store');

class JiraService {
  /**
   * Normalize and validate the base URL
   * Removes trailing slashes and any API paths that might have been included
   */
  normalizeBaseUrl(url) {
    if (!url) return null;
    
    // Trim whitespace
    let normalized = url.trim();
    
    // Remove trailing slashes
    normalized = normalized.replace(/\/+$/, '');
    
    // Remove common API paths if accidentally included
    // e.g., https://domain.atlassian.net/rest/api/3 -> https://domain.atlassian.net
    normalized = normalized.replace(/\/rest\/api\/[23](\/.*)?$/, '');
    normalized = normalized.replace(/\/rest\/agile\/[0-9.]+(\/.*)?$/, '');
    
    // Remove Jira page paths (e.g., /jira/software/projects/... or /jira/...)
    // This handles cases where users paste full page URLs instead of just the base URL
    normalized = normalized.replace(/\/jira(\/.*)?$/, '');
    
    return normalized;
  }

  /**
   * Validate that the base URL is properly formatted
   */
  validateBaseUrl(url) {
    if (!url) {
      throw new Error('Jira Base URL is required');
    }

    try {
      const urlObj = new URL(url);
      
      // Ensure it's HTTPS (Jira Cloud requires HTTPS)
      if (urlObj.protocol !== 'https:') {
        throw new Error('Jira Base URL must use HTTPS (e.g., https://your-domain.atlassian.net)');
      }

      return true;
    } catch (err) {
      if (err.message.includes('Invalid URL')) {
        throw new Error(`Invalid Jira Base URL format. Expected format: https://your-domain.atlassian.net (got: ${url})`);
      }
      throw err;
    }
  }

  get baseUrl() {
    const url = configStore.getJiraBaseUrl();
    if (!url) return null;
    
    const normalized = this.normalizeBaseUrl(url);
    try {
      this.validateBaseUrl(normalized);
      return normalized;
    } catch (err) {
      // Return normalized URL anyway, but validation error will be caught in request()
      return normalized;
    }
  }

  get apiKey() {
    return configStore.getApiKey('jira');
  }

  get authHeader() {
    const key = this.apiKey;
    if (!key) return null;
    
    if (key.includes(':')) {
      // Split by first colon and trim both parts to handle potential copy-paste whitespace
      const splitIndex = key.indexOf(':');
      const email = key.substring(0, splitIndex).trim();
      const token = key.substring(splitIndex + 1).trim();
      
      // Validate that both email and token are present
      if (!email || !token) {
        throw new Error('Jira API key format is invalid. Expected format: email:token (both email and token are required)');
      }
      
      // Basic validation: email should contain @
      if (!email.includes('@')) {
        throw new Error('Jira API key email appears invalid. Expected format: your-email@example.com:token');
      }
      
      const cleanKey = `${email}:${token}`;
      return `Basic ${Buffer.from(cleanKey).toString('base64')}`;
    }
    
    // If no colon, assume it's a Bearer token (for OAuth or other auth methods)
    return `Bearer ${key.trim()}`;
  }

  async request(endpoint, method = 'GET', body = null) {
    // Validate base URL
    const baseUrl = this.baseUrl;
    if (!baseUrl) {
      throw new Error('Jira Base URL not configured. Please enter your Jira site URL (e.g., https://your-domain.atlassian.net)');
    }
    
    try {
      this.validateBaseUrl(baseUrl);
    } catch (err) {
      throw new Error(`Invalid Jira Base URL: ${err.message}`);
    }

    // Validate API key
    if (!this.apiKey) {
      throw new Error('Jira API Key not configured. Please enter your API token in the format: email:token');
    }

    // Validate auth header can be created
    let authHeader;
    try {
      authHeader = this.authHeader;
      if (!authHeader) {
        throw new Error('Failed to create authentication header');
      }
    } catch (err) {
      throw new Error(`Authentication error: ${err.message}`);
    }

    const fullUrl = `${baseUrl}${endpoint}`;
    let urlObj;
    try {
      urlObj = new URL(fullUrl);
    } catch (err) {
      throw new Error(`Invalid URL constructed: ${fullUrl}. Base URL: ${baseUrl}, Endpoint: ${endpoint}`);
    }
    
    const requestModule = urlObj.protocol === 'http:' ? http : https;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    return new Promise((resolve, reject) => {
      const req = requestModule.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve(data);
            }
          } else {
            // Provide detailed error information
            let errorMessage = `Jira API Error ${res.statusCode}`;
            let errorDetails = null;
            
            try {
              const errorData = JSON.parse(data);
              if (errorData.errorMessages && errorData.errorMessages.length > 0) {
                errorDetails = errorData.errorMessages.join('; ');
              } else if (errorData.errors) {
                errorDetails = Object.entries(errorData.errors)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join('; ');
              } else if (errorData.message) {
                errorDetails = errorData.message;
              }
            } catch (e) {
              // If we can't parse the error, use the raw data (truncated)
              errorDetails = data.length > 200 ? data.substring(0, 200) + '...' : data;
            }

            // Provide specific guidance based on status code
            if (res.statusCode === 401) {
              // Check if this might be an OAuth token issue
              const apiKey = this.apiKey;
              let tokenHint = '';
              if (apiKey && apiKey.includes(':')) {
                const token = apiKey.split(':')[1]?.trim();
                if (token && (token.length > 100 || token.startsWith('ATATT'))) {
                  tokenHint = '\n\n⚠️ IMPORTANT: Your token appears to be an OAuth token (long token starting with ATATT).';
                  tokenHint += '\nOAuth tokens should NOT be used with email:token format.';
                  tokenHint += '\nTry entering just the token (without email:) - it will use Bearer authentication.';
                  tokenHint += '\nOr generate a new API token at: https://id.atlassian.com/manage-profile/security/api-tokens';
                }
              }
              
              errorMessage = 'Authentication failed (401). Please check:';
              errorMessage += '\n1. Your email address matches your Atlassian account exactly';
              errorMessage += '\n2. Your API token is valid and not expired/revoked';
              errorMessage += '\n3. The token format is correct: email:token';
              errorMessage += '\n4. You generated an API token (not an OAuth token)';
              errorMessage += tokenHint;
              if (errorDetails) {
                errorMessage += `\n\nJira error: ${errorDetails}`;
              }
            } else if (res.statusCode === 403) {
              errorMessage = 'Access forbidden (403). Your API token may not have the required permissions.';
              if (errorDetails) {
                errorMessage += `\n\nJira error: ${errorDetails}`;
              }
            } else if (res.statusCode === 404) {
              errorMessage = `Endpoint not found (404). The requested resource may not exist or the base URL may be incorrect.`;
              errorMessage += `\nRequested: ${fullUrl}`;
              if (errorDetails) {
                errorMessage += `\n\nJira error: ${errorDetails}`;
              }
            } else {
              errorMessage += errorDetails ? `: ${errorDetails}` : '';
            }

            reject(new Error(errorMessage));
          }
        });
      });
      
      req.on('error', (err) => {
        let errorMessage = `Jira request failed: ${err.message}`;
        
        // Provide helpful context for common network errors
        if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
          errorMessage += `\n\nUnable to resolve hostname "${urlObj.hostname}". Please verify your Jira Base URL is correct.`;
        } else if (err.code === 'ECONNREFUSED') {
          errorMessage += `\n\nConnection refused. Please verify your Jira Base URL is correct and the service is accessible.`;
        } else if (err.code === 'CERT_HAS_EXPIRED' || err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
          errorMessage += `\n\nSSL certificate error. Please verify your Jira Base URL uses a valid HTTPS certificate.`;
        }
        
        reject(new Error(errorMessage));
      });
      
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error(`Jira request timeout after 30 seconds. Please check your network connection and Jira Base URL.`));
      });
      
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async listBoards() {
    const res = await this.request('/rest/agile/1.0/board?maxResults=50');
    return (res.values || []).map(b => ({ id: b.id, name: b.name, type: b.type }));
  }

  async listSprints(boardId) {
    const res = await this.request(
      `/rest/agile/1.0/board/${boardId}/sprint?state=active,future,closed&maxResults=50`
    );
    return res.values || [];
  }

  async getBacklogIssues(boardId) {
    const res = await this.request(
      `/rest/agile/1.0/board/${boardId}/backlog?maxResults=100&fields=summary,assignee,status,priority,issuetype,created,updated,labels,description,reporter`
    );
    return res.issues || [];
  }

  async getSprintIssues(sprintId) {
    const res = await this.request(
      `/rest/agile/1.0/sprint/${sprintId}/issue?maxResults=100&fields=summary,assignee,status,priority,issuetype,created,updated,labels,description,reporter`
    );
    return res.issues || [];
  }

  async getIssue(issueKey) {
    return await this.request(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,assignee,status,priority,issuetype,created,updated,labels,description,reporter&expand=renderedFields`
    );
  }

  async getIssueComments(issueKey) {
    return await this.request(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`
    );
  }

  async testConnection() {
    try {
      // Validate configuration before attempting connection
      const baseUrl = this.baseUrl;
      if (!baseUrl) {
        return { 
          success: false, 
          error: 'Jira Base URL is not configured. Please enter your Jira site URL (e.g., https://your-domain.atlassian.net) in Settings.' 
        };
      }

      if (!this.apiKey) {
        return { 
          success: false, 
          error: 'Jira API Key is not configured. Please enter your API token in the format: email:token in Settings.' 
        };
      }

      // Validate URL format
      try {
        this.validateBaseUrl(baseUrl);
      } catch (urlErr) {
        return { 
          success: false, 
          error: `Invalid Base URL: ${urlErr.message}\n\nExpected format: https://your-domain.atlassian.net\n\nCurrent value: ${baseUrl}` 
        };
      }

      // Validate token format
      try {
        const authHeader = this.authHeader;
        if (!authHeader) {
          return { 
            success: false, 
            error: 'Failed to create authentication header. Please check your API token format (expected: email:token).' 
          };
        }
      } catch (authErr) {
        return { 
          success: false, 
          error: `Authentication configuration error: ${authErr.message}\n\nPlease verify your API token is in the format: your-email@example.com:token` 
        };
      }

      // Try fetching current user to verify credentials
      // Using /rest/api/3/myself for Jira Cloud
      // For Jira Server/Data Center, this endpoint should still work
      const userInfo = await this.request('/rest/api/3/myself');
      
      // If we get here, connection was successful
      const userEmail = userInfo.emailAddress || userInfo.email || 'unknown';
      return { 
        success: true,
        message: `Successfully connected to Jira as ${userEmail}`
      };
    } catch (err) {
      // The request() method already provides detailed error messages
      // We'll enhance them slightly for the test connection context
      let errorMessage = err.message;
      
      // Add troubleshooting tips for common issues
      if (errorMessage.includes('401') || errorMessage.includes('Authentication failed')) {
        errorMessage += '\n\nTroubleshooting:';
        errorMessage += '\n1. Verify your email address matches your Jira account';
        errorMessage += '\n2. Check that your API token is still valid (tokens can expire)';
        errorMessage += '\n3. Ensure the token format is exactly: email:token (no extra spaces)';
        errorMessage += '\n4. You can create a new API token at: https://id.atlassian.com/manage-profile/security/api-tokens';
      } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        errorMessage += '\n\nTroubleshooting:';
        errorMessage += '\n1. Verify your Base URL is correct (should be: https://your-domain.atlassian.net)';
        errorMessage += '\n2. Do not include /rest/api/3 or any paths in the Base URL';
        errorMessage += '\n3. Ensure you are using a Jira Cloud instance (not Jira Server/Data Center)';
      } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('resolve hostname')) {
        errorMessage += '\n\nTroubleshooting:';
        errorMessage += '\n1. Check your internet connection';
        errorMessage += '\n2. Verify the Base URL hostname is correct';
        errorMessage += '\n3. Ensure your Jira instance is accessible';
      }
      
      return { success: false, error: errorMessage };
    }
  }
}

module.exports = new JiraService();
