const { ipcMain } = require('electron');
const providerRegistry = require('./provider-registry');
const modelRegistry = require('../services/model-registry');

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

  ipcMain.handle('models:get', async (event, { provider }) => {
    try {
      return await modelRegistry.getModelsForProvider(provider);
    } catch (err) {
      console.error(`Error listing models for ${provider}:`, err);
      return { success: false, models: [], source: 'none', error: err.message };
    }
  });

  ipcMain.handle('tasks:send-message', async (event, { provider, rawId, message, filePath }) => {
    try {
      return await providerRegistry.sendTaskMessage(deps, { provider, rawId, message, filePath });
    } catch (err) {
      console.error(`Error sending message for ${provider}:`, err);
      return { success: false, error: err.message };
    }
  });

  // Whether this task can accept a follow-up right now. For local CLI
  // providers this depends on a live adapter process, so it must be asked
  // per task rather than assumed from the provider alone.
  ipcMain.handle('tasks:can-send-message', async (event, { provider, rawId, filePath }) => {
    try {
      const state = providerRegistry.taskFollowUpState(deps, { provider, rawId, filePath });
      return { success: true, canSend: state.canSend, live: state.live };
    } catch (err) {
      console.error(`Error checking follow-up support for ${provider}:`, err);
      return { success: false, canSend: false, error: err.message };
    }
  });
}

module.exports = { registerTasksHandlers };
