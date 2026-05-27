const { ipcRenderer } = require('electron');

module.exports = {
  openExternal: (url) => ipcRenderer.invoke('utils:open-external', { url }),
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  getConnectionStatus: () => ipcRenderer.invoke('utils:get-status'),
  getRepositories: (provider) => ipcRenderer.invoke('repos:get', { provider }),
  getAllRepositories: () => ipcRenderer.invoke('repos:get-all'),
  createTask: (provider, options) => ipcRenderer.invoke('tasks:create', { provider, options }),
  sendMessage: (provider, rawId, message) =>
    ipcRenderer.invoke('tasks:send-message', { provider, rawId, message }),
  orchestratorGetModels: () => ipcRenderer.invoke('orchestrator:get-models'),
  orchestratorChat: (messages, selectedModel) =>
    ipcRenderer.invoke('orchestrator:chat', { messages, selectedModel })
};
