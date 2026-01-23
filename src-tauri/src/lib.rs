mod commands;
mod models;
mod services;
mod state;
mod utils;

use state::AppState;
use std::time::Duration;
use tauri::{async_runtime, Emitter, Manager};

/// Start background polling task for agent refresh
async fn start_polling_task(app: tauri::AppHandle, mut shutdown: tokio::sync::broadcast::Receiver<()>) {
    let mut interval = tokio::time::interval(Duration::from_secs(30));

    loop {
        tokio::select! {
            _ = interval.tick() => {
                // Emit refresh tick event
                let _ = app.emit("agents:refresh-tick", ());
            }
            _ = shutdown.recv() => {
                log::info!("Polling task shutting down");
                break;
            }
        }
    }
}

/// Start Cloudflare heartbeat task
async fn start_heartbeat_task(app: tauri::AppHandle, mut shutdown: tokio::sync::broadcast::Receiver<()>) {
    let mut interval = tokio::time::interval(Duration::from_secs(300)); // 5 minutes

    loop {
        tokio::select! {
            _ = interval.tick() => {
                // Emit heartbeat event - the frontend or another command will handle actual heartbeat
                let _ = app.emit("cloudflare:heartbeat-tick", ());
            }
            _ = shutdown.recv() => {
                log::info!("Heartbeat task shutting down");
                break;
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize logging in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize app state
            let state = AppState::new().expect("Failed to initialize app state");

            // Start background tasks using Tauri's async runtime
            let app_handle = app.handle().clone();
            let shutdown_rx = state.shutdown_receiver();
            async_runtime::spawn(start_polling_task(app_handle.clone(), shutdown_rx));

            let shutdown_rx2 = state.shutdown_receiver();
            async_runtime::spawn(start_heartbeat_task(app_handle, shutdown_rx2));

            // Manage app state
            app.manage(state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Agent commands
            commands::get_agents,
            commands::get_agent_details,
            commands::start_agent_session,
            commands::stop_agent,
            // Settings commands
            commands::get_settings,
            commands::set_settings,
            commands::get_theme,
            commands::set_theme,
            commands::get_refresh_interval,
            commands::set_refresh_interval,
            commands::has_api_key,
            commands::set_api_key,
            commands::delete_api_key,
            commands::is_provider_enabled,
            commands::set_provider_enabled,
            commands::get_enabled_providers,
            commands::get_projects,
            commands::add_project,
            commands::remove_project,
            commands::get_jira_config,
            commands::set_jira_config,
            commands::get_cloudflare_config,
            commands::set_cloudflare_config,
            commands::migrate_from_electron,
            commands::export_settings,
            commands::import_settings,
            // GitHub commands
            commands::github_get_user,
            commands::github_get_repo,
            commands::github_list_prs,
            commands::github_get_pr,
            commands::github_get_pr_files,
            commands::github_get_pr_reviews,
            commands::github_get_check_runs,
            commands::github_create_pr,
            commands::github_merge_pr,
            commands::github_list_repos,
            commands::github_list_branches,
            // Jira commands
            commands::jira_get_issue,
            commands::jira_search,
            commands::jira_get_my_issues,
            commands::jira_get_project_issues,
            commands::jira_create_issue,
            commands::jira_update_issue,
            commands::jira_transition_issue,
            commands::jira_get_transitions,
            commands::jira_get_project,
            commands::jira_get_projects,
            // Cloudflare commands
            commands::cloudflare_kv_get,
            commands::cloudflare_kv_set,
            commands::cloudflare_kv_delete,
            commands::cloudflare_kv_list,
            commands::cloudflare_send_heartbeat,
            commands::cloudflare_get_heartbeats,
            commands::cloudflare_sync_agents,
            commands::cloudflare_get_all_agents,
            commands::get_machine_id,
            // Project commands
            commands::discover_projects,
            commands::get_project_info,
            commands::project_pull,
            commands::project_fetch,
            commands::project_checkout,
            commands::project_create_branch,
            commands::project_get_branches,
            commands::project_create_worktree,
            commands::project_remove_worktree,
            commands::project_list_worktrees,
            // Task commands
            commands::get_tasks,
            commands::get_task,
            commands::cancel_task,
            commands::clear_completed_tasks,
            // Utility commands
            commands::open_external,
            commands::get_app_version,
            commands::get_app_name,
            commands::get_platform_info,
            commands::is_dev_mode,
            commands::get_app_data_dir,
            commands::get_home_dir,
            commands::pick_directory,
            commands::pick_file,
            commands::save_file_dialog,
            commands::show_message,
            commands::show_confirm,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Signal shutdown to background tasks
                if let Some(state) = window.try_state::<AppState>() {
                    state.shutdown();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
