/**
 * Jira API Service (Agile backlog/sprints)
 *
 * Uses the Cloudflare Worker proxy at `/api/jira`.
 * Requires:
 * - API key/token (stored as provider "jira")
 * - Jira Base URL (stored in settings as `jiraBaseUrl`)
 *
 * Auth formats supported:
 * - If key contains ":", it's treated as "email:token" and sent as Basic auth.
 * - Otherwise, it's sent as Bearer token (PAT).
 */

const BASE_URL = '/api/jira';

export interface JiraBoard {
  id: number;
  name: string;
  type?: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state?: 'active' | 'closed' | 'future' | string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
}

export interface JiraUser {
  displayName?: string;
  accountId?: string;
  emailAddress?: string;
}

export interface JiraIssueFields {
  summary?: string;
  description?: unknown;
  assignee?: JiraUser | null;
  reporter?: JiraUser | null;
  status?: { name?: string };
  priority?: { name?: string };
  issuetype?: { name?: string };
  created?: string;
  updated?: string;
  labels?: string[];
}

export interface JiraIssue {
  id: string;
  key: string;
  self?: string;
  fields?: JiraIssueFields;
}

interface JiraListResponse<T> {
  values?: T[];
  isLast?: boolean;
  startAt?: number;
  maxResults?: number;
  total?: number;
}

interface JiraBoardsResponse {
  values?: Array<{ id: number; name: string; type?: string }>;
}

interface JiraIssuesResponse {
  issues?: JiraIssue[];
}

class JiraService {
  private apiKey: string | null = null;
  private baseUrl: string | null = null;

  setApiKey(apiKey: string | null) {
    this.apiKey = apiKey;
  }

  setBaseUrl(baseUrl: string | null) {
    this.baseUrl = baseUrl ? baseUrl.replace(/\/+$/, '') : null;
  }

  isConfigured(): boolean {
    return !!(this.apiKey && this.baseUrl);
  }

  private async request<T>(endpoint: string, method = 'GET', body?: unknown): Promise<T> {
    if (!this.apiKey) throw new Error('Jira API key not configured');
    if (!this.baseUrl) throw new Error('Jira Base URL not configured');

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'X-JIRA-BASE-URL': this.baseUrl,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async listBoards(): Promise<JiraBoard[]> {
    const res = await this.request<JiraBoardsResponse>('/rest/agile/1.0/board?maxResults=50');
    return (res.values || []).map(b => ({ id: b.id, name: b.name, type: b.type }));
  }

  async listSprints(boardId: number): Promise<JiraSprint[]> {
    const res = await this.request<JiraListResponse<JiraSprint>>(
      `/rest/agile/1.0/board/${boardId}/sprint?state=active,future,closed&maxResults=50`
    );
    return res.values || [];
  }

  async getBacklogIssues(boardId: number): Promise<JiraIssue[]> {
    const res = await this.request<JiraIssuesResponse>(
      `/rest/agile/1.0/board/${boardId}/backlog?maxResults=100&fields=summary,assignee,status,priority,issuetype,created,updated,labels,description,reporter`
    );
    return res.issues || [];
  }

  async getSprintIssues(sprintId: number): Promise<JiraIssue[]> {
    const res = await this.request<JiraIssuesResponse>(
      `/rest/agile/1.0/sprint/${sprintId}/issue?maxResults=100&fields=summary,assignee,status,priority,issuetype,created,updated,labels,description,reporter`
    );
    return res.issues || [];
  }

  async getBoardIssues(boardId: number): Promise<JiraIssue[]> {
    const res = await this.request<JiraIssuesResponse>(
      `/rest/agile/1.0/board/${boardId}/issue?maxResults=100&fields=summary,assignee,status,priority,issuetype,created,updated,labels,description,reporter`
    );
    return res.issues || [];
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    return this.request<JiraIssue>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,assignee,status,priority,issuetype,created,updated,labels,description,reporter`
    );
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // /myself exists on both cloud/DC (with appropriate auth)
      await this.request('/rest/api/3/myself');
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
}

export const jiraService = new JiraService();
export default jiraService;

