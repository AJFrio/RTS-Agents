use crate::models::ProjectConfig;
use crate::utils::process::{get_current_branch, get_remote_url, is_git_repo, parse_github_url, run_git_command};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use walkdir::WalkDir;

/// Project Service - manages local project discovery and git operations
pub struct ProjectService {
    scan_paths: Vec<PathBuf>,
}

impl ProjectService {
    pub fn new() -> Self {
        Self {
            scan_paths: Self::default_scan_paths(),
        }
    }

    pub fn with_scan_paths(mut self, paths: Vec<PathBuf>) -> Self {
        self.scan_paths = paths;
        self
    }

    fn default_scan_paths() -> Vec<PathBuf> {
        let home = dirs::home_dir().unwrap_or_default();
        vec![
            home.join("Projects"),
            home.join("projects"),
            home.join("Development"),
            home.join("dev"),
            home.join("Code"),
            home.join("code"),
            home.join("Documents").join("Projects"),
            home.join("Documents").join("GitHub"),
        ]
    }

    /// Scan for local Git repositories
    pub fn discover_projects(&self, max_depth: usize) -> Result<Vec<DiscoveredProject>> {
        let mut projects = Vec::new();
        let mut seen_paths = std::collections::HashSet::new();

        for base_path in &self.scan_paths {
            if !base_path.exists() {
                continue;
            }

            for entry in WalkDir::new(base_path)
                .max_depth(max_depth)
                .follow_links(false)
                .into_iter()
                .filter_entry(|e| {
                    // Skip hidden directories except .git
                    let name = e.file_name().to_string_lossy();
                    !name.starts_with('.') || name == ".git"
                })
            {
                let entry = match entry {
                    Ok(e) => e,
                    Err(_) => continue,
                };

                let path = entry.path();

                // Check if this is a .git directory
                if path.file_name().and_then(|n| n.to_str()) == Some(".git") {
                    if let Some(parent) = path.parent() {
                        let parent_str = parent.to_string_lossy().to_string();
                        if seen_paths.insert(parent_str.clone()) {
                            if let Ok(project) = self.analyze_project(parent) {
                                projects.push(project);
                            }
                        }
                    }
                }
            }
        }

        // Sort by name
        projects.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

        Ok(projects)
    }

    /// Analyze a Git repository
    fn analyze_project(&self, path: &std::path::Path) -> Result<DiscoveredProject> {
        let path_str = path.to_string_lossy().to_string();

        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let branch = get_current_branch(&path_str).ok();
        let remote_url = get_remote_url(&path_str).ok();

        let github_info = remote_url.as_ref().and_then(|url| {
            parse_github_url(url).map(|(owner, repo)| {
                let full_name = format!("{}/{}", owner, repo);
                GitHubInfo {
                    owner,
                    repo,
                    full_name,
                }
            })
        });

        Ok(DiscoveredProject {
            name,
            path: path_str,
            branch,
            remote_url,
            github: github_info,
        })
    }

    /// Get detailed info about a specific project
    pub fn get_project_info(&self, path: &str) -> Result<ProjectInfo> {
        if !is_git_repo(path) {
            anyhow::bail!("Not a Git repository");
        }

        let project = self.analyze_project(std::path::Path::new(path))?;

        // Get additional git info
        let status = self.get_git_status(path)?;
        let recent_commits = self.get_recent_commits(path, 10)?;
        let branches = self.get_branches(path)?;

        Ok(ProjectInfo {
            project,
            status,
            recent_commits,
            branches,
        })
    }

    /// Get git status for a repository
    fn get_git_status(&self, path: &str) -> Result<GitStatus> {
        let output = run_git_command(&["status", "--porcelain"], path)?;

        let mut modified = 0;
        let mut added = 0;
        let mut deleted = 0;
        let mut untracked = 0;

        for line in output.lines() {
            if line.len() < 2 {
                continue;
            }
            let status_code = &line[0..2];
            match status_code.trim() {
                "M" | "MM" | "AM" => modified += 1,
                "A" => added += 1,
                "D" => deleted += 1,
                "??" => untracked += 1,
                _ => {}
            }
        }

        let is_clean = modified == 0 && added == 0 && deleted == 0 && untracked == 0;

        Ok(GitStatus {
            is_clean,
            modified,
            added,
            deleted,
            untracked,
        })
    }

    /// Get recent commits
    fn get_recent_commits(&self, path: &str, count: usize) -> Result<Vec<CommitInfo>> {
        let output = run_git_command(
            &[
                "log",
                &format!("-{}", count),
                "--pretty=format:%H|%h|%s|%an|%ae|%ai",
            ],
            path,
        )?;

        let commits = output
            .lines()
            .filter_map(|line| {
                let parts: Vec<&str> = line.split('|').collect();
                if parts.len() >= 6 {
                    Some(CommitInfo {
                        sha: parts[0].to_string(),
                        short_sha: parts[1].to_string(),
                        message: parts[2].to_string(),
                        author_name: parts[3].to_string(),
                        author_email: parts[4].to_string(),
                        date: parts[5].to_string(),
                    })
                } else {
                    None
                }
            })
            .collect();

        Ok(commits)
    }

    /// Get all branches
    fn get_branches(&self, path: &str) -> Result<Vec<BranchInfo>> {
        let output = run_git_command(&["branch", "-a", "-v", "--no-abbrev"], path)?;
        let current_branch = get_current_branch(path).unwrap_or_default();

        let branches = output
            .lines()
            .filter_map(|line| {
                let line = line.trim();
                if line.is_empty() {
                    return None;
                }

                let is_current = line.starts_with('*');
                let line = line.trim_start_matches('*').trim();

                let parts: Vec<&str> = line.splitn(3, char::is_whitespace).collect();
                if parts.len() >= 2 {
                    let name = parts[0].to_string();
                    let is_remote = name.starts_with("remotes/");

                    Some(BranchInfo {
                        name: name.trim_start_matches("remotes/origin/").to_string(),
                        is_current: is_current || name == current_branch,
                        is_remote,
                        sha: parts.get(1).map(|s| s.to_string()),
                    })
                } else {
                    None
                }
            })
            .collect();

        Ok(branches)
    }

    /// Pull latest changes
    pub fn pull(&self, path: &str) -> Result<String> {
        Ok(run_git_command(&["pull"], path)?)
    }

    /// Fetch from remote
    pub fn fetch(&self, path: &str) -> Result<String> {
        Ok(run_git_command(&["fetch", "--all", "--prune"], path)?)
    }

    /// Checkout a branch
    pub fn checkout(&self, path: &str, branch: &str) -> Result<String> {
        Ok(run_git_command(&["checkout", branch], path)?)
    }

    /// Create and checkout a new branch
    pub fn create_branch(&self, path: &str, branch: &str) -> Result<String> {
        Ok(run_git_command(&["checkout", "-b", branch], path)?)
    }

    /// Create a worktree
    pub fn create_worktree(&self, path: &str, branch: &str, worktree_path: &str) -> Result<String> {
        Ok(run_git_command(&["worktree", "add", worktree_path, "-b", branch], path)?)
    }

    /// Remove a worktree
    pub fn remove_worktree(&self, path: &str, worktree_path: &str) -> Result<String> {
        Ok(run_git_command(&["worktree", "remove", worktree_path, "--force"], path)?)
    }

    /// List worktrees
    pub fn list_worktrees(&self, path: &str) -> Result<Vec<WorktreeInfo>> {
        let output = run_git_command(&["worktree", "list", "--porcelain"], path)?;

        let mut worktrees = Vec::new();
        let mut current: Option<WorktreeInfo> = None;

        for line in output.lines() {
            if line.starts_with("worktree ") {
                if let Some(wt) = current.take() {
                    worktrees.push(wt);
                }
                current = Some(WorktreeInfo {
                    path: line.trim_start_matches("worktree ").to_string(),
                    branch: None,
                    sha: None,
                    is_bare: false,
                });
            } else if line.starts_with("HEAD ") {
                if let Some(ref mut wt) = current {
                    wt.sha = Some(line.trim_start_matches("HEAD ").to_string());
                }
            } else if line.starts_with("branch ") {
                if let Some(ref mut wt) = current {
                    wt.branch = Some(
                        line.trim_start_matches("branch refs/heads/")
                            .to_string(),
                    );
                }
            } else if line == "bare" {
                if let Some(ref mut wt) = current {
                    wt.is_bare = true;
                }
            }
        }

        if let Some(wt) = current {
            worktrees.push(wt);
        }

        Ok(worktrees)
    }

    /// Convert discovered project to config
    pub fn to_project_config(&self, project: &DiscoveredProject) -> ProjectConfig {
        ProjectConfig {
            id: uuid::Uuid::new_v4().to_string(),
            name: project.name.clone(),
            path: project.path.clone(),
            github_repo: project.github.as_ref().map(|g| g.full_name.clone()),
            jira_project: None,
        }
    }
}

impl Default for ProjectService {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredProject {
    pub name: String,
    pub path: String,
    pub branch: Option<String>,
    pub remote_url: Option<String>,
    pub github: Option<GitHubInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubInfo {
    pub owner: String,
    pub repo: String,
    pub full_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub project: DiscoveredProject,
    pub status: GitStatus,
    pub recent_commits: Vec<CommitInfo>,
    pub branches: Vec<BranchInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub is_clean: bool,
    pub modified: u32,
    pub added: u32,
    pub deleted: u32,
    pub untracked: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInfo {
    pub sha: String,
    pub short_sha: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub sha: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: Option<String>,
    pub sha: Option<String>,
    pub is_bare: bool,
}
