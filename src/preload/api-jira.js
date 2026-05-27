const { ipcRenderer } = require('electron');

module.exports = {
  jira: {
    getBoards: () => ipcRenderer.invoke('jira:get-boards'),
    getSprints: (boardId) => ipcRenderer.invoke('jira:get-sprints', { boardId }),
    getBacklogIssues: (boardId) => ipcRenderer.invoke('jira:get-backlog-issues', { boardId }),
    getSprintIssues: (sprintId) => ipcRenderer.invoke('jira:get-sprint-issues', { sprintId }),
    getIssue: (issueKey) => ipcRenderer.invoke('jira:get-issue', { issueKey }),
    getIssueComments: (issueKey) => ipcRenderer.invoke('jira:get-issue-comments', { issueKey }),
  },
};
