use crate::models::{Agent, AgentDetails, AgentProvider, AgentStatus, ConversationMessage, FileChange};
use crate::utils::http::{AuthType, HttpClient};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

const JULES_API_BASE: &str = "https://jules.google.com/v1";

/// Google Jules Service - manages Jules AI agents via API
pub struct JulesService {
    client: HttpClient,
    api_key: Option<String>,
}

impl JulesService {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            client: HttpClient::new(),
            api_key,
        }
    }

    fn auth(&self) -> Option<AuthType> {
        self.api_key.as_ref().map(|k| AuthType::ApiKey {
            header: "X-Goog-Api-Key".to_string(),
            value: k.clone(),
        })
    }

    /// Get all Jules sessions from the API
    pub async fn get_all_agents(&self) -> Result<Vec<Agent>> {
        let mut agents = Vec::new();
        let mut page_token: Option<String> = None;

        loop {
            let url = match &page_token {
                Some(token) => format!("{}/sessions?pageSize=100&pageToken={}", JULES_API_BASE, token),
                None => format!("{}/sessions?pageSize=100", JULES_API_BASE),
            };

            let response: JulesSessionsResponse = self
                .client
                .get(&url, self.auth().as_ref())
                .await
                .context("Failed to fetch Jules sessions")?;

            for session in response.sessions {
                agents.push(self.convert_session(session));
            }

            match response.next_page_token {
                Some(token) if !token.is_empty() => page_token = Some(token),
                _ => break,
            }
        }

        Ok(agents)
    }

    fn convert_session(&self, session: JulesSession) -> Agent {
        let status = match session.status.as_str() {
            "PENDING" | "QUEUED" => AgentStatus::Waiting,
            "RUNNING" | "IN_PROGRESS" => AgentStatus::Running,
            "COMPLETED" | "SUCCEEDED" => AgentStatus::Completed,
            "STOPPED" | "CANCELLED" => AgentStatus::Idle,
            "FAILED" | "ERROR" => AgentStatus::Error,
            _ => AgentStatus::Unknown,
        };

        // Extract repository from source context
        let repository = session.source_context.as_ref().and_then(|sc| {
            sc.github.as_ref().map(|gh| {
                format!("https://github.com/{}/{}", gh.owner, gh.repo)
            })
        });

        let project_name = session.source_context.as_ref().and_then(|sc| {
            sc.github.as_ref().map(|gh| gh.repo.clone())
        });

        let branch = session.source_context.as_ref().and_then(|sc| {
            sc.github.as_ref().and_then(|gh| gh.branch.clone())
        });

        // Get PR URL from outputs
        let pr_url = session.outputs.as_ref().and_then(|o| o.pull_request.clone());

        // Extract PR number from URL
        let pr_number = pr_url.as_ref().and_then(|url| {
            url.split('/').last().and_then(|n| n.parse().ok())
        });

        let name = truncate_string(&session.prompt.clone().unwrap_or_else(|| "Unnamed".to_string()), 50);

        Agent {
            id: format!("jules-{}", session.id),
            name,
            provider: AgentProvider::Jules,
            status,
            project_path: repository,
            project_name,
            branch,
            pr_number,
            pr_url,
            last_updated: session.updated_at,
            created_at: session.created_at,
            file_path: None,
            raw_id: Some(session.id),
            worktree_path: None,
            task_description: session.prompt,
        }
    }

    /// Get detailed information about a specific session
    pub async fn get_agent_details(&self, session_id: &str) -> Result<AgentDetails> {
        let url = format!("{}/sessions/{}", JULES_API_BASE, session_id);

        let session: JulesSessionDetail = self
            .client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to fetch Jules session details")?;

        let agent = self.convert_session(JulesSession {
            id: session.id.clone(),
            prompt: session.prompt.clone(),
            status: session.status.clone(),
            source_context: session.source_context.clone(),
            outputs: session.outputs.clone(),
            created_at: session.created_at.clone(),
            updated_at: session.updated_at.clone(),
        });

        // Get activities for conversation history
        let activities = self.get_session_activities(session_id).await.ok();

        let conversation: Option<Vec<ConversationMessage>> = activities.map(|acts| {
            acts.into_iter()
                .map(|a| ConversationMessage {
                    role: a.activity_type,
                    content: a.message.unwrap_or_default(),
                    timestamp: a.timestamp,
                })
                .collect()
        });

        // Extract file changes from outputs
        let files_changed: Option<Vec<FileChange>> = session.outputs.and_then(|o| {
            o.files_changed.map(|files| {
                files
                    .into_iter()
                    .map(|f| FileChange {
                        path: f.path,
                        change_type: f.status,
                        additions: f.additions,
                        deletions: f.deletions,
                    })
                    .collect()
            })
        });

        Ok(AgentDetails {
            agent,
            conversation,
            files_changed,
            metrics: None,
        })
    }

    /// Get activities for a session
    async fn get_session_activities(&self, session_id: &str) -> Result<Vec<JulesActivity>> {
        let url = format!("{}/sessions/{}/activities", JULES_API_BASE, session_id);

        let response: JulesActivitiesResponse = self
            .client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to fetch session activities")?;

        Ok(response.activities)
    }

    /// Create a new Jules session
    pub async fn create_session(&self, request: CreateSessionRequest) -> Result<Agent> {
        let url = format!("{}/sessions", JULES_API_BASE);

        let source_context = request.repository.map(|repo| {
            // Parse "owner/repo" format
            let parts: Vec<&str> = repo.split('/').collect();
            let (owner, repo_name) = if parts.len() >= 2 {
                (parts[0].to_string(), parts[1].to_string())
            } else {
                (String::new(), repo)
            };

            JulesSourceContext {
                github: Some(JulesGithubContext {
                    owner,
                    repo: repo_name,
                    branch: request.branch.clone(),
                }),
            }
        });

        let payload = CreateSessionPayload {
            prompt: request.prompt,
            source_context,
            auto_create_pr: request.auto_create_pr,
            require_plan_approval: request.require_plan_approval,
        };

        let session: JulesSession = self
            .client
            .post(&url, &payload, self.auth().as_ref())
            .await
            .context("Failed to create Jules session")?;

        Ok(self.convert_session(session))
    }

    /// Stop a running session
    pub async fn stop_session(&self, session_id: &str) -> Result<()> {
        let url = format!("{}/sessions/{}/stop", JULES_API_BASE, session_id);

        self.client
            .post::<serde_json::Value, _>(&url, &serde_json::json!({}), self.auth().as_ref())
            .await
            .context("Failed to stop Jules session")?;

        Ok(())
    }

    /// Approve a session's plan
    pub async fn approve_plan(&self, session_id: &str) -> Result<()> {
        let url = format!("{}/sessions/{}/approve", JULES_API_BASE, session_id);

        self.client
            .post::<serde_json::Value, _>(&url, &serde_json::json!({}), self.auth().as_ref())
            .await
            .context("Failed to approve Jules session plan")?;

        Ok(())
    }
}

impl Default for JulesService {
    fn default() -> Self {
        Self::new(None)
    }
}

#[derive(Debug, Clone, Deserialize)]
struct JulesSessionsResponse {
    #[serde(default)]
    sessions: Vec<JulesSession>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct JulesSession {
    id: String,
    prompt: Option<String>,
    status: String,
    #[serde(rename = "sourceContext")]
    source_context: Option<JulesSourceContext>,
    outputs: Option<JulesOutputs>,
    #[serde(rename = "createdAt")]
    created_at: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct JulesSessionDetail {
    id: String,
    prompt: Option<String>,
    status: String,
    #[serde(rename = "sourceContext")]
    source_context: Option<JulesSourceContext>,
    outputs: Option<JulesOutputs>,
    #[serde(rename = "createdAt")]
    created_at: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JulesSourceContext {
    github: Option<JulesGithubContext>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JulesGithubContext {
    owner: String,
    repo: String,
    branch: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct JulesOutputs {
    #[serde(rename = "pullRequest")]
    pull_request: Option<String>,
    #[serde(rename = "filesChanged")]
    files_changed: Option<Vec<JulesFileChange>>,
}

#[derive(Debug, Clone, Deserialize)]
struct JulesFileChange {
    path: String,
    status: String,
    additions: Option<u32>,
    deletions: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
struct JulesActivitiesResponse {
    #[serde(default)]
    activities: Vec<JulesActivity>,
}

#[derive(Debug, Clone, Deserialize)]
struct JulesActivity {
    #[serde(rename = "type")]
    activity_type: String,
    message: Option<String>,
    timestamp: Option<String>,
}

#[derive(Debug, Serialize)]
struct CreateSessionPayload {
    prompt: String,
    #[serde(rename = "sourceContext", skip_serializing_if = "Option::is_none")]
    source_context: Option<JulesSourceContext>,
    #[serde(rename = "autoCreatePr", skip_serializing_if = "Option::is_none")]
    auto_create_pr: Option<bool>,
    #[serde(rename = "requirePlanApproval", skip_serializing_if = "Option::is_none")]
    require_plan_approval: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct CreateSessionRequest {
    pub prompt: String,
    pub repository: Option<String>,
    pub branch: Option<String>,
    pub auto_create_pr: Option<bool>,
    pub require_plan_approval: Option<bool>,
}

fn truncate_string(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len - 3])
    }
}
