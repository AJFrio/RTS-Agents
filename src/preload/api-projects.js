const { ipcRenderer } = require('electron');

module.exports = {
  projects: {
    createLocalRepo: ({ name, directory }) =>
      ipcRenderer.invoke('projects:create-local-repo', { name, directory }),
    enqueueCreateRepo: ({ deviceId, name }) =>
      ipcRenderer.invoke('projects:enqueue-create-repo', { deviceId, name }),
    getLocalRepos: () => ipcRenderer.invoke('projects:get-local'),
    getRepoFile: (path, fileName) =>
      ipcRenderer.invoke('projects:get-repo-file', { path, fileName }),
    pullRepo: (path) => ipcRenderer.invoke('projects:pull-repo', { path }),
  },
};
