const { ipcMain } = require('electron');

function registerGithubHandlers(deps) {
  const { githubService } = deps;

  ipcMain.handle('github:mark-pr-ready-for-review', async (event, { nodeId }) => {
    try {
      const result = await githubService.markPullRequestReadyForReview(nodeId);
      if (result.errors) {
        return { success: false, error: result.errors[0].message };
      }
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('github:get-all-prs', async () => {
    try {
      const prs = await githubService.getAllPullRequests();
      return { success: true, prs };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('github:close-pr', async (event, { owner, repo, prNumber }) => {
    try {
      const result = await githubService.closePullRequest(owner, repo, prNumber);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('github:get-repos', async () => {
    try {
      const repos = await githubService.getUserRepos();
      return { success: true, repos };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('github:get-owners', async () => {
    try {
      const user = await githubService.getCurrentUser();
      const orgs = await githubService.getUserOrgs();
      return { success: true, user, orgs };
    } catch (err) {
      return { success: false, error: err.message, user: null, orgs: [] };
    }
  });

  ipcMain.handle(
    'github:create-repo',
    async (event, { ownerType, owner, name, private: isPrivate } = {}) => {
      try {
        const repo = await githubService.createRepository({
          ownerType,
          owner,
          name,
          private: !!isPrivate,
        });
        return { success: true, repo };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle('github:get-prs', async (event, { owner, repo, state }) => {
    try {
      const prs = await githubService.getPullRequests(owner, repo, state);
      return { success: true, prs };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('github:get-branches', async (event, { owner, repo }) => {
    try {
      const branches = await githubService.getBranches(owner, repo);
      return { success: true, branches };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('github:get-pr-details', async (event, { owner, repo, prNumber }) => {
    try {
      const pr = await githubService.getPullRequestDetails(owner, repo, prNumber);
      return { success: true, pr };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('github:get-repo-file', async (event, { owner, repo, path }) => {
    try {
      const content = await githubService.getRepoFile(owner, repo, path);
      return { success: true, content };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('github:merge-pr', async (event, { owner, repo, prNumber, method }) => {
    try {
      const result = await githubService.mergePullRequest(owner, repo, prNumber, method);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerGithubHandlers };
