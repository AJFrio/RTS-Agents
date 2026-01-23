use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

/// Background task status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskStatus {
    pub id: String,
    pub name: String,
    pub status: TaskState,
    pub progress: Option<f32>,
    pub message: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TaskState {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// Get all running tasks
#[tauri::command]
pub async fn get_tasks(state: State<'_, AppState>) -> Result<Vec<TaskStatus>, String> {
    let tasks = state.tasks.read().await;
    Ok(tasks.values().cloned().collect())
}

/// Get a specific task
#[tauri::command]
pub async fn get_task(state: State<'_, AppState>, task_id: String) -> Result<Option<TaskStatus>, String> {
    let tasks = state.tasks.read().await;
    Ok(tasks.get(&task_id).cloned())
}

/// Cancel a running task
#[tauri::command]
pub async fn cancel_task(state: State<'_, AppState>, task_id: String) -> Result<bool, String> {
    let mut tasks = state.tasks.write().await;
    if let Some(task) = tasks.get_mut(&task_id) {
        if task.status == TaskState::Running || task.status == TaskState::Pending {
            task.status = TaskState::Cancelled;
            task.completed_at = Some(chrono::Utc::now().to_rfc3339());
            return Ok(true);
        }
    }
    Ok(false)
}

/// Clear completed/failed/cancelled tasks
#[tauri::command]
pub async fn clear_completed_tasks(state: State<'_, AppState>) -> Result<u32, String> {
    let mut tasks = state.tasks.write().await;
    let initial_count = tasks.len();
    tasks.retain(|_, task| {
        task.status == TaskState::Running || task.status == TaskState::Pending
    });
    Ok((initial_count - tasks.len()) as u32)
}

/// Internal function to create a task (used by other commands)
pub async fn create_task(state: &AppState, name: &str) -> String {
    let id = uuid::Uuid::new_v4().to_string();
    let task = TaskStatus {
        id: id.clone(),
        name: name.to_string(),
        status: TaskState::Pending,
        progress: None,
        message: None,
        started_at: chrono::Utc::now().to_rfc3339(),
        completed_at: None,
    };

    let mut tasks = state.tasks.write().await;
    tasks.insert(id.clone(), task);
    id
}

/// Internal function to update task status
pub async fn update_task(
    state: &AppState,
    task_id: &str,
    status: TaskState,
    progress: Option<f32>,
    message: Option<String>,
) {
    let mut tasks = state.tasks.write().await;
    if let Some(task) = tasks.get_mut(task_id) {
        task.status = status.clone();
        task.progress = progress;
        task.message = message;
        if status == TaskState::Completed
            || status == TaskState::Failed
            || status == TaskState::Cancelled
        {
            task.completed_at = Some(chrono::Utc::now().to_rfc3339());
        }
    }
}
