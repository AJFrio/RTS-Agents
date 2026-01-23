use crate::services::cloudflare_kv::{AgentState, CloudflareKVService, HeartbeatValue, KVKey, MachineAgents};
use crate::services::config_store::SecretKey;
use crate::state::AppState;
use tauri::State;

async fn get_cloudflare_service(state: &AppState) -> Result<CloudflareKVService, String> {
    let config = state.config.read().await;
    let (account_id, namespace_id) = config.get_cloudflare_config();

    let account_id = account_id.ok_or("Cloudflare account ID not configured")?;
    let namespace_id = namespace_id.ok_or("Cloudflare namespace ID not configured")?;
    let api_token = config.get_secret(SecretKey::CloudflareApiToken);

    Ok(CloudflareKVService::new(account_id, namespace_id, api_token))
}

/// Get a value from Cloudflare KV
#[tauri::command]
pub async fn cloudflare_kv_get(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<String>, String> {
    let service = get_cloudflare_service(&state).await?;
    service.get(&key).await.map_err(|e| e.to_string())
}

/// Set a value in Cloudflare KV
#[tauri::command]
pub async fn cloudflare_kv_set(
    state: State<'_, AppState>,
    key: String,
    value: String,
    expiration_ttl: Option<u64>,
) -> Result<(), String> {
    let service = get_cloudflare_service(&state).await?;
    service.set(&key, &value, expiration_ttl).await.map_err(|e| e.to_string())
}

/// Delete a value from Cloudflare KV
#[tauri::command]
pub async fn cloudflare_kv_delete(
    state: State<'_, AppState>,
    key: String,
) -> Result<(), String> {
    let service = get_cloudflare_service(&state).await?;
    service.delete(&key).await.map_err(|e| e.to_string())
}

/// List keys in Cloudflare KV
#[tauri::command]
pub async fn cloudflare_kv_list(
    state: State<'_, AppState>,
    prefix: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<KVKey>, String> {
    let service = get_cloudflare_service(&state).await?;
    service
        .list_keys(prefix.as_deref(), limit)
        .await
        .map_err(|e| e.to_string())
}

/// Send a heartbeat to Cloudflare KV
#[tauri::command]
pub async fn cloudflare_send_heartbeat(state: State<'_, AppState>) -> Result<(), String> {
    let service = get_cloudflare_service(&state).await?;
    let machine_id = state.machine_id.read().await.clone();
    service
        .send_heartbeat(&machine_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get all active heartbeats
#[tauri::command]
pub async fn cloudflare_get_heartbeats(
    state: State<'_, AppState>,
) -> Result<Vec<HeartbeatValue>, String> {
    let service = get_cloudflare_service(&state).await?;
    service
        .get_active_heartbeats()
        .await
        .map_err(|e| e.to_string())
}

/// Sync agent state to Cloudflare KV
#[tauri::command]
pub async fn cloudflare_sync_agents(
    state: State<'_, AppState>,
    agents: Vec<AgentState>,
) -> Result<(), String> {
    let service = get_cloudflare_service(&state).await?;
    let machine_id = state.machine_id.read().await.clone();
    service
        .sync_agent_state(&machine_id, &agents)
        .await
        .map_err(|e| e.to_string())
}

/// Get all agent states from all machines
#[tauri::command]
pub async fn cloudflare_get_all_agents(
    state: State<'_, AppState>,
) -> Result<Vec<MachineAgents>, String> {
    let service = get_cloudflare_service(&state).await?;
    service
        .get_all_agent_states()
        .await
        .map_err(|e| e.to_string())
}

/// Get the current machine ID
#[tauri::command]
pub async fn get_machine_id(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.machine_id.read().await.clone())
}
