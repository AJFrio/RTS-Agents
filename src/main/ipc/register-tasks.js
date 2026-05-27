const { ipcMain } = require('electron');
const providerRegistry = require('./provider-registry');

function registerTasksHandlers(deps) {
  const { agentOrchestrator } = deps;

  ipcMain.handle('repos:get', async (event, { provider }) => {
    try {
      return await providerRegistry.fetchRepositories(deps, provider);
    } catch (err) {
      console.error(`Error fetching repositories for ${provider}:`, err);
      return { success: false, error: err.message, repositories: [] };
    }
  });

  ipcMain.handle('repos:get-all', async () => {
    return providerRegistry.fetchAllRepositories(deps);
  });

  const createTask = (args) => providerRegistry.createTask(deps, args);
  agentOrchestrator.setCreateTaskCallback(createTask);

  ipcMain.handle('orchestrator:get-models', async () => {
    return agentOrchestrator.getAvailableModels();
  });

  ipcMain.handle('orchestrator:chat', async (event, { messages, selectedModel }) => {
    return agentOrchestrator.chat(messages, selectedModel);
  });

  ipcMain.handle('tasks:create', async (event, args) => {
    return createTask(args);
  });

  ipcMain.handle('tasks:send-message', async (event, { provider, rawId, message }) => {
    try {
      return await providerRegistry.sendTaskMessage(deps, { provider, rawId, message });
    } catch (err) {
      console.error(`Error sending message for ${provider}:`, err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerTasksHandlers };
