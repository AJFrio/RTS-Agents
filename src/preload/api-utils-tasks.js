const { ipcRenderer } = require('electron');

module.exports = {
  openExternal: (url) => ipcRenderer.invoke('utils:open-external', { url }),
  openOpenCodeSession: (sessionId, projectPath) =>
    ipcRenderer.invoke('utils:open-opencode-session', { sessionId, projectPath }),
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  getConnectionStatus: () => ipcRenderer.invoke('utils:get-status'),
  getRepositories: (provider) => ipcRenderer.invoke('repos:get', { provider }),
  getAllRepositories: () => ipcRenderer.invoke('repos:get-all'),
  createTask: (provider, options) => ipcRenderer.invoke('tasks:create', { provider, options }),
  getProviderModels: (provider) => ipcRenderer.invoke('models:get', { provider }),
  sendMessage: (provider, rawId, message) =>
    ipcRenderer.invoke('tasks:send-message', { provider, rawId, message }),
  canSendMessage: (provider, rawId) =>
    ipcRenderer.invoke('tasks:can-send-message', { provider, rawId }),
  orchestratorGetModels: () => ipcRenderer.invoke('orchestrator:get-models'),
  orchestratorChat: (messages, selectedModel) =>
    ipcRenderer.invoke('orchestrator:chat', { messages, selectedModel })
};
