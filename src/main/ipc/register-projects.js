const { ipcMain } = require('electron');

function registerProjectsHandlers(deps) {
  const { configStore, projectService, cloudflareKvService, lifecycle } = deps;
  const { ensureCloudflareNamespaceId } = lifecycle;

  ipcMain.handle('projects:get-repo-file', async (event, { path, fileName }) => {
    try {
      const content = await projectService.getRepoFile(path, fileName);
      return { success: true, content };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ============================================
  // IPC Handlers - Project/Repo Creation
  // ============================================

  ipcMain.handle('projects:create-local-repo', async (event, { name, directory } = {}) => {
    try {
      const repoPath = await projectService.createLocalRepo({ directory, name });
      return { success: true, path: repoPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('projects:get-local', async () => {
    try {
      const githubPaths = configStore.getGithubPaths();
      if (!Array.isArray(githubPaths) || githubPaths.length === 0) {
        return { success: true, repos: [] };
      }
      const repos = await projectService.getLocalRepos(githubPaths);
      return { success: true, repos };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('projects:pull-repo', async (event, { path }) => {
    try {
      await projectService.pullRepo(path);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('projects:enqueue-create-repo', async (event, { deviceId, name } = {}) => {
    try {
      if (!deviceId) throw new Error('Missing deviceId');
      if (!name) throw new Error('Missing repository name');
      const namespaceId = await ensureCloudflareNamespaceId();
      if (!namespaceId) throw new Error('Cloudflare KV not configured');

      const identity = configStore.getOrCreateDeviceIdentity();
      const nowIso = new Date().toISOString();

      const task = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tool: 'project:create',
        repo: { name: String(name) },
        requestedBy: identity.name,
        createdAt: nowIso,
      };

      await cloudflareKvService.enqueueDeviceTask(namespaceId, deviceId, task);
      return { success: true, task };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerProjectsHandlers };
