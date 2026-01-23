use crate::models::{Agent, AgentDetails, AgentProvider, AgentStatus, ConversationMessage};
use crate::utils::process::{get_cli_command, spawn_detached};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use walkdir::WalkDir;

/// Gemini CLI Service - discovers and manages Gemini CLI sessions
pub struct GeminiService {
    gemini_dir: PathBuf,
    additional_paths: Vec<PathBuf>,
}

impl GeminiService {
    pub fn new() -> Self {
        let home = dirs::home_dir().unwrap_or_default();
        Self {
            gemini_dir: home.join(".gemini").join("tmp"),
            additional_paths: Vec::new(),
        }
    }

    pub fn with_additional_paths(mut self, paths: Vec<PathBuf>) -> Self {
        self.additional_paths = paths;
        self
    }

    /// Get all Gemini agents by scanning the file system
    pub fn get_all_agents(&self) -> Result<Vec<Agent>> {
        let mut agents = Vec::new();
        let mut seen_paths = std::collections::HashSet::new();

        // Scan main Gemini directory
        if self.gemini_dir.exists() {
            for project in self.scan_directory(&self.gemini_dir)? {
                if seen_paths.insert(project.path.clone()) {
                    agents.extend(self.get_agents_from_project(&project)?);
                }
            }
        }

        // Scan additional paths
        for path in &self.additional_paths {
            if path.exists() {
                for project in self.scan_directory(path)? {
                    if seen_paths.insert(project.path.clone()) {
                        agents.extend(self.get_agents_from_project(&project)?);
                    }
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

    /// Scan a directory for Gemini projects
    fn scan_directory(&self, dir: &PathBuf) -> Result<Vec<GeminiProject>> {
        let mut projects = Vec::new();

        if !dir.exists() {
            return Ok(projects);
        }

        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_dir() {
                let chats_dir = path.join("chats");
                if chats_dir.exists() && chats_dir.is_dir() {
                    let project_hash = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string();

                    projects.push(GeminiProject {
                        path: path.clone(),
                        project_hash,
                        chats_dir,
                    });
                }
            }
        }

        Ok(projects)
    }

    /// Get agents from a specific project
    fn get_agents_from_project(&self, project: &GeminiProject) -> Result<Vec<Agent>> {
        let mut agents = Vec::new();

        for entry in fs::read_dir(&project.chats_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(agent) = self.parse_session_file(&path, &project.project_hash) {
                    agents.push(agent);
                }
            }
        }

        Ok(agents)
    }

    /// Parse a Gemini session JSON file
    fn parse_session_file(&self, path: &PathBuf, project_hash: &str) -> Result<Agent> {
        let content = fs::read_to_string(path)?;
        let session: GeminiSession = serde_json::from_str(&content)
            .context("Failed to parse Gemini session file")?;

        let filename = path
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");

        let id = format!("gemini-{}-{}", project_hash, filename);

        // Extract name from session name or first user message
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

        // Determine status based on messages
        let status = self.determine_status(&session.messages);

        // Get first user message as prompt
        let prompt = session
            .messages
            .iter()
            .find(|m| m.is_user())
            .map(|m| m.get_content())
            .unwrap_or_default();

        // Get timestamps
        let created_at = session.messages.first().and_then(|m| m.timestamp.clone());
        let updated_at = session.messages.last().and_then(|m| m.timestamp.clone());

        Ok(Agent {
            id,
            name,
            provider: AgentProvider::Gemini,
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

    /// Determine the status of a session based on messages
    fn determine_status(&self, messages: &[GeminiMessage]) -> AgentStatus {
        if messages.is_empty() {
            return AgentStatus::Unknown;
        }

        // Check last message
        if let Some(last) = messages.last() {
            if last.is_error() {
                return AgentStatus::Error;
            }
            if last.is_gemini() {
                return AgentStatus::Completed;
            }
        }

        // If last message is from user, session might be running or waiting
        AgentStatus::Idle
    }

    /// Get detailed information about a specific agent
    pub fn get_agent_details(&self, raw_id: &str, file_path: &str) -> Result<AgentDetails> {
        let path = PathBuf::from(file_path);
        let content = fs::read_to_string(&path)?;
        let session: GeminiSession = serde_json::from_str(&content)?;

        // Extract project hash from file path
        let project_hash = path
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");

        let agent = self.parse_session_file(&path, project_hash)?;

        // Convert messages to conversation format
        let conversation: Vec<ConversationMessage> = session
            .messages
            .iter()
            .filter(|m| m.is_user() || m.is_gemini())
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
    }

    /// Start a new Gemini session
    pub fn start_session(&self, prompt: &str, project_path: &str) -> Result<StartSessionResult> {
        let program = get_cli_command("gemini");

        // Escape the prompt for shell
        let escaped_prompt = prompt.replace("\"", "\\\"");

        let pid = spawn_detached(
            &program,
            &["-p", &format!("\"{}\"", escaped_prompt), "-y"],
            project_path,
        )?;

        Ok(StartSessionResult {
            success: true,
            message: format!("Gemini session started with PID {}", pid),
            pid: Some(pid),
        })
    }
}

impl Default for GeminiService {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
struct GeminiProject {
    path: PathBuf,
    project_hash: String,
    chats_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GeminiSession {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    messages: Vec<GeminiMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GeminiMessage {
    #[serde(rename = "type")]
    msg_type: Option<String>,
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    timestamp: Option<String>,
}

impl GeminiMessage {
    fn is_user(&self) -> bool {
        self.msg_type.as_deref() == Some("user")
            || self.role.as_deref() == Some("user")
    }

    fn is_gemini(&self) -> bool {
        self.msg_type.as_deref() == Some("gemini")
            || self.msg_type.as_deref() == Some("assistant")
            || self.role.as_deref() == Some("assistant")
            || self.role.as_deref() == Some("gemini")
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

#[derive(Debug, Clone, Serialize)]
pub struct StartSessionResult {
    pub success: bool,
    pub message: String,
    pub pid: Option<u32>,
}

fn truncate_string(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len - 3])
    }
}
