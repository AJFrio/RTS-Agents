/**
 * GitHub API service (web runtime).
 *
 * Port of mobile-webapp/src/services/github-service.ts, extended with the
 * missing desktop methods (src/main/services/github-service.js) via the
 * same-origin worker proxy at /api/github. Methods return the desktop IPC
 * envelopes ({success, repos|prs|branches|checks|pr|result|...}) exactly as
 * src/main/ipc/register-github.js produces them.
 */

import { createRequester } from './provider-http.mjs';

const BASE_URL = '/api/github';

const READY_FOR_REVIEW_MUTATION = `
  mutation($id: ID!) {
    markPullRequestReadyForReview(input: {pullRequestId: $id}) {
      pullRequest {
        id
        isDraft
      }
    }
  }
`;

/** Base64 → UTF-8 (browser-safe equivalent of Buffer.from(b64, 'base64')). */
function base64ToUtf8(base64) {
  const binary = atob(base64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function createGithubService({ storage, fetchImpl } = {}) {
  const request = createRequester({
    baseUrl: BASE_URL,
    label: 'GitHub',
    fetchImpl,
    getHeaders() {
      const apiKey = storage.getApiKey('github');
      if (!apiKey) throw new Error('GitHub API key not configured');
      return { 'X-API-Key': apiKey };
    },
  });

  async function getRepos() {
    try {
      const repos = await request('/user/repos?sort=updated&per_page=100&type=all');
      return { success: true, repos };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getAllPrs() {
    try {
      const repos = await request('/user/repos?sort=updated&per_page=100&type=all');
      if (!Array.isArray(repos)) {
        return { success: true, prs: [] };
      }

      // Fetch PRs for all repos in parallel; one bad repo must not break the rest.
      const prPromises = repos.map((repo) =>
        request(`/repos/${repo.owner.login}/${repo.name}/pulls?state=open`).catch((err) => {
          console.warn(
            `Failed to fetch PRs for ${repo.full_name}:`,
            err instanceof Error ? err.message : String(err)
          );
          return [];
        })
      );

      const results = await Promise.all(prPromises);
      const prs = results.flat();

      // Sort by created_at descending (newest first)
      prs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { success: true, prs };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getPrs(owner, repo, state = 'open') {
    try {
      const prs = await request(`/repos/${owner}/${repo}/pulls?state=${state}`);
      return { success: true, prs };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getBranches(owner, repo) {
    try {
      const branches = await request(`/repos/${owner}/${repo}/branches`);
      return { success: true, branches };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getOwners() {
    try {
      const user = await request('/user');
      const orgs = await request('/user/orgs?per_page=100');
      return { success: true, user, orgs };
    } catch (err) {
      return { success: false, error: err.message, user: null, orgs: [] };
    }
  }

  async function getPrDetails(owner, repo, prNumber) {
    try {
      const pr = await request(`/repos/${owner}/${repo}/pulls/${prNumber}`);
      return { success: true, pr };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getPrChecks(owner, repo, ref) {
    try {
      const [checkRunsResult, statusResult] = await Promise.allSettled([
        request(`/repos/${owner}/${repo}/commits/${ref}/check-runs?per_page=100`),
        request(`/repos/${owner}/${repo}/commits/${ref}/status?per_page=100`),
      ]);

      const checkRuns =
        checkRunsResult.status === 'fulfilled' && Array.isArray(checkRunsResult.value?.check_runs)
          ? checkRunsResult.value.check_runs.map((run) => ({
              id: `check-${run.id}`,
              name: run.name,
              status: run.status, // queued | in_progress | completed
              conclusion: run.conclusion, // success | failure | neutral | cancelled | skipped | timed_out | action_required | null
              url: run.html_url,
              appName: run.app?.name || null,
              startedAt: run.started_at || null,
              completedAt: run.completed_at || null,
            }))
          : [];

      const statuses =
        statusResult.status === 'fulfilled' && Array.isArray(statusResult.value?.statuses)
          ? statusResult.value.statuses.map((s) => ({
              id: `status-${s.id}`,
              name: s.context,
              status: s.state === 'pending' ? 'in_progress' : 'completed',
              conclusion:
                s.state === 'success'
                  ? 'success'
                  : s.state === 'failure' || s.state === 'error'
                    ? 'failure'
                    : null,
              url: s.target_url || null,
              appName: s.creator?.login || null,
              startedAt: s.created_at || null,
              completedAt: s.updated_at || null,
            }))
          : [];

      return { success: true, checks: [...checkRuns, ...statuses] };
    } catch (err) {
      return { success: false, error: err.message, checks: [] };
    }
  }

  async function getRepoFile(owner, repo, path) {
    try {
      const result = await request(`/repos/${owner}/${repo}/contents/${path}`);
      if (result && result.content && result.encoding === 'base64') {
        return { success: true, content: base64ToUtf8(result.content) };
      }
      return { success: true, content: null };
    } catch (err) {
      // A missing file is an expected outcome, not a failure.
      if (err.message.includes('404') || err.message.includes('Not Found')) {
        return { success: true, content: null };
      }
      return { success: false, error: err.message };
    }
  }

  async function mergePr(owner, repo, prNumber, method = 'merge') {
    try {
      const result = await request(`/repos/${owner}/${repo}/pulls/${prNumber}/merge`, 'PUT', {
        merge_method: method,
      });
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function closePr(owner, repo, prNumber) {
    try {
      const result = await request(`/repos/${owner}/${repo}/pulls/${prNumber}`, 'PATCH', {
        state: 'closed',
      });
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function markPrReadyForReview(nodeId) {
    try {
      const result = await request('/graphql', 'POST', {
        query: READY_FOR_REVIEW_MUTATION,
        variables: { id: nodeId },
      });
      if (result.errors) {
        return { success: false, error: result.errors[0].message };
      }
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function createRepo(options = {}) {
    try {
      const { ownerType = 'user', owner, name, private: isPrivate = false } = options;
      if (!name) throw new Error('Repository name is required');

      const payload = { name, private: !!isPrivate };

      const repo =
        ownerType === 'org'
          ? await (async () => {
              if (!owner) throw new Error('Organization is required to create an org repo');
              return request(`/orgs/${owner}/repos`, 'POST', payload);
            })()
          : await request('/user/repos', 'POST', payload);

      return { success: true, repo };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function testConnection() {
    try {
      await request('/user');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return {
    getRepos,
    getAllPrs,
    getPrs,
    getBranches,
    getOwners,
    getPrDetails,
    getPrChecks,
    getRepoFile,
    mergePr,
    closePr,
    markPrReadyForReview,
    createRepo,
    testConnection,
  };
}

export default createGithubService;
