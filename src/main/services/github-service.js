const https = require('https');

let apiKey = null;

const setApiKey = (key) => {
  apiKey = key;
};

const getHeaders = () => {
  return {
    'Authorization': `token ${apiKey}`,
    'User-Agent': 'RTS-Agents-Dashboard',
    'Accept': 'application/vnd.github.v3+json'
  };
};

const makeRequest = (path, method = 'GET', body = null) => {
  return new Promise((resolve, reject) => {
    if (!apiKey) {
      return reject(new Error('GitHub API key not configured'));
    }

    const options = {
      hostname: 'api.github.com',
      path: path,
      method: method,
      headers: getHeaders()
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data); // Handle non-JSON responses if any
          }
        } else {
          try {
            const error = JSON.parse(data);
            reject(new Error(error.message || `GitHub API Error: ${res.statusCode}`));
          } catch (e) {
            reject(new Error(`GitHub API Error: ${res.statusCode}`));
          }
        }
      });
    });

    req.on('error', (e) => reject(e));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
};

const getUserRepos = async () => {
  // Fetch repos sorted by updated time to show relevant ones first
  return makeRequest('/user/repos?sort=updated&per_page=100&type=all');
};

const getPullRequests = async (owner, repo, state = 'open') => {
  return makeRequest(`/repos/${owner}/${repo}/pulls?state=${state}`);
};

const getBranches = async (owner, repo) => {
  return makeRequest(`/repos/${owner}/${repo}/branches`);
};

const getPullRequestDetails = async (owner, repo, pullNumber) => {
    return makeRequest(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
};

const mergePullRequest = async (owner, repo, pullNumber, method = 'merge') => {
  return makeRequest(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, 'PUT', {
    merge_method: method
  });
};

const markPullRequestReadyForReview = async (nodeId) => {
  const query = `
    mutation($id: ID!) {
      markPullRequestReadyForReview(input: {pullRequestId: $id}) {
        pullRequest {
          id
          isDraft
        }
      }
    }
  `;

  const payload = {
    query,
    variables: { id: nodeId }
  };

  return makeRequest('/graphql', 'POST', payload);
};

const testConnection = async () => {
  try {
    await makeRequest('/user');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = {
  setApiKey,
  getUserRepos,
  getPullRequests,
  getBranches,
  getPullRequestDetails,
  mergePullRequest,
  markPullRequestReadyForReview,
  testConnection
};
