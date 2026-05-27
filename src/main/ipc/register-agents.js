const { ipcMain } = require('electron');
const providerRegistry = require('./provider-registry');

function registerAgentsHandlers(deps) {
  ipcMain.handle('agents:get-all', async () => {
    return providerRegistry.fetchAllAgents(deps);
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
