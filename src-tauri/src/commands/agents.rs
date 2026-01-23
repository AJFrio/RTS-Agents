use crate::models::{Agent, AgentDetails, AgentsResponse};
use crate::services::{claude, codex, cursor, gemini, jules};
use crate::state::AppState;
use tauri::State;

/// Get all agents from all enabled providers
#[tauri::command]
pub async fn get_agents(state: State<'_, AppState>) -> Result<AgentsResponse, String> {
    let config = state.config.read().await;
    let mut all_agents: Vec<Agent> = Vec::new();

    // Fetch agents from each enabled provider concurrently
    let (gemini_result, claude_result, cursor_result, codex_result, jules_result) = tokio::join!(
        async {
            if config.is_provider_enabled("gemini") {
                let service = gemini::GeminiService::new();
                service.get_all_agents().ok()
            } else {
                None
            }
        },
        async {
            if config.is_provider_enabled("claude") {
                let api_key = config.get_secret(crate::services::config_store::SecretKey::ClaudeApiKey);
                let service = claude::ClaudeService::new(api_key);
                service.get_all_agents().ok()
            } else {
                None
            }
        },
        async {
            if config.is_provider_enabled("cursor") {
                let api_key = config.get_secret(crate::services::config_store::SecretKey::CursorApiKey);
                let service = cursor::CursorService::new(api_key);
                service.get_all_agents().await.ok()
            } else {
                None
            }
        },
        async {
            if config.is_provider_enabled("codex") {
                let api_key = config.get_secret(crate::services::config_store::SecretKey::CodexApiKey);
                let service = codex::CodexService::new(api_key);
                service.get_all_agents().await.ok()
            } else {
                None
            }
        },
        async {
            if config.is_provider_enabled("jules") {
                let api_key = config.get_secret(crate::services::config_store::SecretKey::JulesApiKey);
                let service = jules::JulesService::new(api_key);
                service.get_all_agents().await.ok()
            } else {
                None
            }
        }
    );

    // Combine results
    if let Some(agents) = gemini_result {
        all_agents.extend(agents);
    }
    if let Some(agents) = claude_result {
        all_agents.extend(agents);
    }
    if let Some(agents) = cursor_result {
        all_agents.extend(agents);
    }
    if let Some(agents) = codex_result {
        all_agents.extend(agents);
    }
    if let Some(agents) = jules_result {
        all_agents.extend(agents);
    }

    // Sort by last updated (newest first)
    all_agents.sort_by(|a, b| {
        b.last_updated
            .as_ref()
            .unwrap_or(&String::new())
            .cmp(a.last_updated.as_ref().unwrap_or(&String::new()))
    });

    let total = all_agents.len();

    Ok(AgentsResponse {
        agents: all_agents,
        total,
    })
}

/// Get detailed information about a specific agent
#[tauri::command]
pub async fn get_agent_details(
    state: State<'_, AppState>,
    provider: String,
    raw_id: String,
    file_path: Option<String>,
) -> Result<AgentDetails, String> {
    let config = state.config.read().await;

    match provider.as_str() {
        "gemini" => {
            let service = gemini::GeminiService::new();
            let path = file_path.ok_or("file_path required for Gemini agents")?;
            service
                .get_agent_details(&raw_id, &path)
                .map_err(|e| e.to_string())
        }
        "claude" => {
            let api_key = config.get_secret(crate::services::config_store::SecretKey::ClaudeApiKey);
            let service = claude::ClaudeService::new(api_key);
            service
                .get_agent_details(&raw_id, file_path.as_deref())
                .map_err(|e| e.to_string())
        }
        "cursor" => {
            let api_key = config.get_secret(crate::services::config_store::SecretKey::CursorApiKey);
            let service = cursor::CursorService::new(api_key);
            service
                .get_agent_details(&raw_id)
                .await
                .map_err(|e| e.to_string())
        }
        "codex" => {
            let api_key = config.get_secret(crate::services::config_store::SecretKey::CodexApiKey);
            let service = codex::CodexService::new(api_key);
            service
                .get_agent_details(&raw_id)
                .await
                .map_err(|e| e.to_string())
        }
        "jules" => {
            let api_key = config.get_secret(crate::services::config_store::SecretKey::JulesApiKey);
            let service = jules::JulesService::new(api_key);
            service
                .get_agent_details(&raw_id)
                .await
                .map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown provider: {}", provider)),
    }
}

/// Start a new agent session
#[tauri::command]
pub async fn start_agent_session(
    state: State<'_, AppState>,
    provider: String,
    prompt: String,
    project_path: Option<String>,
    repository: Option<String>,
    branch: Option<String>,
    auto_create_pr: Option<bool>,
) -> Result<serde_json::Value, String> {
    let config = state.config.read().await;

    match provider.as_str() {
        "gemini" => {
            let path = project_path.ok_or("project_path required for Gemini")?;
            let service = gemini::GeminiService::new();
            let result = service
                .start_session(&prompt, &path)
                .map_err(|e| e.to_string())?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "claude" => {
            let api_key = config.get_secret(crate::services::config_store::SecretKey::ClaudeApiKey);
            let service = claude::ClaudeService::new(api_key);

            if let Some(path) = project_path {
                // Start local CLI session
                let result = service
                    .start_local_session(&prompt, &path)
                    .map_err(|e| e.to_string())?;
                serde_json::to_value(result).map_err(|e| e.to_string())
            } else {
                // Start cloud API conversation
                let result = service
                    .start_cloud_conversation(&prompt, None)
                    .await
                    .map_err(|e| e.to_string())?;
                serde_json::to_value(result).map_err(|e| e.to_string())
            }
        }
        "cursor" => {
            let api_key = config.get_secret(crate::services::config_store::SecretKey::CursorApiKey);
            let service = cursor::CursorService::new(api_key);
            let request = cursor::CreateAgentRequest {
                prompt,
                repository,
                ref_name: branch,
                auto_create_pr,
                branch_name: None,
                model: None,
            };
            let result = service
                .create_agent(request)
                .await
                .map_err(|e| e.to_string())?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "codex" => {
            let api_key = config.get_secret(crate::services::config_store::SecretKey::CodexApiKey);
            let service = codex::CodexService::new(api_key);
            let thread_id = service
                .create_thread(&prompt)
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "thread_id": thread_id, "success": true }))
        }
        "jules" => {
            let api_key = config.get_secret(crate::services::config_store::SecretKey::JulesApiKey);
            let service = jules::JulesService::new(api_key);
            let request = jules::CreateSessionRequest {
                prompt,
                repository,
                branch,
                auto_create_pr,
                require_plan_approval: None,
            };
            let result = service
                .create_session(request)
                .await
                .map_err(|e| e.to_string())?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown provider: {}", provider)),
    }
}

/// Stop a running agent
#[tauri::command]
pub async fn stop_agent(
    state: State<'_, AppState>,
    provider: String,
    raw_id: String,
) -> Result<(), String> {
    let config = state.config.read().await;

    match provider.as_str() {
        "cursor" => {
            let api_key = config.get_secret(crate::services::config_store::SecretKey::CursorApiKey);
            let service = cursor::CursorService::new(api_key);
            service.stop_agent(&raw_id).await.map_err(|e| e.to_string())
        }
        "jules" => {
            let api_key = config.get_secret(crate::services::config_store::SecretKey::JulesApiKey);
            let service = jules::JulesService::new(api_key);
            service.stop_session(&raw_id).await.map_err(|e| e.to_string())
        }
        _ => Err(format!("Stop not supported for provider: {}", provider)),
    }
}
