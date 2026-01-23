use crate::models::{JiraIssue, JiraIssueFields, JiraIssueType, JiraPriority, JiraStatus, JiraUser};
use crate::utils::http::{AuthType, HttpClient};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

pub struct JiraService {
    client: HttpClient,
    base_url: String,
    email: String,
    api_token: Option<String>,
}

impl JiraService {
    pub fn new(base_url: String, email: String, api_token: Option<String>) -> Self {
        Self {
            client: HttpClient::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            email,
            api_token,
        }
    }

    fn auth(&self) -> Option<AuthType> {
        self.api_token.as_ref().map(|token| AuthType::Basic {
            username: self.email.clone(),
            password: token.clone(),
        })
    }

    /// Get a specific issue
    pub async fn get_issue(&self, issue_key: &str) -> Result<JiraIssue> {
        let url = format!(
            "{}/rest/api/3/issue/{}?fields=summary,description,status,assignee,priority,issuetype",
            self.base_url, issue_key
        );
        self.client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to get Jira issue")
    }

    /// Search issues using JQL
    pub async fn search_issues(&self, jql: &str, max_results: u32) -> Result<SearchResult> {
        let url = format!(
            "{}/rest/api/3/search?jql={}&maxResults={}&fields=summary,description,status,assignee,priority,issuetype",
            self.base_url,
            urlencoding::encode(jql),
            max_results
        );
        self.client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to search Jira issues")
    }

    /// Get issues assigned to the current user
    pub async fn get_my_issues(&self) -> Result<Vec<JiraIssue>> {
        let jql = "assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC";
        let result = self.search_issues(jql, 50).await?;
        Ok(result.issues)
    }

    /// Get issues for a specific project
    pub async fn get_project_issues(&self, project_key: &str) -> Result<Vec<JiraIssue>> {
        let jql = format!(
            "project = {} AND resolution = Unresolved ORDER BY updated DESC",
            project_key
        );
        let result = self.search_issues(&jql, 100).await?;
        Ok(result.issues)
    }

    /// Create a new issue
    pub async fn create_issue(&self, project_key: &str, issue: CreateIssueRequest) -> Result<JiraIssue> {
        let url = format!("{}/rest/api/3/issue", self.base_url);
        let payload = CreateIssuePayload {
            fields: CreateIssueFields {
                project: ProjectKey {
                    key: project_key.to_string(),
                },
                summary: issue.summary,
                description: issue.description.map(|d| AtlassianDocument::from_text(&d)),
                issuetype: IssueTypeId {
                    id: issue.issue_type_id,
                },
                priority: issue.priority_id.map(|id| PriorityId { id }),
                assignee: issue.assignee_id.map(|id| AssigneeId { id }),
            },
        };

        let response: CreateIssueResponse = self
            .client
            .post(&url, &payload, self.auth().as_ref())
            .await
            .context("Failed to create Jira issue")?;

        // Fetch the full issue
        self.get_issue(&response.key).await
    }

    /// Update an issue
    pub async fn update_issue(&self, issue_key: &str, update: UpdateIssueRequest) -> Result<()> {
        let url = format!("{}/rest/api/3/issue/{}", self.base_url, issue_key);
        let payload = UpdateIssuePayload {
            fields: UpdateIssueFields {
                summary: update.summary,
                description: update.description.map(|d| AtlassianDocument::from_text(&d)),
            },
        };

        let _: serde_json::Value = self
            .client
            .put(&url, &payload, self.auth().as_ref())
            .await
            .context("Failed to update Jira issue")?;

        Ok(())
    }

    /// Transition an issue (change status)
    pub async fn transition_issue(&self, issue_key: &str, transition_id: &str) -> Result<()> {
        let url = format!(
            "{}/rest/api/3/issue/{}/transitions",
            self.base_url, issue_key
        );
        let payload = TransitionPayload {
            transition: TransitionId {
                id: transition_id.to_string(),
            },
        };

        let response = self
            .client
            .post::<serde_json::Value, _>(&url, &payload, self.auth().as_ref())
            .await;

        // Jira returns 204 No Content on success, which may cause parsing to fail
        match response {
            Ok(_) => Ok(()),
            Err(e) => {
                // Check if it's just an empty response (success)
                let err_str = e.to_string();
                if err_str.contains("EOF") || err_str.contains("empty") {
                    Ok(())
                } else {
                    Err(e).context("Failed to transition Jira issue")
                }
            }
        }
    }

    /// Get available transitions for an issue
    pub async fn get_transitions(&self, issue_key: &str) -> Result<Vec<Transition>> {
        let url = format!(
            "{}/rest/api/3/issue/{}/transitions",
            self.base_url, issue_key
        );
        let response: TransitionsResponse = self
            .client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to get issue transitions")?;
        Ok(response.transitions)
    }

    /// Get project info
    pub async fn get_project(&self, project_key: &str) -> Result<JiraProject> {
        let url = format!("{}/rest/api/3/project/{}", self.base_url, project_key);
        self.client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to get Jira project")
    }

    /// Get all accessible projects
    pub async fn get_projects(&self) -> Result<Vec<JiraProject>> {
        let url = format!("{}/rest/api/3/project", self.base_url);
        self.client
            .get(&url, self.auth().as_ref())
            .await
            .context("Failed to get Jira projects")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub total: u32,
    pub issues: Vec<JiraIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraProject {
    pub id: String,
    pub key: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CreateIssueRequest {
    pub summary: String,
    pub description: Option<String>,
    pub issue_type_id: String,
    pub priority_id: Option<String>,
    pub assignee_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UpdateIssueRequest {
    pub summary: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transition {
    pub id: String,
    pub name: String,
    pub to: JiraStatus,
}

// Internal structs for API payloads

#[derive(Debug, Serialize)]
struct CreateIssuePayload {
    fields: CreateIssueFields,
}

#[derive(Debug, Serialize)]
struct CreateIssueFields {
    project: ProjectKey,
    summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<AtlassianDocument>,
    issuetype: IssueTypeId,
    #[serde(skip_serializing_if = "Option::is_none")]
    priority: Option<PriorityId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    assignee: Option<AssigneeId>,
}

#[derive(Debug, Serialize)]
struct ProjectKey {
    key: String,
}

#[derive(Debug, Serialize)]
struct IssueTypeId {
    id: String,
}

#[derive(Debug, Serialize)]
struct PriorityId {
    id: String,
}

#[derive(Debug, Serialize)]
struct AssigneeId {
    id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct CreateIssueResponse {
    id: String,
    key: String,
}

#[derive(Debug, Serialize)]
struct UpdateIssuePayload {
    fields: UpdateIssueFields,
}

#[derive(Debug, Serialize)]
struct UpdateIssueFields {
    #[serde(skip_serializing_if = "Option::is_none")]
    summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<AtlassianDocument>,
}

#[derive(Debug, Serialize)]
struct TransitionPayload {
    transition: TransitionId,
}

#[derive(Debug, Serialize)]
struct TransitionId {
    id: String,
}

#[derive(Debug, Deserialize)]
struct TransitionsResponse {
    transitions: Vec<Transition>,
}

/// Atlassian Document Format (ADF) for rich text fields
#[derive(Debug, Clone, Serialize, Deserialize)]
struct AtlassianDocument {
    #[serde(rename = "type")]
    doc_type: String,
    version: u32,
    content: Vec<AtlassianContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AtlassianContent {
    #[serde(rename = "type")]
    content_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<Vec<AtlassianTextContent>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AtlassianTextContent {
    #[serde(rename = "type")]
    text_type: String,
    text: String,
}

impl AtlassianDocument {
    fn from_text(text: &str) -> Self {
        Self {
            doc_type: "doc".to_string(),
            version: 1,
            content: vec![AtlassianContent {
                content_type: "paragraph".to_string(),
                content: Some(vec![AtlassianTextContent {
                    text_type: "text".to_string(),
                    text: text.to_string(),
                }]),
            }],
        }
    }
}
