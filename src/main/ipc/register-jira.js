const { ipcMain } = require('electron');

function registerJiraHandlers(deps) {
  const { jiraService } = deps;

ipcMain.handle('jira:get-boards', async () => {
    try {
      const boards = await jiraService.listBoards();
      return { success: true, boards };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  
ipcMain.handle('jira:get-sprints', async (event, { boardId }) => {
    try {
      const sprints = await jiraService.listSprints(boardId);
      return { success: true, sprints };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  
ipcMain.handle('jira:get-backlog-issues', async (event, { boardId }) => {
    try {
      const issues = await jiraService.getBacklogIssues(boardId);
      return { success: true, issues };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  
ipcMain.handle('jira:get-sprint-issues', async (event, { sprintId }) => {
    try {
      const issues = await jiraService.getSprintIssues(sprintId);
      return { success: true, issues };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  
ipcMain.handle('jira:get-issue', async (event, { issueKey }) => {
    try {
      const issue = await jiraService.getIssue(issueKey);
      return { success: true, issue };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  
ipcMain.handle('jira:get-issue-comments', async (event, { issueKey }) => {
    try {
      const comments = await jiraService.getIssueComments(issueKey);
      return { success: true, comments: comments.comments || [] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerJiraHandlers };
