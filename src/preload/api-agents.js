const { ipcRenderer } = require('electron');

module.exports = {
  getAgents: () => ipcRenderer.invoke('agents:get-all'),
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
