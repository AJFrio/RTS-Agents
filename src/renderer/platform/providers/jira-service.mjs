/**
 * Jira API service (web runtime) — Agile boards/sprints/backlog.
 *
 * Port of mobile-webapp/src/services/jira-service.ts to plain ESM JS. Talks to
 * the same-origin worker proxy at /api/jira. Requires the stored API key
 * (X-API-Key) and the Jira base URL from settings (X-JIRA-BASE-URL); the
 * worker resolves the auth style (Basic for "email:token", Bearer for PAT).
 * Methods return the desktop IPC envelopes from src/main/ipc/register-jira.js.
 */

import { createRequester } from './provider-http.mjs';

const BASE_URL = '/api/jira';

const ISSUE_FIELDS =
  'summary,assignee,status,priority,issuetype,created,updated,labels,description,reporter';

export function createJiraService({ storage, fetchImpl } = {}) {
  const request = createRequester({
    baseUrl: BASE_URL,
    label: 'Jira',
    fetchImpl,
    getHeaders() {
      const apiKey = storage.getApiKey('jira');
      if (!apiKey) throw new Error('Jira API key not configured');
      const baseUrl = (storage.getSettings().jiraBaseUrl || '').replace(/\/+$/, '');
      if (!baseUrl) throw new Error('Jira Base URL not configured');
      return { 'X-API-Key': apiKey, 'X-JIRA-BASE-URL': baseUrl };
    },
  });

  async function getBoards() {
    try {
      const res = await request('/rest/agile/1.0/board?maxResults=50');
      return {
        success: true,
        boards: (res.values || []).map((b) => ({ id: b.id, name: b.name, type: b.type })),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getSprints(boardId) {
    try {
      const res = await request(
        `/rest/agile/1.0/board/${boardId}/sprint?state=active,future,closed&maxResults=50`
      );
      return { success: true, sprints: res.values || [] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getBacklogIssues(boardId) {
    try {
      const res = await request(
        `/rest/agile/1.0/board/${boardId}/backlog?maxResults=100&fields=${ISSUE_FIELDS}`
      );
      return { success: true, issues: res.issues || [] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getSprintIssues(sprintId) {
    try {
      const res = await request(
        `/rest/agile/1.0/sprint/${sprintId}/issue?maxResults=100&fields=${ISSUE_FIELDS}`
      );
      return { success: true, issues: res.issues || [] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getIssue(issueKey) {
    try {
      const issue = await request(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${ISSUE_FIELDS}`
      );
      return { success: true, issue };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getIssueComments(issueKey) {
    try {
      const comments = await request(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`);
      return { success: true, comments: comments.comments || [] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function testConnection() {
    try {
      // /myself exists on both cloud/DC (with appropriate auth)
      await request('/rest/api/3/myself');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return {
    getBoards,
    getSprints,
    getBacklogIssues,
    getSprintIssues,
    getIssue,
    getIssueComments,
    testConnection,
  };
}

export default createJiraService;
