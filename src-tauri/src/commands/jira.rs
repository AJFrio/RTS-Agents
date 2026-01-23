use crate::models::JiraIssue;
use crate::services::config_store::SecretKey;
use crate::services::jira::{CreateIssueRequest, JiraProject, JiraService, SearchResult, Transition, UpdateIssueRequest};
use crate::state::AppState;
use tauri::State;

async fn get_jira_service(state: &AppState) -> Result<JiraService, String> {
    let config = state.config.read().await;
    let (base_url, email) = config.get_jira_config();

    let base_url = base_url.ok_or("Jira base URL not configured")?;
    let email = email.ok_or("Jira email not configured")?;
    let api_token = config.get_secret(SecretKey::JiraApiToken);

    Ok(JiraService::new(base_url, email, api_token))
}

/// Get a Jira issue by key
#[tauri::command]
pub async fn jira_get_issue(
    state: State<'_, AppState>,
    issue_key: String,
) -> Result<JiraIssue, String> {
    let service = get_jira_service(&state).await?;
    service.get_issue(&issue_key).await.map_err(|e| e.to_string())
}

/// Search Jira issues with JQL
#[tauri::command]
pub async fn jira_search(
    state: State<'_, AppState>,
    jql: String,
    max_results: Option<u32>,
) -> Result<SearchResult, String> {
    let service = get_jira_service(&state).await?;
    service
        .search_issues(&jql, max_results.unwrap_or(50))
        .await
        .map_err(|e| e.to_string())
}

/// Get issues assigned to current user
#[tauri::command]
pub async fn jira_get_my_issues(state: State<'_, AppState>) -> Result<Vec<JiraIssue>, String> {
    let service = get_jira_service(&state).await?;
    service.get_my_issues().await.map_err(|e| e.to_string())
}

/// Get issues for a specific project
#[tauri::command]
pub async fn jira_get_project_issues(
    state: State<'_, AppState>,
    project_key: String,
) -> Result<Vec<JiraIssue>, String> {
    let service = get_jira_service(&state).await?;
    service
        .get_project_issues(&project_key)
        .await
        .map_err(|e| e.to_string())
}

/// Create a new Jira issue
#[tauri::command]
pub async fn jira_create_issue(
    state: State<'_, AppState>,
    project_key: String,
    summary: String,
    description: Option<String>,
    issue_type_id: String,
    priority_id: Option<String>,
    assignee_id: Option<String>,
) -> Result<JiraIssue, String> {
    let service = get_jira_service(&state).await?;
    let request = CreateIssueRequest {
        summary,
        description,
        issue_type_id,
        priority_id,
        assignee_id,
    };
    service
        .create_issue(&project_key, request)
        .await
        .map_err(|e| e.to_string())
}

/// Update a Jira issue
#[tauri::command]
pub async fn jira_update_issue(
    state: State<'_, AppState>,
    issue_key: String,
    summary: Option<String>,
    description: Option<String>,
) -> Result<(), String> {
    let service = get_jira_service(&state).await?;
    let request = UpdateIssueRequest {
        summary,
        description,
    };
    service
        .update_issue(&issue_key, request)
        .await
        .map_err(|e| e.to_string())
}

/// Transition a Jira issue to a new status
#[tauri::command]
pub async fn jira_transition_issue(
    state: State<'_, AppState>,
    issue_key: String,
    transition_id: String,
) -> Result<(), String> {
    let service = get_jira_service(&state).await?;
    service
        .transition_issue(&issue_key, &transition_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get available transitions for an issue
#[tauri::command]
pub async fn jira_get_transitions(
    state: State<'_, AppState>,
    issue_key: String,
) -> Result<Vec<Transition>, String> {
    let service = get_jira_service(&state).await?;
    service
        .get_transitions(&issue_key)
        .await
        .map_err(|e| e.to_string())
}

/// Get a Jira project
#[tauri::command]
pub async fn jira_get_project(
    state: State<'_, AppState>,
    project_key: String,
) -> Result<JiraProject, String> {
    let service = get_jira_service(&state).await?;
    service.get_project(&project_key).await.map_err(|e| e.to_string())
}

/// Get all accessible Jira projects
#[tauri::command]
pub async fn jira_get_projects(state: State<'_, AppState>) -> Result<Vec<JiraProject>, String> {
    let service = get_jira_service(&state).await?;
    service.get_projects().await.map_err(|e| e.to_string())
}
