use crate::services::project::{
    BranchInfo, DiscoveredProject, ProjectInfo, ProjectService, WorktreeInfo,
};
use crate::state::AppState;
use tauri::State;

/// Discover local Git projects
#[tauri::command]
pub async fn discover_projects(
    _state: State<'_, AppState>,
    max_depth: Option<usize>,
) -> Result<Vec<DiscoveredProject>, String> {
    let service = ProjectService::new();
    service
        .discover_projects(max_depth.unwrap_or(3))
        .map_err(|e| e.to_string())
}

/// Get detailed info about a specific project
#[tauri::command]
pub async fn get_project_info(
    _state: State<'_, AppState>,
    path: String,
) -> Result<ProjectInfo, String> {
    let service = ProjectService::new();
    service.get_project_info(&path).map_err(|e| e.to_string())
}

/// Pull latest changes for a project
#[tauri::command]
pub async fn project_pull(
    _state: State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    let service = ProjectService::new();
    service.pull(&path).map_err(|e| e.to_string())
}

/// Fetch from remote for a project
#[tauri::command]
pub async fn project_fetch(
    _state: State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    let service = ProjectService::new();
    service.fetch(&path).map_err(|e| e.to_string())
}

/// Checkout a branch
#[tauri::command]
pub async fn project_checkout(
    _state: State<'_, AppState>,
    path: String,
    branch: String,
) -> Result<String, String> {
    let service = ProjectService::new();
    service.checkout(&path, &branch).map_err(|e| e.to_string())
}

/// Create and checkout a new branch
#[tauri::command]
pub async fn project_create_branch(
    _state: State<'_, AppState>,
    path: String,
    branch: String,
) -> Result<String, String> {
    let service = ProjectService::new();
    service.create_branch(&path, &branch).map_err(|e| e.to_string())
}

/// Get all branches for a project
#[tauri::command]
pub async fn project_get_branches(
    _state: State<'_, AppState>,
    path: String,
) -> Result<Vec<BranchInfo>, String> {
    let service = ProjectService::new();
    let info = service.get_project_info(&path).map_err(|e| e.to_string())?;
    Ok(info.branches)
}

/// Create a git worktree
#[tauri::command]
pub async fn project_create_worktree(
    _state: State<'_, AppState>,
    path: String,
    branch: String,
    worktree_path: String,
) -> Result<String, String> {
    let service = ProjectService::new();
    service
        .create_worktree(&path, &branch, &worktree_path)
        .map_err(|e| e.to_string())
}

/// Remove a git worktree
#[tauri::command]
pub async fn project_remove_worktree(
    _state: State<'_, AppState>,
    path: String,
    worktree_path: String,
) -> Result<String, String> {
    let service = ProjectService::new();
    service
        .remove_worktree(&path, &worktree_path)
        .map_err(|e| e.to_string())
}

/// List git worktrees
#[tauri::command]
pub async fn project_list_worktrees(
    _state: State<'_, AppState>,
    path: String,
) -> Result<Vec<WorktreeInfo>, String> {
    let service = ProjectService::new();
    service.list_worktrees(&path).map_err(|e| e.to_string())
}
