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
}

module.exports = { registerAgentsHandlers };
