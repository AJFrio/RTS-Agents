use serde::{Deserialize, Serialize};

/// Represents an AI coding agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub provider: AgentProvider,
    pub status: AgentStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pr_number: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pr_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_updated: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AgentProvider {
    Gemini,
    Claude,
    Cursor,
    Codex,
    Jules,
}

impl std::fmt::Display for AgentProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentProvider::Gemini => write!(f, "gemini"),
            AgentProvider::Claude => write!(f, "claude"),
            AgentProvider::Cursor => write!(f, "cursor"),
            AgentProvider::Codex => write!(f, "codex"),
            AgentProvider::Jules => write!(f, "jules"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Running,
    Idle,
    Completed,
    Error,
    Waiting,
    Unknown,
}

impl Default for AgentStatus {
    fn default() -> Self {
        AgentStatus::Unknown
    }
}

/// Agent details with extended information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDetails {
    #[serde(flatten)]
    pub agent: Agent,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversation: Option<Vec<ConversationMessage>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files_changed: Option<Vec<FileChange>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metrics: Option<AgentMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    pub path: String,
    pub change_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additions: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deletions: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMetrics {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_used: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<u64>,
}

/// Response containing all agents from all providers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentsResponse {
    pub agents: Vec<Agent>,
    pub total: usize,
}

/// Application settings
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppSettings {
    #[serde(default)]
    pub theme: Theme,
    #[serde(default)]
    pub refresh_interval: u32,
    #[serde(default)]
    pub projects: Vec<ProjectConfig>,
    #[serde(default)]
    pub github_enabled: bool,
    #[serde(default)]
    pub jira_enabled: bool,
    #[serde(default)]
    pub cloudflare_enabled: bool,
    #[serde(default)]
    pub gemini_enabled: bool,
    #[serde(default)]
    pub claude_enabled: bool,
    #[serde(default)]
    pub cursor_enabled: bool,
    #[serde(default)]
    pub codex_enabled: bool,
    #[serde(default)]
    pub jules_enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub jira_base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub jira_email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cloudflare_account_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cloudflare_namespace_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub github_repo: Option<String>,
    #[serde(default)]
    pub jira_project: Option<String>,
}

/// GitHub PR information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequest {
    pub number: u32,
    pub title: String,
    pub state: String,
    pub html_url: String,
    pub head: GitRef,
    pub base: GitRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merged_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<GitHubUser>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitRef {
    #[serde(rename = "ref")]
    pub ref_name: String,
    pub sha: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubUser {
    pub login: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

/// GitHub repository information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRepo {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    pub html_url: String,
    #[serde(default)]
    pub private: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_branch: Option<String>,
}

/// Jira issue information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraIssue {
    pub id: String,
    pub key: String,
    pub fields: JiraIssueFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraIssueFields {
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub status: JiraStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<JiraUser>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<JiraPriority>,
    pub issuetype: JiraIssueType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraStatus {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraUser {
    #[serde(rename = "accountId")]
    pub account_id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email_address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraPriority {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraIssueType {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

/// Cloudflare KV entry for heartbeat/state sync
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudflareKVEntry {
    pub key: String,
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiration: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

/// Error response structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl From<String> for ErrorResponse {
    fn from(error: String) -> Self {
        ErrorResponse {
            error,
            code: None,
            details: None,
        }
    }
}
