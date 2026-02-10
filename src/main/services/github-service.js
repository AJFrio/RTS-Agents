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
      headers: {
        ...getHeaders(),
        ...(body ? { 'Content-Type': 'application/json' } : {})
      }
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

const getCurrentUser = async () => {
  return makeRequest('/user');
};

const getUserOrgs = async () => {
  return makeRequest('/user/orgs?per_page=100');
};

const createRepository = async ({ ownerType = 'user', owner, name, private: isPrivate = false } = {}) => {
  if (!name) throw new Error('Repository name is required');

  const payload = {
    name,
    private: !!isPrivate
  };

  if (ownerType === 'org') {
    if (!owner) throw new Error('Organization is required to create an org repo');
    return makeRequest(`/orgs/${owner}/repos`, 'POST', payload);
  }

  // Default: personal repo for the authenticated user
  return makeRequest('/user/repos', 'POST', payload);
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

const getAllPullRequests = async () => {
  const repos = await getUserRepos();
  if (!Array.isArray(repos)) {
    return [];
  }

  // Fetch PRs for all repos in parallel
  const prPromises = repos.map(repo =>
    getPullRequests(repo.owner.login, repo.name).catch(err => {
      console.warn(`Failed to fetch PRs for ${repo.full_name}:`, err.message);
      return [];
    })
  );

  const results = await Promise.all(prPromises);
  const allPrs = results.flat();

  // Sort by created_at descending (newest first)
  return allPrs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
};

const mergePullRequest = async (owner, repo, pullNumber, method = 'merge') => {
  return makeRequest(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, 'PUT', {
    merge_method: method
  });
};

const closePullRequest = async (owner, repo, pullNumber) => {
  return makeRequest(`/repos/${owner}/${repo}/pulls/${pullNumber}`, 'PATCH', {
    state: 'closed'
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
  getCurrentUser,
  getUserOrgs,
  createRepository,
  getUserRepos,
  getPullRequests,
  getBranches,
  getPullRequestDetails,
  getAllPullRequests,
  mergePullRequest,
  closePullRequest,
  markPullRequestReadyForReview,
  testConnection
};
