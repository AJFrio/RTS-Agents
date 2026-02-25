/**
 * GitHub API Service
 * Port of the Electron app's GitHub service for web/mobile
 */

import type { GithubRepo, PullRequest, Branch } from '../store/types';

const BASE_URL = '/api/github';

class GithubService {
  private apiKey: string | null = null;

  setApiKey(apiKey: string | null) {
    this.apiKey = apiKey;
  }

  getApiKey(): string | null {
    return this.apiKey;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async request<T>(endpoint: string, method = 'GET', body?: unknown): Promise<T> {
    if (!this.apiKey) {
      throw new Error('GitHub API key not configured');
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async getUserRepos(): Promise<GithubRepo[]> {
    return this.request('/user/repos?sort=updated&per_page=100&type=all');
  }

  async getPullRequests(owner: string, repo: string): Promise<PullRequest[]> {
    return this.request(`/repos/${owner}/${repo}/pulls?state=open`);
  }

  async getBranches(owner: string, repo: string): Promise<Branch[]> {
    return this.request(`/repos/${owner}/${repo}/branches`);
  }

  async getPullRequestDetails(owner: string, repo: string, pullNumber: number): Promise<PullRequest> {
    return this.request(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
  }

  async mergePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    method: 'merge' | 'squash' | 'rebase' = 'merge'
  ): Promise<unknown> {
    return this.request(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, 'PUT', {
      merge_method: method,
    });
  }

  async markPullRequestReadyForReview(nodeId: string): Promise<unknown> {
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

    return this.request('/graphql', 'POST', {
      query,
      variables: { id: nodeId },
    });
  }

  async getRepoFileContent(owner: string, repo: string, path: string): Promise<string | null> {
    try {
      const response = await this.request<{ content: string; encoding: string }>(
        `/repos/${owner}/${repo}/contents/${path}`
      );

      if (response.content && response.encoding === 'base64') {
        // Base64 decode, handling newlines which GitHub API might include
        const cleanContent = response.content.replace(/\n/g, '');
        return atob(cleanContent);
      }
      return null;
    } catch (err) {
      // 404 means file not found, which is expected
      if (err instanceof Error && err.message.includes('404')) {
        return null;
      }
      throw err;
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request('/user');
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  // Helper to extract owner and repo from URL
  parseRepoUrl(url: string): { owner: string; repo: string } | null {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
    }
    return null;
  }
}

export const githubService = new GithubService();
export default githubService;
