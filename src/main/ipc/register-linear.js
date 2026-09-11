const { ipcMain } = require('electron');

function registerLinearHandlers(deps) {
  const { linearService } = deps;

  ipcMain.handle('linear:get-teams', async () => {
    try {
      const teams = await linearService.listTeams();
      return { success: true, teams };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('linear:get-issues', async (event, { teamId }) => {
    try {
      const issues = await linearService.listIssues(teamId);
      return { success: true, issues };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('linear:get-issue', async (event, { issueId }) => {
    try {
      const issue = await linearService.getIssue(issueId);
      return { success: true, issue };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerLinearHandlers };
