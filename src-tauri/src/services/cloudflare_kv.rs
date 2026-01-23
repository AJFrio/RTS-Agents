use crate::utils::http::{AuthType, HttpClient};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

const CLOUDFLARE_API_BASE: &str = "https://api.cloudflare.com/client/v4";

pub struct CloudflareKVService {
    client: HttpClient,
    account_id: String,
    namespace_id: String,
    api_token: Option<String>,
}

impl CloudflareKVService {
    pub fn new(account_id: String, namespace_id: String, api_token: Option<String>) -> Self {
        Self {
            client: HttpClient::new(),
            account_id,
            namespace_id,
            api_token,
        }
    }

    fn auth(&self) -> Option<AuthType> {
        self.api_token.as_ref().map(|t| AuthType::Bearer(t.clone()))
    }

    fn base_url(&self) -> String {
        format!(
            "{}/accounts/{}/storage/kv/namespaces/{}",
            CLOUDFLARE_API_BASE, self.account_id, self.namespace_id
        )
    }

    /// Get a value from KV
    pub async fn get(&self, key: &str) -> Result<Option<String>> {
        let url = format!("{}/values/{}", self.base_url(), urlencoding::encode(key));
        match self.client.get_text(&url, self.auth().as_ref()).await {
            Ok(value) => Ok(Some(value)),
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("404") || err_str.contains("key not found") {
                    Ok(None)
                } else {
                    Err(e).context("Failed to get KV value")
                }
            }
        }
    }

    /// Set a value in KV
    pub async fn set(&self, key: &str, value: &str, expiration_ttl: Option<u64>) -> Result<()> {
        let mut url = format!("{}/values/{}", self.base_url(), urlencoding::encode(key));
        if let Some(ttl) = expiration_ttl {
            url.push_str(&format!("?expiration_ttl={}", ttl));
        }

        // Cloudflare KV uses PUT with plain text body
        let response = self
            .client
            .put::<CloudflareResponse, _>(&url, &value, self.auth().as_ref())
            .await
            .context("Failed to set KV value")?;

        if !response.success {
            let errors: Vec<String> = response
                .errors
                .into_iter()
                .map(|e| e.message)
                .collect();
            anyhow::bail!("Cloudflare API error: {}", errors.join(", "));
        }

        Ok(())
    }

    /// Delete a value from KV
    pub async fn delete(&self, key: &str) -> Result<()> {
        let url = format!("{}/values/{}", self.base_url(), urlencoding::encode(key));
        self.client
            .delete(&url, self.auth().as_ref())
            .await
            .context("Failed to delete KV value")
    }

    /// List keys in the namespace
    pub async fn list_keys(&self, prefix: Option<&str>, limit: Option<u32>) -> Result<Vec<KVKey>> {
        let mut url = format!("{}/keys", self.base_url());
        let mut params = Vec::new();

        if let Some(p) = prefix {
            params.push(format!("prefix={}", urlencoding::encode(p)));
        }
        if let Some(l) = limit {
            params.push(format!("limit={}", l));
        }

        if !params.is_empty() {
            url.push('?');
            url.push_str(&params.join("&"));
        }

        let response: CloudflareListResponse = self
            .client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to list KV keys")?;

        if !response.success {
            let errors: Vec<String> = response
                .errors
                .into_iter()
                .map(|e| e.message)
                .collect();
            anyhow::bail!("Cloudflare API error: {}", errors.join(", "));
        }

        Ok(response.result)
    }

    /// Send a heartbeat to Cloudflare KV
    pub async fn send_heartbeat(&self, machine_id: &str) -> Result<()> {
        let key = format!("heartbeat:{}", machine_id);
        let value = HeartbeatValue {
            machine_id: machine_id.to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            hostname: hostname::get()
                .ok()
                .and_then(|h| h.into_string().ok())
                .unwrap_or_else(|| "unknown".to_string()),
        };

        let json_value = serde_json::to_string(&value)?;
        // Heartbeat expires after 10 minutes (600 seconds)
        self.set(&key, &json_value, Some(600)).await
    }

    /// Get all active heartbeats
    pub async fn get_active_heartbeats(&self) -> Result<Vec<HeartbeatValue>> {
        let keys = self.list_keys(Some("heartbeat:"), Some(100)).await?;
        let mut heartbeats = Vec::new();

        for key in keys {
            if let Some(value) = self.get(&key.name).await? {
                if let Ok(hb) = serde_json::from_str::<HeartbeatValue>(&value) {
                    heartbeats.push(hb);
                }
            }
        }

        Ok(heartbeats)
    }

    /// Store agent state for sync across machines
    pub async fn sync_agent_state(&self, machine_id: &str, agents: &[AgentState]) -> Result<()> {
        let key = format!("agents:{}", machine_id);
        let value = serde_json::to_string(agents)?;
        // Agent state expires after 5 minutes
        self.set(&key, &value, Some(300)).await
    }

    /// Get agent states from all machines
    pub async fn get_all_agent_states(&self) -> Result<Vec<MachineAgents>> {
        let keys = self.list_keys(Some("agents:"), Some(100)).await?;
        let mut results = Vec::new();

        for key in keys {
            let machine_id = key.name.trim_start_matches("agents:").to_string();
            if let Some(value) = self.get(&key.name).await? {
                if let Ok(agents) = serde_json::from_str::<Vec<AgentState>>(&value) {
                    results.push(MachineAgents { machine_id, agents });
                }
            }
        }

        Ok(results)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KVKey {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiration: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatValue {
    pub machine_id: String,
    pub timestamp: String,
    pub hostname: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentState {
    pub id: String,
    pub provider: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MachineAgents {
    pub machine_id: String,
    pub agents: Vec<AgentState>,
}

// Cloudflare API response structures

#[derive(Debug, Deserialize)]
struct CloudflareResponse {
    success: bool,
    #[serde(default)]
    errors: Vec<CloudflareError>,
}

#[derive(Debug, Deserialize)]
struct CloudflareListResponse {
    success: bool,
    #[serde(default)]
    result: Vec<KVKey>,
    #[serde(default)]
    errors: Vec<CloudflareError>,
}

#[derive(Debug, Deserialize)]
struct CloudflareError {
    #[serde(default)]
    code: u32,
    message: String,
}
