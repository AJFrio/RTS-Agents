use crate::models::{Agent, AgentDetails, AgentProvider, AgentStatus, ConversationMessage};
use crate::utils::http::{AuthType, HttpClient};
use crate::utils::process::{get_cli_command, spawn_detached};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;

/// Claude Code CLI and API Service
pub struct ClaudeService {
    claude_dir: PathBuf,
    client: HttpClient,
    api_key: Option<String>,
    /// Track cloud conversations in memory
    cloud_conversations: RwLock<HashMap<String, CloudConversation>>,
}

impl ClaudeService {
    pub fn new(api_key: Option<String>) -> Self {
        let home = dirs::home_dir().unwrap_or_default();
        Self {
            claude_dir: home.join(".claude").join("projects"),
            client: HttpClient::new(),
            api_key,
            cloud_conversations: RwLock::new(HashMap::new()),
        }
    }

    fn auth(&self) -> Option<AuthType> {
        self.api_key.as_ref().map(|k| AuthType::Bearer(k.clone()))
    }

    /// Get all Claude agents (both local CLI sessions and cloud API conversations)
    pub fn get_all_agents(&self) -> Result<Vec<Agent>> {
        let mut agents = Vec::new();

        // Get local CLI sessions
        agents.extend(self.get_local_agents()?);

        // Get tracked cloud conversations
        agents.extend(self.get_cloud_agents());

        // Sort by updated time (newest first)
        agents.sort_by(|a, b| {
            b.last_updated
                .as_ref()
                .unwrap_or(&String::new())
                .cmp(a.last_updated.as_ref().unwrap_or(&String::new()))
        });

        Ok(agents)
    }

    /// Get local Claude CLI sessions by scanning the file system
    fn get_local_agents(&self) -> Result<Vec<Agent>> {
        let mut agents = Vec::new();

        if !self.claude_dir.exists() {
            return Ok(agents);
        }

        // Scan project directories
        for entry in fs::read_dir(&self.claude_dir)? {
            let entry = entry?;
            let project_path = entry.path();

            if !project_path.is_dir() {
                continue;
            }

            // Look for sessions or chats directory
            let sessions_dir = project_path.join("sessions");
            let chats_dir = project_path.join("chats");

            let scan_dir = if sessions_dir.exists() {
                Some(sessions_dir)
            } else if chats_dir.exists() {
                Some(chats_dir)
            } else {
                None
            };

            if let Some(dir) = scan_dir {
                let project_hash = project_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown");

                for session_entry in fs::read_dir(&dir)? {
                    let session_entry = session_entry?;
                    let session_path = session_entry.path();

                    if session_path.extension().and_then(|e| e.to_str()) == Some("json") {
                        if let Ok(agent) = self.parse_local_session(&session_path, project_hash) {
                            agents.push(agent);
                        }
                    }
                }
            }
        }

        Ok(agents)
    }

    /// Parse a local Claude session file
    fn parse_local_session(&self, path: &PathBuf, project_hash: &str) -> Result<Agent> {
        let content = fs::read_to_string(path)?;
        let session: ClaudeSession = serde_json::from_str(&content)
            .context("Failed to parse Claude session file")?;

        let filename = path
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");

        let id = format!("claude-local-{}-{}", project_hash, filename);

        // Extract name from session or first user message
        let name = session
            .name
            .clone()
            .or_else(|| {
                session.messages.iter().find_map(|m| {
                    if m.is_user() {
                        Some(truncate_string(&m.get_content(), 50))
                    } else {
                        None
                    }
                })
            })
            .unwrap_or_else(|| "Unnamed Session".to_string());

        let status = self.determine_status(&session.messages);

        let prompt = session
            .messages
            .iter()
            .find(|m| m.is_user())
            .map(|m| m.get_content())
            .unwrap_or_default();

        let created_at = session.messages.first().and_then(|m| m.timestamp.clone());
        let updated_at = session.messages.last().and_then(|m| m.timestamp.clone());

        Ok(Agent {
            id,
            name,
            provider: AgentProvider::Claude,
            status,
            project_path: Some(project_hash.to_string()),
            project_name: None,
            branch: None,
            pr_number: None,
            pr_url: None,
            last_updated: updated_at,
            created_at,
            file_path: Some(path.to_string_lossy().to_string()),
            raw_id: Some(filename.to_string()),
            worktree_path: None,
            task_description: Some(prompt),
        })
    }

    /// Get tracked cloud conversations
    fn get_cloud_agents(&self) -> Vec<Agent> {
        let conversations = self.cloud_conversations.read().unwrap();
        conversations
            .values()
            .map(|c| Agent {
                id: format!("claude-cloud-{}", c.id),
                name: c.name.clone(),
                provider: AgentProvider::Claude,
                status: c.status.clone(),
                project_path: c.project_path.clone(),
                project_name: None,
                branch: None,
                pr_number: None,
                pr_url: None,
                last_updated: Some(c.updated_at.clone()),
                created_at: Some(c.created_at.clone()),
                file_path: None,
                raw_id: Some(c.id.clone()),
                worktree_path: None,
                task_description: c.prompt.clone(),
            })
            .collect()
    }

    fn determine_status(&self, messages: &[ClaudeMessage]) -> AgentStatus {
        if messages.is_empty() {
            return AgentStatus::Unknown;
        }

        if let Some(last) = messages.last() {
            if last.is_error() {
                return AgentStatus::Error;
            }
            if last.is_assistant() {
                return AgentStatus::Completed;
            }
        }

        AgentStatus::Idle
    }

    /// Get detailed information about a specific agent
    pub fn get_agent_details(&self, raw_id: &str, file_path: Option<&str>) -> Result<AgentDetails> {
        if let Some(path) = file_path {
            // Local session
            let path = PathBuf::from(path);
            let content = fs::read_to_string(&path)?;
            let session: ClaudeSession = serde_json::from_str(&content)?;

            let project_hash = path
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("unknown");

            let agent = self.parse_local_session(&path, project_hash)?;

            let conversation: Vec<ConversationMessage> = session
                .messages
                .iter()
                .filter(|m| m.is_user() || m.is_assistant())
                .map(|m| ConversationMessage {
                    role: if m.is_user() {
                        "user".to_string()
                    } else {
                        "assistant".to_string()
                    },
                    content: m.get_content(),
                    timestamp: m.timestamp.clone(),
                })
                .collect();

            Ok(AgentDetails {
                agent,
                conversation: Some(conversation),
                files_changed: None,
                metrics: None,
            })
        } else {
            // Cloud conversation
            let conversations = self.cloud_conversations.read().unwrap();
            let conv = conversations
                .get(raw_id)
                .context("Cloud conversation not found")?;

            let agent = Agent {
                id: format!("claude-cloud-{}", conv.id),
                name: conv.name.clone(),
                provider: AgentProvider::Claude,
                status: conv.status.clone(),
                project_path: conv.project_path.clone(),
                project_name: None,
                branch: None,
                pr_number: None,
                pr_url: None,
                last_updated: Some(conv.updated_at.clone()),
                created_at: Some(conv.created_at.clone()),
                file_path: None,
                raw_id: Some(conv.id.clone()),
                worktree_path: None,
                task_description: conv.prompt.clone(),
            };

            let conversation: Vec<ConversationMessage> = conv
                .messages
                .iter()
                .map(|m| ConversationMessage {
                    role: m.role.clone(),
                    content: m.content.clone(),
                    timestamp: m.timestamp.clone(),
                })
                .collect();

            Ok(AgentDetails {
                agent,
                conversation: Some(conversation),
                files_changed: None,
                metrics: None,
            })
        }
    }

    /// Start a new local Claude CLI session
    pub fn start_local_session(&self, prompt: &str, project_path: &str) -> Result<StartSessionResult> {
        let program = get_cli_command("claude");

        let escaped_prompt = prompt.replace("\"", "\\\"");

        let pid = spawn_detached(
            &program,
            &[
                "-p",
                &format!("\"{}\"", escaped_prompt),
                "--allowedTools",
                "Read,Edit,Bash",
            ],
            project_path,
        )?;

        Ok(StartSessionResult {
            success: true,
            message: format!("Claude session started with PID {}", pid),
            pid: Some(pid),
            conversation_id: None,
        })
    }

    /// Start a new cloud API conversation
    pub async fn start_cloud_conversation(
        &self,
        prompt: &str,
        project_path: Option<&str>,
    ) -> Result<StartSessionResult> {
        let url = "https://api.anthropic.com/v1/messages";

        let request = ClaudeApiRequest {
            model: "claude-sonnet-4-20250514".to_string(),
            max_tokens: 4096,
            messages: vec![ClaudeApiMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
        };

        let response: ClaudeApiResponse = self
            .client
            .post(url, &request, self.auth().as_ref())
            .await
            .context("Failed to create Claude conversation")?;

        let conversation_id = response.id.clone();

        // Track the conversation
        let mut conversations = self.cloud_conversations.write().unwrap();

        // Limit tracked conversations
        if conversations.len() >= 100 {
            // Remove oldest
            if let Some(oldest_key) = conversations
                .iter()
                .min_by_key(|(_, v)| &v.created_at)
                .map(|(k, _)| k.clone())
            {
                conversations.remove(&oldest_key);
            }
        }

        let now = chrono::Utc::now().to_rfc3339();
        conversations.insert(
            conversation_id.clone(),
            CloudConversation {
                id: conversation_id.clone(),
                name: truncate_string(prompt, 50),
                prompt: Some(prompt.to_string()),
                project_path: project_path.map(|s| s.to_string()),
                status: AgentStatus::Completed,
                created_at: now.clone(),
                updated_at: now,
                messages: vec![
                    StoredMessage {
                        role: "user".to_string(),
                        content: prompt.to_string(),
                        timestamp: None,
                    },
                    StoredMessage {
                        role: "assistant".to_string(),
                        content: response
                            .content
                            .first()
                            .map(|c| c.text.clone())
                            .unwrap_or_default(),
                        timestamp: None,
                    },
                ],
            },
        );

        Ok(StartSessionResult {
            success: true,
            message: "Claude cloud conversation created".to_string(),
            pid: None,
            conversation_id: Some(conversation_id),
        })
    }
}

impl Default for ClaudeService {
    fn default() -> Self {
        Self::new(None)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ClaudeSession {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    messages: Vec<ClaudeMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ClaudeMessage {
    #[serde(default)]
    role: Option<String>,
    #[serde(rename = "type")]
    msg_type: Option<String>,
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    timestamp: Option<String>,
}

impl ClaudeMessage {
    fn is_user(&self) -> bool {
        self.role.as_deref() == Some("user") || self.msg_type.as_deref() == Some("user")
    }

    fn is_assistant(&self) -> bool {
        self.role.as_deref() == Some("assistant")
            || self.role.as_deref() == Some("claude")
            || self.msg_type.as_deref() == Some("assistant")
            || self.msg_type.as_deref() == Some("claude")
    }

    fn is_error(&self) -> bool {
        self.msg_type.as_deref() == Some("error")
    }

    fn get_content(&self) -> String {
        self.content
            .clone()
            .or_else(|| self.text.clone())
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone)]
struct CloudConversation {
    id: String,
    name: String,
    prompt: Option<String>,
    project_path: Option<String>,
    status: AgentStatus,
    created_at: String,
    updated_at: String,
    messages: Vec<StoredMessage>,
}

#[derive(Debug, Clone)]
struct StoredMessage {
    role: String,
    content: String,
    timestamp: Option<String>,
}

#[derive(Debug, Serialize)]
struct ClaudeApiRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<ClaudeApiMessage>,
}

#[derive(Debug, Serialize)]
struct ClaudeApiMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ClaudeApiResponse {
    id: String,
    content: Vec<ClaudeContentBlock>,
}

#[derive(Debug, Deserialize)]
struct ClaudeContentBlock {
    text: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct StartSessionResult {
    pub success: bool,
    pub message: String,
    pub pid: Option<u32>,
    pub conversation_id: Option<String>,
}

fn truncate_string(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len - 3])
    }
}
