const { ipcRenderer } = require('electron');

module.exports = {
  github: {
    getRepos: () => ipcRenderer.invoke('github:get-repos'),
    getAllPrs: () => ipcRenderer.invoke('github:get-all-prs'),
    getPrs: (owner, repo, state) => ipcRenderer.invoke('github:get-prs', { owner, repo, state }),
    getBranches: (owner, repo) => ipcRenderer.invoke('github:get-branches', { owner, repo }),
    getOwners: () => ipcRenderer.invoke('github:get-owners'),
    getPrDetails: (owner, repo, prNumber) =>
      ipcRenderer.invoke('github:get-pr-details', { owner, repo, prNumber }),
    getRepoFile: (owner, repo, path) =>
      ipcRenderer.invoke('github:get-repo-file', { owner, repo, path }),
    mergePr: (owner, repo, prNumber, method) =>
      ipcRenderer.invoke('github:merge-pr', { owner, repo, prNumber, method }),
    closePr: (owner, repo, prNumber) =>
      ipcRenderer.invoke('github:close-pr', { owner, repo, prNumber }),
    markPrReadyForReview: (nodeId) =>
      ipcRenderer.invoke('github:mark-pr-ready-for-review', { nodeId }),
    createRepo: ({ ownerType, owner, name, private: isPrivate }) =>
      ipcRenderer.invoke('github:create-repo', { ownerType, owner, name, private: isPrivate }),
  },
};
