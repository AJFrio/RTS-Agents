use crate::models::{AppSettings, ProjectConfig, Theme};
use anyhow::{Context, Result};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;

const SERVICE_NAME: &str = "rts-agents";

/// Keys stored in the OS keychain
#[derive(Debug, Clone, Copy)]
pub enum SecretKey {
    GithubToken,
    JiraApiToken,
    CloudflareApiToken,
    GeminiApiKey,
    ClaudeApiKey,
    CursorApiKey,
    CodexApiKey,
    JulesApiKey,
}

impl SecretKey {
    fn as_str(&self) -> &'static str {
        match self {
            SecretKey::GithubToken => "github_token",
            SecretKey::JiraApiToken => "jira_api_token",
            SecretKey::CloudflareApiToken => "cloudflare_api_token",
            SecretKey::GeminiApiKey => "gemini_api_key",
            SecretKey::ClaudeApiKey => "claude_api_key",
            SecretKey::CursorApiKey => "cursor_api_key",
            SecretKey::CodexApiKey => "codex_api_key",
            SecretKey::JulesApiKey => "jules_api_key",
        }
    }

    pub fn from_provider(provider: &str) -> Option<SecretKey> {
        match provider.to_lowercase().as_str() {
            "github" => Some(SecretKey::GithubToken),
            "jira" => Some(SecretKey::JiraApiToken),
            "cloudflare" => Some(SecretKey::CloudflareApiToken),
            "gemini" => Some(SecretKey::GeminiApiKey),
            "claude" => Some(SecretKey::ClaudeApiKey),
            "cursor" => Some(SecretKey::CursorApiKey),
            "codex" => Some(SecretKey::CodexApiKey),
            "jules" => Some(SecretKey::JulesApiKey),
            _ => None,
        }
    }
}

/// Configuration store that manages settings (JSON file) and secrets (OS keychain)
pub struct ConfigStore {
    settings_path: PathBuf,
    settings: RwLock<AppSettings>,
}

impl ConfigStore {
    pub fn new() -> Result<Self> {
        let config_dir = dirs::config_dir()
            .context("Failed to get config directory")?
            .join("rts-agents");

        fs::create_dir_all(&config_dir)?;

        let settings_path = config_dir.join("settings.json");
        let settings = if settings_path.exists() {
            let content = fs::read_to_string(&settings_path)?;
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            AppSettings::default()
        };

        Ok(Self {
            settings_path,
            settings: RwLock::new(settings),
        })
    }

    /// Get a secret from the OS keychain
    pub fn get_secret(&self, key: SecretKey) -> Option<String> {
        Entry::new(SERVICE_NAME, key.as_str())
            .ok()
            .and_then(|entry| entry.get_password().ok())
    }

    /// Set a secret in the OS keychain
    pub fn set_secret(&self, key: SecretKey, value: &str) -> Result<()> {
        let entry = Entry::new(SERVICE_NAME, key.as_str())?;
        entry.set_password(value)?;
        Ok(())
    }

    /// Delete a secret from the OS keychain
    pub fn delete_secret(&self, key: SecretKey) -> Result<()> {
        let entry = Entry::new(SERVICE_NAME, key.as_str())?;
        entry.delete_credential().ok(); // Ignore errors if not found
        Ok(())
    }

    /// Check if a secret exists
    pub fn has_secret(&self, key: SecretKey) -> bool {
        self.get_secret(key).is_some()
    }

    /// Get all settings
    pub fn get_settings(&self) -> AppSettings {
        self.settings.read().unwrap().clone()
    }

    /// Update settings
    pub fn set_settings(&self, settings: AppSettings) -> Result<()> {
        let content = serde_json::to_string_pretty(&settings)?;
        fs::write(&self.settings_path, content)?;
        *self.settings.write().unwrap() = settings;
        Ok(())
    }

    /// Update a single setting
    pub fn update_setting<F>(&self, updater: F) -> Result<()>
    where
        F: FnOnce(&mut AppSettings),
    {
        let mut settings = self.settings.write().unwrap();
        updater(&mut settings);
        let content = serde_json::to_string_pretty(&*settings)?;
        fs::write(&self.settings_path, content)?;
        Ok(())
    }

    // Convenience methods for specific settings

    pub fn get_theme(&self) -> Theme {
        self.settings.read().unwrap().theme.clone()
    }

    pub fn set_theme(&self, theme: Theme) -> Result<()> {
        self.update_setting(|s| s.theme = theme)
    }

    pub fn get_refresh_interval(&self) -> u32 {
        self.settings.read().unwrap().refresh_interval
    }

    pub fn set_refresh_interval(&self, interval: u32) -> Result<()> {
        self.update_setting(|s| s.refresh_interval = interval)
    }

    pub fn get_projects(&self) -> Vec<ProjectConfig> {
        self.settings.read().unwrap().projects.clone()
    }

    pub fn add_project(&self, project: ProjectConfig) -> Result<()> {
        self.update_setting(|s| {
            // Remove existing project with same path
            s.projects.retain(|p| p.path != project.path);
            s.projects.push(project);
        })
    }

    pub fn remove_project(&self, project_id: &str) -> Result<()> {
        self.update_setting(|s| {
            s.projects.retain(|p| p.id != project_id);
        })
    }

    pub fn is_provider_enabled(&self, provider: &str) -> bool {
        let settings = self.settings.read().unwrap();
        match provider.to_lowercase().as_str() {
            "github" => settings.github_enabled,
            "jira" => settings.jira_enabled,
            "cloudflare" => settings.cloudflare_enabled,
            "gemini" => settings.gemini_enabled,
            "claude" => settings.claude_enabled,
            "cursor" => settings.cursor_enabled,
            "codex" => settings.codex_enabled,
            "jules" => settings.jules_enabled,
            _ => false,
        }
    }

    pub fn set_provider_enabled(&self, provider: &str, enabled: bool) -> Result<()> {
        self.update_setting(|s| {
            match provider.to_lowercase().as_str() {
                "github" => s.github_enabled = enabled,
                "jira" => s.jira_enabled = enabled,
                "cloudflare" => s.cloudflare_enabled = enabled,
                "gemini" => s.gemini_enabled = enabled,
                "claude" => s.claude_enabled = enabled,
                "cursor" => s.cursor_enabled = enabled,
                "codex" => s.codex_enabled = enabled,
                "jules" => s.jules_enabled = enabled,
                _ => {}
            }
        })
    }

    /// Get Jira configuration
    pub fn get_jira_config(&self) -> (Option<String>, Option<String>) {
        let settings = self.settings.read().unwrap();
        (settings.jira_base_url.clone(), settings.jira_email.clone())
    }

    pub fn set_jira_config(&self, base_url: Option<String>, email: Option<String>) -> Result<()> {
        self.update_setting(|s| {
            s.jira_base_url = base_url;
            s.jira_email = email;
        })
    }

    /// Get Cloudflare configuration
    pub fn get_cloudflare_config(&self) -> (Option<String>, Option<String>) {
        let settings = self.settings.read().unwrap();
        (
            settings.cloudflare_account_id.clone(),
            settings.cloudflare_namespace_id.clone(),
        )
    }

    pub fn set_cloudflare_config(
        &self,
        account_id: Option<String>,
        namespace_id: Option<String>,
    ) -> Result<()> {
        self.update_setting(|s| {
            s.cloudflare_account_id = account_id;
            s.cloudflare_namespace_id = namespace_id;
        })
    }

    /// Migrate data from Electron store (one-time migration)
    pub fn migrate_from_electron(&self, electron_store_path: &str) -> Result<MigrationResult> {
        #[derive(Deserialize)]
        struct ElectronStore {
            github_token: Option<String>,
            jira_api_token: Option<String>,
            cloudflare_api_token: Option<String>,
            gemini_api_key: Option<String>,
            claude_api_key: Option<String>,
            cursor_api_key: Option<String>,
            codex_api_key: Option<String>,
            jules_api_key: Option<String>,
            theme: Option<String>,
            refresh_interval: Option<u32>,
            projects: Option<Vec<ProjectConfig>>,
            jira_base_url: Option<String>,
            jira_email: Option<String>,
            cloudflare_account_id: Option<String>,
            cloudflare_namespace_id: Option<String>,
            github_enabled: Option<bool>,
            jira_enabled: Option<bool>,
            cloudflare_enabled: Option<bool>,
            gemini_enabled: Option<bool>,
            claude_enabled: Option<bool>,
            cursor_enabled: Option<bool>,
            codex_enabled: Option<bool>,
            jules_enabled: Option<bool>,
        }

        let content = fs::read_to_string(electron_store_path)
            .context("Failed to read Electron store file")?;
        let electron_data: ElectronStore = serde_json::from_str(&content)
            .context("Failed to parse Electron store data")?;

        let mut migrated = MigrationResult::default();

        // Migrate secrets to keychain
        if let Some(token) = electron_data.github_token {
            self.set_secret(SecretKey::GithubToken, &token)?;
            migrated.secrets_migrated += 1;
        }
        if let Some(token) = electron_data.jira_api_token {
            self.set_secret(SecretKey::JiraApiToken, &token)?;
            migrated.secrets_migrated += 1;
        }
        if let Some(token) = electron_data.cloudflare_api_token {
            self.set_secret(SecretKey::CloudflareApiToken, &token)?;
            migrated.secrets_migrated += 1;
        }
        if let Some(key) = electron_data.gemini_api_key {
            self.set_secret(SecretKey::GeminiApiKey, &key)?;
            migrated.secrets_migrated += 1;
        }
        if let Some(key) = electron_data.claude_api_key {
            self.set_secret(SecretKey::ClaudeApiKey, &key)?;
            migrated.secrets_migrated += 1;
        }
        if let Some(key) = electron_data.cursor_api_key {
            self.set_secret(SecretKey::CursorApiKey, &key)?;
            migrated.secrets_migrated += 1;
        }
        if let Some(key) = electron_data.codex_api_key {
            self.set_secret(SecretKey::CodexApiKey, &key)?;
            migrated.secrets_migrated += 1;
        }
        if let Some(key) = electron_data.jules_api_key {
            self.set_secret(SecretKey::JulesApiKey, &key)?;
            migrated.secrets_migrated += 1;
        }

        // Migrate settings
        self.update_setting(|s| {
            if let Some(theme_str) = electron_data.theme {
                s.theme = match theme_str.as_str() {
                    "light" => Theme::Light,
                    "dark" => Theme::Dark,
                    _ => Theme::System,
                };
            }
            if let Some(interval) = electron_data.refresh_interval {
                s.refresh_interval = interval;
            }
            if let Some(projects) = electron_data.projects {
                s.projects = projects;
                migrated.projects_migrated = s.projects.len();
            }
            s.jira_base_url = electron_data.jira_base_url;
            s.jira_email = electron_data.jira_email;
            s.cloudflare_account_id = electron_data.cloudflare_account_id;
            s.cloudflare_namespace_id = electron_data.cloudflare_namespace_id;
            s.github_enabled = electron_data.github_enabled.unwrap_or(false);
            s.jira_enabled = electron_data.jira_enabled.unwrap_or(false);
            s.cloudflare_enabled = electron_data.cloudflare_enabled.unwrap_or(false);
            s.gemini_enabled = electron_data.gemini_enabled.unwrap_or(false);
            s.claude_enabled = electron_data.claude_enabled.unwrap_or(false);
            s.cursor_enabled = electron_data.cursor_enabled.unwrap_or(false);
            s.codex_enabled = electron_data.codex_enabled.unwrap_or(false);
            s.jules_enabled = electron_data.jules_enabled.unwrap_or(false);
        })?;

        migrated.settings_migrated = true;

        Ok(migrated)
    }
}

#[derive(Debug, Default, Serialize)]
pub struct MigrationResult {
    pub secrets_migrated: usize,
    pub projects_migrated: usize,
    pub settings_migrated: bool,
}
