const https = require('https');
const configStore = require('./config-store');
const providerHealth = require('./provider-health');

const GRAPHQL_HOSTNAME = 'api.linear.app';
const GRAPHQL_PATH = '/graphql';
const REQUEST_TIMEOUT_MS = 30000;

class LinearService {
  get apiKey() {
    return configStore.getApiKey('linear');
  }

  /**
   * Normalize a Linear Issue node into the shared issue shape used by the renderer.
   */
  normalizeIssue(node) {
    return {
      id: node.id,
      key: node.identifier,
      title: node.title,
      description: node.description || '',
      state: node.state ? node.state.name : null,
      priority: node.priority != null ? node.priority : null,
      url: node.url,
      project: node.project ? node.project.name : null,
      assignee: node.assignee ? node.assignee.name : null,
      updatedAt: node.updatedAt,
    };
  }

  /**
   * Private GraphQL transport. All public methods route through here.
   * Linear authenticates with the raw API key in the Authorization header (no scheme prefix).
   */
  async graphql(query, variables = {}) {
    const key = this.apiKey;
    if (!key) {
      throw new Error('Linear API key not configured');
    }

    const body = JSON.stringify({ query, variables });

    const options = {
      hostname: GRAPHQL_HOSTNAME,
      path: GRAPHQL_PATH,
      method: 'POST',
      headers: {
        Authorization: key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch {
              reject(new Error('Linear API returned invalid JSON response'));
              return;
            }

            if (parsed.errors && parsed.errors.length > 0) {
              reject(
                new Error(`Linear GraphQL error: ${parsed.errors.map((e) => e.message).join('; ')}`)
              );
              return;
            }

            resolve(parsed);
          } else {
            let errorMessage = `Linear API Error ${res.statusCode}`;
            let errorDetails = null;

            try {
              const errorData = JSON.parse(data);
              if (errorData.errors && errorData.errors.length > 0) {
                errorDetails = errorData.errors.map((e) => e.message).join('; ');
              } else if (errorData.message) {
                errorDetails = errorData.message;
              }
            } catch {
              errorDetails = data.length > 200 ? data.substring(0, 200) + '...' : data;
            }

            if (res.statusCode === 401) {
              errorMessage = 'Authentication failed (401). Please check:';
              errorMessage += '\n1. Your Linear API key is valid and not revoked';
              errorMessage += '\n2. The key is stored without extra whitespace';
              errorMessage += '\n3. You can create a key at: https://linear.app/settings/api';
              if (errorDetails) {
                errorMessage += `\n\nLinear error: ${errorDetails}`;
              }
            } else if (res.statusCode === 403) {
              errorMessage =
                'Access forbidden (403). Your Linear API key may not have the required permissions.';
              if (errorDetails) {
                errorMessage += `\n\nLinear error: ${errorDetails}`;
              }
            } else if (res.statusCode === 429) {
              errorMessage =
                'Rate limited (429). Linear API rate limit exceeded. Please try again later.';
              if (errorDetails) {
                errorMessage += `\n\nLinear error: ${errorDetails}`;
              }
            } else {
              errorMessage += errorDetails ? `: ${errorDetails}` : '';
            }

            reject(new Error(errorMessage));
          }
        });
      });

      req.on('error', (err) => {
        let errorMessage = `Linear request failed: ${err.message}`;

        if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
          errorMessage += `\n\nUnable to resolve hostname "${GRAPHQL_HOSTNAME}". Please check your network connection.`;
        } else if (err.code === 'ECONNREFUSED') {
          errorMessage += '\n\nConnection refused. Please verify you can reach api.linear.app.';
        } else if (
          err.code === 'CERT_HAS_EXPIRED' ||
          err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
        ) {
          errorMessage +=
            '\n\nSSL certificate error. Please check your system clock and certificates.';
        }

        reject(new Error(errorMessage));
      });

      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        req.destroy();
        reject(
          new Error(
            'Linear request timeout after 30 seconds. Please check your network connection.'
          )
        );
      });

      req.write(body);
      req.end();
    });
  }

  async testConnection() {
    try {
      if (!this.apiKey) {
        return providerHealth.notConfigured('linear', {
          configured: false,
          docsUrl: 'https://linear.app/settings/api',
          endpointLabel: 'POST /graphql (viewer)',
          error: 'Linear API key not configured',
          message: 'Linear API key not configured. Please add your API key in Settings.',
        });
      }

      const res = await this.graphql('query { viewer { id name email } }');
      const user = res.data ? res.data.viewer : null;

      return {
        ...providerHealth.ok('linear', {
          configured: true,
          docsUrl: 'https://linear.app/settings/api',
          endpointLabel: 'POST /graphql (viewer)',
          message: `Successfully connected to Linear as ${user && user.email ? user.email : 'unknown'}`,
        }),
        user,
      };
    } catch (err) {
      return providerHealth.fail('linear', err.message, {
        configured: !!this.apiKey,
        docsUrl: 'https://linear.app/settings/api',
        endpointLabel: 'POST /graphql (viewer)',
      });
    }
  }

  async listTeams() {
    const res = await this.graphql('query { teams { nodes { id name key } } }');
    const nodes = res.data && res.data.teams ? res.data.teams.nodes || [] : [];
    return nodes.map((t) => ({ id: t.id, name: t.name, key: t.key }));
  }

  async listIssues(teamId) {
    const query =
      'query($teamId: String!, $first: Int, $after: String) { ' +
      'issues(first: $first, after: $after, filter: { team: { id: { eq: $teamId } } }) { ' +
      'nodes { id identifier title description state { name } priority url project { name } assignee { name } updatedAt } } }';

    const res = await this.graphql(query, { teamId, first: 50 });
    const nodes = res.data && res.data.issues ? res.data.issues.nodes || [] : [];
    return nodes.map((node) => this.normalizeIssue(node));
  }

  async getIssue(id) {
    const query =
      'query($id: String!) { issue(id: $id) { ' +
      'id identifier title description state { name } priority url project { name } assignee { name } updatedAt } }';

    const res = await this.graphql(query, { id });
    const node = res.data ? res.data.issue : null;
    return node ? this.normalizeIssue(node) : null;
  }
}

module.exports = new LinearService();
