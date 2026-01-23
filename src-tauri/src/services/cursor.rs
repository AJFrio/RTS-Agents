use crate::models::{Agent, AgentDetails, AgentProvider, AgentStatus, ConversationMessage, FileChange};
use crate::utils::http::{AuthType, HttpClient};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

const CURSOR_API_BASE: &str = "https://api.cursor.com/v1";

/// Cursor Cloud Service - manages Cursor AI agents via API
pub struct CursorService {
    client: HttpClient,
    api_key: Option<String>,
}

impl CursorService {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            client: HttpClient::new(),
            api_key,
        }
    }

    fn auth(&self) -> Option<AuthType> {
        self.api_key.as_ref().map(|k| AuthType::Basic {
            username: k.clone(),
            password: String::new(),
        })
    }

    /// Get all Cursor agents from the API
    pub async fn get_all_agents(&self) -> Result<Vec<Agent>> {
        let url = format!("{}/agents?limit=100", CURSOR_API_BASE);

        let response: CursorAgentsResponse = self
            .client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to fetch Cursor agents")?;

        let agents = response
            .agents
            .into_iter()
            .map(|a| self.convert_agent(a))
            .collect();

        Ok(agents)
    }

    fn convert_agent(&self, agent: CursorAgent) -> Agent {
        let status = match agent.status.as_str() {
            "pending" => AgentStatus::Waiting,
            "running" => AgentStatus::Running,
            "completed" => AgentStatus::Completed,
            "stopped" | "failed" => AgentStatus::Error,
            _ => AgentStatus::Unknown,
        };

        let pr_url = agent.pr_url.or_else(|| {
            // Construct PR URL from repository and PR number if available
            agent.pr_number.and_then(|num| {
                agent.repository.as_ref().map(|repo| {
                    format!("https://github.com/{}/pull/{}", repo, num)
                })
            })
        });

        Agent {
            id: format!("cursor-{}", agent.id),
            name: truncate_string(&agent.prompt.clone().unwrap_or_else(|| "Unnamed".to_string()), 50),
            provider: AgentProvider::Cursor,
            status,
            project_path: agent.repository.clone(),
            project_name: agent.repository.as_ref().and_then(|r| r.split('/').last().map(|s| s.to_string())),
            branch: agent.branch.or(agent.ref_name),
            pr_number: agent.pr_number,
            pr_url,
            last_updated: agent.updated_at,
            created_at: agent.created_at,
            file_path: None,
            raw_id: Some(agent.id),
            worktree_path: None,
            task_description: agent.prompt,
        }
    }

    /// Get detailed information about a specific agent
    pub async fn get_agent_details(&self, agent_id: &str) -> Result<AgentDetails> {
        let url = format!("{}/agents/{}", CURSOR_API_BASE, agent_id);

        let agent: CursorAgentDetail = self
            .client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to fetch Cursor agent details")?;

        let converted = self.convert_agent(CursorAgent {
            id: agent.id.clone(),
            prompt: agent.prompt.clone(),
            status: agent.status.clone(),
            repository: agent.repository.clone(),
            branch: agent.branch.clone(),
            ref_name: agent.ref_name.clone(),
            pr_number: agent.pr_number,
            pr_url: agent.pr_url.clone(),
            created_at: agent.created_at.clone(),
            updated_at: agent.updated_at.clone(),
        });

        // Convert activities to conversation messages
        let conversation: Option<Vec<ConversationMessage>> = agent.activities.map(|activities| {
            activities
                .into_iter()
                .map(|a| ConversationMessage {
                    role: a.activity_type,
                    content: a.message.unwrap_or_default(),
                    timestamp: a.timestamp,
                })
                .collect()
        });

        // Convert file changes
        let files_changed: Option<Vec<FileChange>> = agent.files_changed.map(|files| {
            files
                .into_iter()
                .map(|f| FileChange {
                    path: f.path,
                    change_type: f.status,
                    additions: f.additions,
                    deletions: f.deletions,
                })
                .collect()
        });

        Ok(AgentDetails {
            agent: converted,
            conversation,
            files_changed,
            metrics: None,
        })
    }

    /// Create a new Cursor agent
    pub async fn create_agent(&self, request: CreateAgentRequest) -> Result<Agent> {
        let url = format!("{}/agents", CURSOR_API_BASE);

        let payload = CreateAgentPayload {
            prompt: request.prompt,
            repository: request.repository,
            ref_name: request.ref_name,
            auto_create_pr: request.auto_create_pr,
            branch_name: request.branch_name,
            model: request.model,
        };

        let agent: CursorAgent = self
            .client
            .post(&url, &payload, self.auth().as_ref())
            .await
            .context("Failed to create Cursor agent")?;

        Ok(self.convert_agent(agent))
    }

    /// Stop a running agent
    pub async fn stop_agent(&self, agent_id: &str) -> Result<()> {
        let url = format!("{}/agents/{}/stop", CURSOR_API_BASE, agent_id);

        self.client
            .post::<serde_json::Value, _>(&url, &serde_json::json!({}), self.auth().as_ref())
            .await
            .context("Failed to stop Cursor agent")?;

        Ok(())
    }

    /// Get user's repositories from Cursor
    pub async fn get_repositories(&self) -> Result<Vec<CursorRepository>> {
        let url = format!("{}/repositories", CURSOR_API_BASE);

        let response: RepositoriesResponse = self
            .client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to fetch repositories")?;

        Ok(response.repositories)
    }
}

impl Default for CursorService {
    fn default() -> Self {
        Self::new(None)
    }
}

#[derive(Debug, Clone, Deserialize)]
struct CursorAgentsResponse {
    agents: Vec<CursorAgent>,
}

#[derive(Debug, Clone, Deserialize)]
struct CursorAgent {
    id: String,
    prompt: Option<String>,
    status: String,
    repository: Option<String>,
    branch: Option<String>,
    #[serde(rename = "ref")]
    ref_name: Option<String>,
    #[serde(rename = "prNumber")]
    pr_number: Option<u32>,
    #[serde(rename = "prUrl")]
    pr_url: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct CursorAgentDetail {
    id: String,
    prompt: Option<String>,
    status: String,
    repository: Option<String>,
    branch: Option<String>,
    #[serde(rename = "ref")]
    ref_name: Option<String>,
    #[serde(rename = "prNumber")]
    pr_number: Option<u32>,
    #[serde(rename = "prUrl")]
    pr_url: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
    activities: Option<Vec<CursorActivity>>,
    #[serde(rename = "filesChanged")]
    files_changed: Option<Vec<CursorFileChange>>,
}

#[derive(Debug, Clone, Deserialize)]
struct CursorActivity {
    #[serde(rename = "type")]
    activity_type: String,
    message: Option<String>,
    timestamp: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct CursorFileChange {
    path: String,
    status: String,
    additions: Option<u32>,
    deletions: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
struct CreateAgentPayload {
    prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    repository: Option<String>,
    #[serde(rename = "ref", skip_serializing_if = "Option::is_none")]
    ref_name: Option<String>,
    #[serde(rename = "autoCreatePr", skip_serializing_if = "Option::is_none")]
    auto_create_pr: Option<bool>,
    #[serde(rename = "branchName", skip_serializing_if = "Option::is_none")]
    branch_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CreateAgentRequest {
    pub prompt: String,
    pub repository: Option<String>,
    pub ref_name: Option<String>,
    pub auto_create_pr: Option<bool>,
    pub branch_name: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorRepository {
    pub id: String,
    pub name: String,
    pub full_name: String,
    #[serde(rename = "htmlUrl")]
    pub html_url: String,
    #[serde(default)]
    pub private: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct RepositoriesResponse {
    repositories: Vec<CursorRepository>,
}

fn truncate_string(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len - 3])
    }
}
