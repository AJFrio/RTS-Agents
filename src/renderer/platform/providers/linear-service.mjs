/**
 * Linear API service (web runtime) — teams/issues via GraphQL.
 *
 * Mirror of src/renderer/platform/providers/jira-service.mjs for the Linear
 * provider. Talks to the same-origin worker proxy at /api/linear, which POSTs
 * the JSON body to the fixed https://api.linear.app/graphql endpoint with the
 * stored API key (X-API-Key) as the Authorization header. Methods return the
 * desktop IPC envelopes from src/main/ipc/register-linear.js with the issue
 * normalization of src/main/services/linear-service.js.
 */

import { createRequester } from './provider-http.mjs';

const BASE_URL = '/api/linear';

const ISSUE_FIELDS =
  'id identifier title description state { name } priority url project { name } assignee { name } updatedAt';

function normalizeIssue(issue) {
  return {
    id: issue.id,
    key: issue.identifier,
    title: issue.title,
    description: issue.description ?? '',
    state: issue.state?.name ?? null,
    priority: issue.priority,
    url: issue.url,
    project: issue.project?.name ?? null,
    assignee: issue.assignee?.name ?? null,
    updatedAt: issue.updatedAt,
  };
}

export function createLinearService({ storage, fetchImpl } = {}) {
  const request = createRequester({
    baseUrl: BASE_URL,
    label: 'Linear',
    fetchImpl,
    getHeaders() {
      const apiKey = storage.getApiKey('linear');
      if (!apiKey) throw new Error('Linear API key not configured');
      return { 'X-API-Key': apiKey };
    },
  });

  async function graphql(query, variables) {
    const res = await request('', 'POST', variables ? { query, variables } : { query });
    if (res.errors?.length) {
      throw new Error(`Linear GraphQL error: ${res.errors[0].message}`);
    }
    return res.data || {};
  }

  async function getTeams() {
    try {
      const data = await graphql(`query { teams { nodes { id name key } } }`);
      return {
        success: true,
        teams: (data.teams?.nodes || []).map((t) => ({ id: t.id, name: t.name, key: t.key })),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getIssues(teamId) {
    try {
      const data = await graphql(
        `query ($teamId: String!, $first: Int) {
          issues(filter: { team: { id: { eq: $teamId } } }, first: $first) {
            nodes { ${ISSUE_FIELDS} }
          }
        }`,
        { teamId, first: 50 }
      );
      return { success: true, issues: (data.issues?.nodes || []).map(normalizeIssue) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getIssue(issueId) {
    try {
      const data = await graphql(
        `query ($id: String!) {
          issue(id: $id) { ${ISSUE_FIELDS} }
        }`,
        { id: issueId }
      );
      return { success: true, issue: normalizeIssue(data.issue) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function testConnection() {
    try {
      const data = await graphql(`query { viewer { id name email } }`);
      return { success: true, user: data.viewer };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return {
    getTeams,
    getIssues,
    getIssue,
    testConnection,
  };
}

export default createLinearService;
