use crate::models::{AppSettings, ProjectConfig, Theme};
use crate::services::config_store::{MigrationResult, SecretKey};
use crate::state::AppState;
use tauri::State;

/// Get all settings
#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let config = state.config.read().await;
    Ok(config.get_settings())
}

/// Update all settings
#[tauri::command]
pub async fn set_settings(state: State<'_, AppState>, settings: AppSettings) -> Result<(), String> {
    let config = state.config.read().await;
    config.set_settings(settings).map_err(|e| e.to_string())
}

/// Get theme
#[tauri::command]
pub async fn get_theme(state: State<'_, AppState>) -> Result<Theme, String> {
    let config = state.config.read().await;
    Ok(config.get_theme())
}

/// Set theme
#[tauri::command]
pub async fn set_theme(state: State<'_, AppState>, theme: Theme) -> Result<(), String> {
    let config = state.config.read().await;
    config.set_theme(theme).map_err(|e| e.to_string())
}

/// Get refresh interval
#[tauri::command]
pub async fn get_refresh_interval(state: State<'_, AppState>) -> Result<u32, String> {
    let config = state.config.read().await;
    Ok(config.get_refresh_interval())
}

/// Set refresh interval
#[tauri::command]
pub async fn set_refresh_interval(state: State<'_, AppState>, interval: u32) -> Result<(), String> {
    let config = state.config.read().await;
    config.set_refresh_interval(interval).map_err(|e| e.to_string())
}

/// Get API key for a provider (returns whether it exists, not the actual key)
#[tauri::command]
pub async fn has_api_key(state: State<'_, AppState>, provider: String) -> Result<bool, String> {
    let config = state.config.read().await;
    let key = SecretKey::from_provider(&provider).ok_or("Unknown provider")?;
    Ok(config.has_secret(key))
}

/// Set API key for a provider
#[tauri::command]
pub async fn set_api_key(
    state: State<'_, AppState>,
    provider: String,
    api_key: String,
) -> Result<(), String> {
    let config = state.config.read().await;
    let key = SecretKey::from_provider(&provider).ok_or("Unknown provider")?;
    config.set_secret(key, &api_key).map_err(|e| e.to_string())
}

/// Delete API key for a provider
#[tauri::command]
pub async fn delete_api_key(state: State<'_, AppState>, provider: String) -> Result<(), String> {
    let config = state.config.read().await;
    let key = SecretKey::from_provider(&provider).ok_or("Unknown provider")?;
    config.delete_secret(key).map_err(|e| e.to_string())
}

/// Check if a provider is enabled
#[tauri::command]
pub async fn is_provider_enabled(state: State<'_, AppState>, provider: String) -> Result<bool, String> {
    let config = state.config.read().await;
    Ok(config.is_provider_enabled(&provider))
}

/// Enable or disable a provider
#[tauri::command]
pub async fn set_provider_enabled(
    state: State<'_, AppState>,
    provider: String,
    enabled: bool,
) -> Result<(), String> {
    let config = state.config.read().await;
    config.set_provider_enabled(&provider, enabled).map_err(|e| e.to_string())
}

/// Get all enabled providers
#[tauri::command]
pub async fn get_enabled_providers(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let config = state.config.read().await;
    let settings = config.get_settings();
    let mut providers = Vec::new();

    if settings.github_enabled {
        providers.push("github".to_string());
    }
    if settings.jira_enabled {
        providers.push("jira".to_string());
    }
    if settings.cloudflare_enabled {
        providers.push("cloudflare".to_string());
    }
    if settings.gemini_enabled {
        providers.push("gemini".to_string());
    }
    if settings.claude_enabled {
        providers.push("claude".to_string());
    }
    if settings.cursor_enabled {
        providers.push("cursor".to_string());
    }
    if settings.codex_enabled {
        providers.push("codex".to_string());
    }
    if settings.jules_enabled {
        providers.push("jules".to_string());
    }

    Ok(providers)
}

/// Get projects
#[tauri::command]
pub async fn get_projects(state: State<'_, AppState>) -> Result<Vec<ProjectConfig>, String> {
    let config = state.config.read().await;
    Ok(config.get_projects())
}

/// Add a project
#[tauri::command]
pub async fn add_project(state: State<'_, AppState>, project: ProjectConfig) -> Result<(), String> {
    let config = state.config.read().await;
    config.add_project(project).map_err(|e| e.to_string())
}

/// Remove a project
#[tauri::command]
pub async fn remove_project(state: State<'_, AppState>, project_id: String) -> Result<(), String> {
    let config = state.config.read().await;
    config.remove_project(&project_id).map_err(|e| e.to_string())
}

/// Get Jira configuration
#[tauri::command]
pub async fn get_jira_config(
    state: State<'_, AppState>,
) -> Result<(Option<String>, Option<String>), String> {
    let config = state.config.read().await;
    Ok(config.get_jira_config())
}

/// Set Jira configuration
#[tauri::command]
pub async fn set_jira_config(
    state: State<'_, AppState>,
    base_url: Option<String>,
    email: Option<String>,
) -> Result<(), String> {
    let config = state.config.read().await;
    config.set_jira_config(base_url, email).map_err(|e| e.to_string())
}

/// Get Cloudflare configuration
#[tauri::command]
pub async fn get_cloudflare_config(
    state: State<'_, AppState>,
) -> Result<(Option<String>, Option<String>), String> {
    let config = state.config.read().await;
    Ok(config.get_cloudflare_config())
}

/// Set Cloudflare configuration
#[tauri::command]
pub async fn set_cloudflare_config(
    state: State<'_, AppState>,
    account_id: Option<String>,
    namespace_id: Option<String>,
) -> Result<(), String> {
    let config = state.config.read().await;
    config.set_cloudflare_config(account_id, namespace_id).map_err(|e| e.to_string())
}

/// Migrate settings from Electron store
#[tauri::command]
pub async fn migrate_from_electron(
    state: State<'_, AppState>,
    electron_store_path: String,
) -> Result<MigrationResult, String> {
    let config = state.config.read().await;
    config
        .migrate_from_electron(&electron_store_path)
        .map_err(|e| e.to_string())
}

/// Export settings to a file (for backup)
#[tauri::command]
pub async fn export_settings(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let config = state.config.read().await;
    let settings = config.get_settings();
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Import settings from a file
#[tauri::command]
pub async fn import_settings(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let config = state.config.read().await;
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let settings: AppSettings = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    config.set_settings(settings).map_err(|e| e.to_string())
}
