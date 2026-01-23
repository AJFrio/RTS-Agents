use crate::models::{GitHubRepo, GitHubUser, PullRequest};
use crate::utils::http::{AuthType, HttpClient};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

const GITHUB_API_BASE: &str = "https://api.github.com";

pub struct GitHubService {
    client: HttpClient,
    token: Option<String>,
}

impl GitHubService {
    pub fn new(token: Option<String>) -> Self {
        Self {
            client: HttpClient::new(),
            token,
        }
    }

    fn auth(&self) -> Option<AuthType> {
        self.token.as_ref().map(|t| AuthType::Bearer(t.clone()))
    }

    /// Get authenticated user info
    pub async fn get_current_user(&self) -> Result<GitHubUser> {
        let url = format!("{}/user", GITHUB_API_BASE);
        self.client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to get current user")
    }

    /// Get repository info
    pub async fn get_repo(&self, owner: &str, repo: &str) -> Result<GitHubRepo> {
        let url = format!("{}/repos/{}/{}", GITHUB_API_BASE, owner, repo);
        self.client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to get repository")
    }

    /// List pull requests for a repository
    pub async fn list_pull_requests(
        &self,
        owner: &str,
        repo: &str,
        state: Option<&str>,
    ) -> Result<Vec<PullRequest>> {
        let state = state.unwrap_or("open");
        let url = format!(
            "{}/repos/{}/{}/pulls?state={}&per_page=100",
            GITHUB_API_BASE, owner, repo, state
        );
        self.client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to list pull requests")
    }

    /// Get a specific pull request
    pub async fn get_pull_request(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
    ) -> Result<PullRequest> {
        let url = format!(
            "{}/repos/{}/{}/pulls/{}",
            GITHUB_API_BASE, owner, repo, pr_number
        );
        self.client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to get pull request")
    }

    /// Get PR files changed
    pub async fn get_pull_request_files(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
    ) -> Result<Vec<PullRequestFile>> {
        let url = format!(
            "{}/repos/{}/{}/pulls/{}/files",
            GITHUB_API_BASE, owner, repo, pr_number
        );
        self.client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to get pull request files")
    }

    /// Get PR reviews
    pub async fn get_pull_request_reviews(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
    ) -> Result<Vec<PullRequestReview>> {
        let url = format!(
            "{}/repos/{}/{}/pulls/{}/reviews",
            GITHUB_API_BASE, owner, repo, pr_number
        );
        self.client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to get pull request reviews")
    }

    /// Get PR check runs
    pub async fn get_check_runs(
        &self,
        owner: &str,
        repo: &str,
        ref_name: &str,
    ) -> Result<CheckRunsResponse> {
        let url = format!(
            "{}/repos/{}/{}/commits/{}/check-runs",
            GITHUB_API_BASE, owner, repo, ref_name
        );
        self.client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to get check runs")
    }

    /// Create a pull request
    pub async fn create_pull_request(
        &self,
        owner: &str,
        repo: &str,
        title: &str,
        body: &str,
        head: &str,
        base: &str,
    ) -> Result<PullRequest> {
        let url = format!("{}/repos/{}/{}/pulls", GITHUB_API_BASE, owner, repo);
        let payload = CreatePullRequest {
            title: title.to_string(),
            body: body.to_string(),
            head: head.to_string(),
            base: base.to_string(),
        };
        self.client
            .post(&url, &payload, self.auth().as_ref())
            .await
            .context("Failed to create pull request")
    }

    /// Merge a pull request
    pub async fn merge_pull_request(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u32,
        merge_method: Option<&str>,
    ) -> Result<MergeResult> {
        let url = format!(
            "{}/repos/{}/{}/pulls/{}/merge",
            GITHUB_API_BASE, owner, repo, pr_number
        );
        let payload = MergePullRequest {
            merge_method: merge_method.unwrap_or("merge").to_string(),
        };
        self.client
            .put(&url, &payload, self.auth().as_ref())
            .await
            .context("Failed to merge pull request")
    }

    /// List repositories for the authenticated user
    pub async fn list_user_repos(&self) -> Result<Vec<GitHubRepo>> {
        let url = format!("{}/user/repos?per_page=100&sort=updated", GITHUB_API_BASE);
        self.client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to list user repositories")
    }

    /// Get branches for a repository
    pub async fn list_branches(&self, owner: &str, repo: &str) -> Result<Vec<Branch>> {
        let url = format!(
            "{}/repos/{}/{}/branches?per_page=100",
            GITHUB_API_BASE, owner, repo
        );
        self.client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to list branches")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequestFile {
    pub filename: String,
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
    pub changes: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub patch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequestReview {
    pub id: u64,
    pub user: GitHubUser,
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    pub submitted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckRunsResponse {
    pub total_count: u32,
    pub check_runs: Vec<CheckRun>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckRun {
    pub id: u64,
    pub name: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conclusion: Option<String>,
    pub html_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Branch {
    pub name: String,
    pub commit: BranchCommit,
    #[serde(default)]
    pub protected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchCommit {
    pub sha: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
struct CreatePullRequest {
    title: String,
    body: String,
    head: String,
    base: String,
}

#[derive(Debug, Serialize)]
struct MergePullRequest {
    merge_method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeResult {
    pub sha: String,
    pub merged: bool,
    pub message: String,
}
