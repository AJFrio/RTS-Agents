use crate::commands::tasks::TaskStatus;
use crate::services::config_store::ConfigStore;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Application state shared across all commands
pub struct AppState {
    /// Configuration store for settings and secrets
    pub config: Arc<RwLock<ConfigStore>>,
    /// Unique machine identifier for multi-machine sync
    pub machine_id: Arc<RwLock<String>>,
    /// Active background tasks
    pub tasks: Arc<RwLock<HashMap<String, TaskStatus>>>,
    /// Shutdown signal sender
    pub shutdown_tx: Arc<tokio::sync::broadcast::Sender<()>>,
}

impl AppState {
    pub fn new() -> Result<Self, anyhow::Error> {
        let config = ConfigStore::new()?;

        // Generate or retrieve machine ID
        let machine_id = Self::get_or_create_machine_id(&config);

        let (shutdown_tx, _) = tokio::sync::broadcast::channel(1);

        Ok(Self {
            config: Arc::new(RwLock::new(config)),
            machine_id: Arc::new(RwLock::new(machine_id)),
            tasks: Arc::new(RwLock::new(HashMap::new())),
            shutdown_tx: Arc::new(shutdown_tx),
        })
    }

    fn get_or_create_machine_id(config: &ConfigStore) -> String {
        // Try to get existing machine ID from settings
        let settings = config.get_settings();

        // For now, generate based on hostname + random suffix
        // In a real implementation, this would be persisted
        let hostname = hostname::get()
            .ok()
            .and_then(|h| h.into_string().ok())
            .unwrap_or_else(|| "unknown".to_string());

        format!("{}-{}", hostname, &uuid::Uuid::new_v4().to_string()[..8])
    }

    /// Get a shutdown receiver for background tasks
    pub fn shutdown_receiver(&self) -> tokio::sync::broadcast::Receiver<()> {
        self.shutdown_tx.subscribe()
    }

    /// Signal shutdown to all background tasks
    pub fn shutdown(&self) {
        let _ = self.shutdown_tx.send(());
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new().expect("Failed to create app state")
    }
}
