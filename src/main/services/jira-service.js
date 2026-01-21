const https = require('https');
const { URL } = require('url');
const configStore = require('./config-store');

class JiraService {
  get baseUrl() {
    const url = configStore.getJiraBaseUrl();
    return url ? url.replace(/\/+$/, '') : null;
  }

  get apiKey() {
    return configStore.getApiKey('jira');
  }

  get authHeader() {
    const key = this.apiKey;
    if (!key) return null;
    if (key.includes(':')) {
      return `Basic ${Buffer.from(key).toString('base64')}`;
    }
    return `Bearer ${key}`;
  }

  async request(endpoint, method = 'GET', body = null) {
    if (!this.baseUrl) throw new Error('Jira Base URL not configured');
    if (!this.apiKey) throw new Error('Jira API Key not configured');

    const fullUrl = `${this.baseUrl}${endpoint}`;
    const urlObj = new URL(fullUrl);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
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
            reject(new Error(`Jira API Error ${res.statusCode}: ${data}`));
          }
        });
      });
      req.on('error', (err) => reject(new Error(`Jira request failed: ${err.message}`)));
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

  async testConnection() {
    try {
      // Try fetching current user to verify credentials
      // Note: /rest/api/3/myself works on Cloud, for Server/DC it might be /rest/api/2/myself but usually 2 is available on cloud too.
      // Let's try v2 as it's more compatible generally, or stick to what mobile app used (v3).
      // Mobile app used /rest/api/3/myself. I'll stick to that.
      await this.request('/rest/api/3/myself');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = new JiraService();
