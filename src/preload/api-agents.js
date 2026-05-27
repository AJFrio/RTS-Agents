const { ipcRenderer } = require('electron');

module.exports = {
  getAgents: (options) => ipcRenderer.invoke('agents:get-all', options || {}),
  getAgentDetails: (provider, rawId, filePath) =>
    ipcRenderer.invoke('agents:get-details', { provider, rawId, filePath }),
  onRefreshTick: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('agents:refresh-tick', subscription);
    return () => {
      ipcRenderer.removeListener('agents:refresh-tick', subscription);
    };
  }
};
