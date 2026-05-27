import type { JiraIssue } from '../services/jira-service';

export function getAssignee(issue: JiraIssue): string {
  return issue.fields?.assignee?.displayName || 'Unassigned';
}
