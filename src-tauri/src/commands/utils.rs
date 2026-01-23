use tauri::AppHandle;

/// Open a URL in the default browser
#[tauri::command]
pub async fn open_external(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

/// Get app version
#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Get app name
#[tauri::command]
pub fn get_app_name(app: AppHandle) -> String {
    app.package_info().name.clone()
}

/// Get platform info
#[tauri::command]
pub fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        family: std::env::consts::FAMILY.to_string(),
    }
}

#[derive(serde::Serialize)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    pub family: String,
}

/// Check if running in development mode
#[tauri::command]
pub fn is_dev_mode() -> bool {
    cfg!(debug_assertions)
}

/// Get the app data directory path
#[tauri::command]
pub fn get_app_data_dir() -> Result<String, String> {
    dirs::config_dir()
        .map(|p| p.join("rts-agents").to_string_lossy().to_string())
        .ok_or_else(|| "Failed to get config directory".to_string())
}

/// Get the home directory path
#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Failed to get home directory".to_string())
}

/// Show a native file picker dialog (directory)
#[tauri::command]
pub async fn pick_directory(_app: AppHandle) -> Result<Option<String>, String> {
    // Use rfd for cross-platform file dialogs
    let result = rfd::FileDialog::new().pick_folder();
    Ok(result.map(|p| p.to_string_lossy().to_string()))
}

/// Show a native file picker dialog (file)
#[tauri::command]
pub async fn pick_file(
    _app: AppHandle,
    filters: Option<Vec<FileFilter>>,
) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new();

    if let Some(filters) = filters {
        for filter in filters {
            let extensions: Vec<&str> = filter.extensions.iter().map(|s| s.as_str()).collect();
            dialog = dialog.add_filter(&filter.name, &extensions);
        }
    }

    let result = dialog.pick_file();
    Ok(result.map(|p| p.to_string_lossy().to_string()))
}

#[derive(serde::Deserialize)]
pub struct FileFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

/// Save file dialog
#[tauri::command]
pub async fn save_file_dialog(
    _app: AppHandle,
    default_name: Option<String>,
    filters: Option<Vec<FileFilter>>,
) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new();

    if let Some(name) = default_name {
        dialog = dialog.set_file_name(&name);
    }

    if let Some(filters) = filters {
        for filter in filters {
            let extensions: Vec<&str> = filter.extensions.iter().map(|s| s.as_str()).collect();
            dialog = dialog.add_filter(&filter.name, &extensions);
        }
    }

    let result = dialog.save_file();
    Ok(result.map(|p| p.to_string_lossy().to_string()))
}

/// Show a message dialog
#[tauri::command]
pub async fn show_message(
    _app: AppHandle,
    title: String,
    message: String,
    kind: Option<String>,
) -> Result<(), String> {
    let level = match kind.as_deref() {
        Some("error") => rfd::MessageLevel::Error,
        Some("warning") => rfd::MessageLevel::Warning,
        _ => rfd::MessageLevel::Info,
    };

    rfd::MessageDialog::new()
        .set_title(&title)
        .set_description(&message)
        .set_level(level)
        .show();

    Ok(())
}

/// Show a confirmation dialog
#[tauri::command]
pub async fn show_confirm(
    _app: AppHandle,
    title: String,
    message: String,
) -> Result<bool, String> {
    let confirmed = rfd::MessageDialog::new()
        .set_title(&title)
        .set_description(&message)
        .set_buttons(rfd::MessageButtons::YesNo)
        .show();

    Ok(confirmed == rfd::MessageDialogResult::Yes)
}
