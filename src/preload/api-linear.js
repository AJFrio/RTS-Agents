const { ipcRenderer } = require('electron');

module.exports = {
  linear: {
    getTeams: () => ipcRenderer.invoke('linear:get-teams'),
    getIssues: (teamId) => ipcRenderer.invoke('linear:get-issues', { teamId }),
    getIssue: (issueId) => ipcRenderer.invoke('linear:get-issue', { issueId }),
  },
};
