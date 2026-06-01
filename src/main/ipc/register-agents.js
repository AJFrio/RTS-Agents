const { ipcMain } = require('electron');
const providerRegistry = require('./provider-registry');
const agentDiscoveryCache = require('../services/agent-discovery-cache');

function registerAgentsHandlers(deps) {
  ipcMain.handle('agents:get-all', async (event, options = {}) => {
    return agentDiscoveryCache.getAgents(deps, options);
  });

  ipcMain.handle('agents:invalidate-cache', async () => {
    agentDiscoveryCache.invalidate();
    return { success: true };
  });

  ipcMain.handle('agents:get-details', async (event, { provider, rawId, filePath }) => {
    try {
      return await providerRegistry.getAgentDetails(deps, { provider, rawId, filePath });
    } catch (err) {
      console.error('Error getting agent details:', err);
      throw err;
    }
  });

  ipcMain.handle('agents:get-jules-details-text', async (event, { sessionId }) => {
    try {
      const { julesService } = deps;
      return await julesService.getAgentDetailsText(sessionId);
    } catch (err) {
      console.error('Error getting Jules agent details (text):', err);
      throw err;
    }
  });

  ipcMain.handle('agents:get-jules-activity-media', async (event, { sessionId, activityId }) => {
    try {
      const { julesService } = deps;
      return await julesService.getActivityMedia(sessionId, activityId);
    } catch (err) {
      console.error('Error getting Jules activity media:', err);
      throw err;
    }
  });
}

module.exports = { registerAgentsHandlers };
