use crate::models::{Agent, AgentDetails, AgentProvider, AgentStatus, ConversationMessage};
use crate::utils::http::{AuthType, HttpClient};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::RwLock;

const OPENAI_API_BASE: &str = "https://api.openai.com/v1";

/// OpenAI Codex Service - manages Codex/Assistants threads via API
pub struct CodexService {
    client: HttpClient,
    api_key: Option<String>,
    /// Track thread IDs in memory
    tracked_threads: RwLock<HashSet<String>>,
}

impl CodexService {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            client: HttpClient::new(),
            api_key,
            tracked_threads: RwLock::new(HashSet::new()),
        }
    }

    fn auth(&self) -> Option<AuthType> {
        self.api_key.as_ref().map(|k| AuthType::Bearer(k.clone()))
    }

    /// Get all tracked Codex agents
    pub async fn get_all_agents(&self) -> Result<Vec<Agent>> {
        let thread_ids: Vec<String> = {
            let threads = self.tracked_threads.read().unwrap();
            threads.iter().cloned().collect()
        };

        let mut agents = Vec::new();

        for thread_id in thread_ids {
            match self.get_thread_agent(&thread_id).await {
                Ok(agent) => agents.push(agent),
                Err(_) => {
                    // Remove invalid thread from tracking
                    let mut threads = self.tracked_threads.write().unwrap();
                    threads.remove(&thread_id);
                }
            }
        }

        // Sort by updated time (newest first)
        agents.sort_by(|a, b| {
            b.last_updated
                .as_ref()
                .unwrap_or(&String::new())
                .cmp(a.last_updated.as_ref().unwrap_or(&String::new()))
        });

        Ok(agents)
    }

    /// Get agent info for a specific thread
    async fn get_thread_agent(&self, thread_id: &str) -> Result<Agent> {
        // Fetch thread and latest run in parallel conceptually
        let thread = self.get_thread(thread_id).await?;
        let runs = self.list_runs(thread_id).await?;

        let latest_run = runs.first();

        let status = latest_run
            .map(|r| self.convert_run_status(&r.status))
            .unwrap_or(AgentStatus::Unknown);

        // Get first message as prompt
        let messages = self.list_messages(thread_id, Some(1)).await?;
        let prompt = messages.first().map(|m| m.get_content()).unwrap_or_default();

        let name = truncate_string(&prompt, 50);

        let created_at = timestamp_to_rfc3339(thread.created_at);
        let updated_at = latest_run
            .and_then(|r| r.completed_at)
            .or(latest_run.map(|r| r.created_at))
            .map(timestamp_to_rfc3339);

        Ok(Agent {
            id: format!("codex-{}", thread_id),
            name,
            provider: AgentProvider::Codex,
            status,
            project_path: None,
            project_name: None,
            branch: None,
            pr_number: None,
            pr_url: None,
            last_updated: updated_at,
            created_at: Some(created_at),
            file_path: None,
            raw_id: Some(thread_id.to_string()),
            worktree_path: None,
            task_description: Some(prompt),
        })
    }

    fn convert_run_status(&self, status: &str) -> AgentStatus {
        match status {
            "queued" | "in_progress" => AgentStatus::Running,
            "completed" => AgentStatus::Completed,
            "failed" | "cancelled" | "expired" => AgentStatus::Error,
            "requires_action" => AgentStatus::Waiting,
            _ => AgentStatus::Unknown,
        }
    }

    /// Get detailed information about a thread
    pub async fn get_agent_details(&self, thread_id: &str) -> Result<AgentDetails> {
        let agent = self.get_thread_agent(thread_id).await?;

        // Get all messages
        let messages = self.list_messages(thread_id, None).await?;

        let conversation: Vec<ConversationMessage> = messages
            .into_iter()
            .map(|m| ConversationMessage {
                role: m.role.clone(),
                content: m.get_content(),
                timestamp: Some(timestamp_to_rfc3339(m.created_at)),
            })
            .collect();

        Ok(AgentDetails {
            agent,
            conversation: Some(conversation),
            files_changed: None,
            metrics: None,
        })
    }

    /// Create a new thread with an initial message
    pub async fn create_thread(&self, prompt: &str) -> Result<String> {
        let url = format!("{}/threads", OPENAI_API_BASE);

        let payload = CreateThreadRequest {
            messages: vec![ThreadMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
        };

        let response: ThreadResponse = self
            .client
            .post(&url, &payload, self.auth().as_ref())
            .await
            .context("Failed to create thread")?;

        // Track the new thread
        {
            let mut threads = self.tracked_threads.write().unwrap();
            if threads.len() >= 100 {
                // Remove arbitrary thread to make room
                if let Some(old) = threads.iter().next().cloned() {
                    threads.remove(&old);
                }
            }
            threads.insert(response.id.clone());
        }

        Ok(response.id)
    }

    /// Get thread info
    async fn get_thread(&self, thread_id: &str) -> Result<ThreadResponse> {
        let url = format!("{}/threads/{}", OPENAI_API_BASE, thread_id);

        self.client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to get thread")
    }

    /// List messages in a thread
    async fn list_messages(&self, thread_id: &str, limit: Option<u32>) -> Result<Vec<MessageResponse>> {
        let limit = limit.unwrap_or(100);
        let url = format!(
            "{}/threads/{}/messages?limit={}&order=asc",
            OPENAI_API_BASE, thread_id, limit
        );

        let response: ListResponse<MessageResponse> = self
            .client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to list messages")?;

        Ok(response.data)
    }

    /// List runs for a thread
    async fn list_runs(&self, thread_id: &str) -> Result<Vec<RunResponse>> {
        let url = format!(
            "{}/threads/{}/runs?limit=10&order=desc",
            OPENAI_API_BASE, thread_id
        );

        let response: ListResponse<RunResponse> = self
            .client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to list runs")?;

        Ok(response.data)
    }

    /// Add a message to a thread
    pub async fn add_message(&self, thread_id: &str, content: &str) -> Result<MessageResponse> {
        let url = format!("{}/threads/{}/messages", OPENAI_API_BASE, thread_id);

        let payload = ThreadMessage {
            role: "user".to_string(),
            content: content.to_string(),
        };

        self.client
            .post(&url, &payload, self.auth().as_ref())
            .await
            .context("Failed to add message")
    }

    /// Start a run on a thread with an assistant
    pub async fn create_run(&self, thread_id: &str, assistant_id: &str) -> Result<RunResponse> {
        let url = format!("{}/threads/{}/runs", OPENAI_API_BASE, thread_id);

        let payload = CreateRunRequest {
            assistant_id: assistant_id.to_string(),
        };

        self.client
            .post(&url, &payload, self.auth().as_ref())
            .await
            .context("Failed to create run")
    }

    /// Track an existing thread
    pub fn track_thread(&self, thread_id: &str) {
        let mut threads = self.tracked_threads.write().unwrap();
        if threads.len() >= 100 {
            if let Some(old) = threads.iter().next().cloned() {
                threads.remove(&old);
            }
        }
        threads.insert(thread_id.to_string());
    }

    /// Untrack a thread
    pub fn untrack_thread(&self, thread_id: &str) {
        let mut threads = self.tracked_threads.write().unwrap();
        threads.remove(thread_id);
    }
}

impl Default for CodexService {
    fn default() -> Self {
        Self::new(None)
    }
}

#[derive(Debug, Deserialize)]
struct ThreadResponse {
    id: String,
    created_at: i64,
}

#[derive(Debug, Deserialize)]
struct MessageResponse {
    id: String,
    role: String,
    content: Vec<ContentBlock>,
    created_at: i64,
}

impl MessageResponse {
    fn get_content(&self) -> String {
        self.content
            .iter()
            .filter_map(|c| {
                if c.content_type == "text" {
                    c.text.as_ref().map(|t| t.value.clone())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

#[derive(Debug, Deserialize)]
struct ContentBlock {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<TextContent>,
}

#[derive(Debug, Deserialize)]
struct TextContent {
    value: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RunResponse {
    pub id: String,
    pub status: String,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct ListResponse<T> {
    data: Vec<T>,
}

#[derive(Debug, Serialize)]
struct CreateThreadRequest {
    messages: Vec<ThreadMessage>,
}

#[derive(Debug, Serialize)]
struct ThreadMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct CreateRunRequest {
    assistant_id: String,
}

fn timestamp_to_rfc3339(ts: i64) -> String {
    chrono::DateTime::from_timestamp(ts, 0)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default()
}

fn truncate_string(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len - 3])
    }
}
