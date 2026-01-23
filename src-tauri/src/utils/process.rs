use std::process::{Command, Stdio};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ProcessError {
    #[error("Failed to spawn process: {0}")]
    SpawnFailed(#[from] std::io::Error),
    #[error("Process exited with error: {0}")]
    ExitError(String),
    #[error("Command not found: {0}")]
    NotFound(String),
}

/// Spawn a detached process that runs independently of the parent
pub fn spawn_detached(program: &str, args: &[&str], cwd: &str) -> Result<u32, ProcessError> {
    let child = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    Ok(child.id())
}

/// Spawn a process and wait for its output
pub fn spawn_and_wait(program: &str, args: &[&str], cwd: &str) -> Result<String, ProcessError> {
    let output = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .output()?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(ProcessError::ExitError(stderr.to_string()))
    }
}

/// Check if a command exists in PATH
pub fn command_exists(program: &str) -> bool {
    which::which(program).is_ok()
}

/// Get the platform-specific CLI command name
pub fn get_cli_command(base_name: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{}.cmd", base_name)
    } else {
        base_name.to_string()
    }
}

/// Run a git command in a directory and return the output
pub fn run_git_command(args: &[&str], cwd: &str) -> Result<String, ProcessError> {
    spawn_and_wait("git", args, cwd)
}

/// Get the current git branch
pub fn get_current_branch(repo_path: &str) -> Result<String, ProcessError> {
    let output = run_git_command(&["rev-parse", "--abbrev-ref", "HEAD"], repo_path)?;
    Ok(output.trim().to_string())
}

/// Get the remote URL for a git repository
pub fn get_remote_url(repo_path: &str) -> Result<String, ProcessError> {
    let output = run_git_command(&["config", "--get", "remote.origin.url"], repo_path)?;
    Ok(output.trim().to_string())
}

/// Check if a directory is a git repository
pub fn is_git_repo(path: &str) -> bool {
    std::path::Path::new(path).join(".git").exists()
}

/// Extract owner and repo name from a GitHub URL
pub fn parse_github_url(url: &str) -> Option<(String, String)> {
    // Handle both HTTPS and SSH URLs
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    let url = url.trim();

    if url.contains("github.com") {
        let parts: Vec<&str> = if url.starts_with("git@") {
            // SSH format
            url.trim_start_matches("git@github.com:")
                .trim_end_matches(".git")
                .split('/')
                .collect()
        } else {
            // HTTPS format
            url.trim_start_matches("https://github.com/")
                .trim_start_matches("http://github.com/")
                .trim_end_matches(".git")
                .split('/')
                .collect()
        };

        if parts.len() >= 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_github_url_https() {
        let result = parse_github_url("https://github.com/owner/repo.git");
        assert_eq!(result, Some(("owner".to_string(), "repo".to_string())));
    }

    #[test]
    fn test_parse_github_url_ssh() {
        let result = parse_github_url("git@github.com:owner/repo.git");
        assert_eq!(result, Some(("owner".to_string(), "repo".to_string())));
    }

    #[test]
    fn test_get_cli_command() {
        let cmd = get_cli_command("gemini");
        #[cfg(target_os = "windows")]
        assert_eq!(cmd, "gemini.cmd");
        #[cfg(not(target_os = "windows"))]
        assert_eq!(cmd, "gemini");
    }
}
