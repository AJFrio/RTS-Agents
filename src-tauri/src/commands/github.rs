use crate::services::config_store::SecretKey;
use crate::services::github::{
    Branch, CheckRunsResponse, GitHubService, MergeResult, PullRequestFile, PullRequestReview,
};
use crate::models::{GitHubRepo, GitHubUser, PullRequest};
use crate::state::AppState;
use tauri::State;

/// Get the authenticated GitHub user
#[tauri::command]
pub async fn github_get_user(state: State<'_, AppState>) -> Result<GitHubUser, String> {
    let config = state.config.read().await;
    let token = config.get_secret(SecretKey::GithubToken);
    let service = GitHubService::new(token);
    service.get_current_user().await.map_err(|e| e.to_string())
}

/// Get a GitHub repository
#[tauri::command]
pub async fn github_get_repo(
    state: State<'_, AppState>,
    owner: String,
    repo: String,
) -> Result<GitHubRepo, String> {
    let config = state.config.read().await;
    let token = config.get_secret(SecretKey::GithubToken);
    let service = GitHubService::new(token);
    service.get_repo(&owner, &repo).await.map_err(|e| e.to_string())
}

/// List pull requests for a repository
#[tauri::command]
pub async fn github_list_prs(
    state: State<'_, AppState>,
    owner: String,
    repo: String,
    pr_state: Option<String>,
) -> Result<Vec<PullRequest>, String> {
    let config = state.config.read().await;
    let token = config.get_secret(SecretKey::GithubToken);
    let service = GitHubService::new(token);
    service
        .list_pull_requests(&owner, &repo, pr_state.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Get a specific pull request
#[tauri::command]
pub async fn github_get_pr(
    state: State<'_, AppState>,
    owner: String,
    repo: String,
    pr_number: u32,
) -> Result<PullRequest, String> {
    let config = state.config.read().await;
    let token = config.get_secret(SecretKey::GithubToken);
    let service = GitHubService::new(token);
    service
        .get_pull_request(&owner, &repo, pr_number)
        .await
        .map_err(|e| e.to_string())
}

/// Get files changed in a pull request
#[tauri::command]
pub async fn github_get_pr_files(
    state: State<'_, AppState>,
    owner: String,
    repo: String,
    pr_number: u32,
) -> Result<Vec<PullRequestFile>, String> {
    let config = state.config.read().await;
    let token = config.get_secret(SecretKey::GithubToken);
    let service = GitHubService::new(token);
    service
        .get_pull_request_files(&owner, &repo, pr_number)
        .await
        .map_err(|e| e.to_string())
}

/// Get reviews for a pull request
#[tauri::command]
pub async fn github_get_pr_reviews(
    state: State<'_, AppState>,
    owner: String,
    repo: String,
    pr_number: u32,
) -> Result<Vec<PullRequestReview>, String> {
    let config = state.config.read().await;
    let token = config.get_secret(SecretKey::GithubToken);
    let service = GitHubService::new(token);
    service
        .get_pull_request_reviews(&owner, &repo, pr_number)
        .await
        .map_err(|e| e.to_string())
}

/// Get check runs for a commit/ref
#[tauri::command]
pub async fn github_get_check_runs(
    state: State<'_, AppState>,
    owner: String,
    repo: String,
    ref_name: String,
) -> Result<CheckRunsResponse, String> {
    let config = state.config.read().await;
    let token = config.get_secret(SecretKey::GithubToken);
    let service = GitHubService::new(token);
    service
        .get_check_runs(&owner, &repo, &ref_name)
        .await
        .map_err(|e| e.to_string())
}

/// Create a pull request
#[tauri::command]
pub async fn github_create_pr(
    state: State<'_, AppState>,
    owner: String,
    repo: String,
    title: String,
    body: String,
    head: String,
    base: String,
) -> Result<PullRequest, String> {
    let config = state.config.read().await;
    let token = config.get_secret(SecretKey::GithubToken);
    let service = GitHubService::new(token);
    service
        .create_pull_request(&owner, &repo, &title, &body, &head, &base)
        .await
        .map_err(|e| e.to_string())
}

/// Merge a pull request
#[tauri::command]
pub async fn github_merge_pr(
    state: State<'_, AppState>,
    owner: String,
    repo: String,
    pr_number: u32,
    merge_method: Option<String>,
) -> Result<MergeResult, String> {
    let config = state.config.read().await;
    let token = config.get_secret(SecretKey::GithubToken);
    let service = GitHubService::new(token);
    service
        .merge_pull_request(&owner, &repo, pr_number, merge_method.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// List user's repositories
#[tauri::command]
pub async fn github_list_repos(state: State<'_, AppState>) -> Result<Vec<GitHubRepo>, String> {
    let config = state.config.read().await;
    let token = config.get_secret(SecretKey::GithubToken);
    let service = GitHubService::new(token);
    service.list_user_repos().await.map_err(|e| e.to_string())
}

/// List branches for a repository
#[tauri::command]
pub async fn github_list_branches(
    state: State<'_, AppState>,
    owner: String,
    repo: String,
) -> Result<Vec<Branch>, String> {
    let config = state.config.read().await;
    let token = config.get_secret(SecretKey::GithubToken);
    let service = GitHubService::new(token);
    service.list_branches(&owner, &repo).await.map_err(|e| e.to_string())
}
