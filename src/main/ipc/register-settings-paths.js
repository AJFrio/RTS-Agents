const { ipcMain } = require('electron');
const { PROJECT_PATH_PROVIDERS } = require('../services/config-path-registry');

/**
 * Provider-specific metadata returned by settings:get-*-paths handlers.
 */
const PATH_PROVIDER_META = {
  antigravity: async ({ antigravityService }) => ({
    defaultPath: antigravityService.getDefaultDataPath(),
    installed: await antigravityService.isAntigravityInstalled()
  }),
  claude: async ({ claudeService }) => ({
    defaultPath: claudeService.getDefaultPath(),
    installed: await claudeService.isClaudeInstalled()
  }),
  cursor: () => ({}),
  codex: () => ({}),
  github: () => ({})
};

function registerSettingsPathHandlers(deps) {
  const { configStore, lifecycle, antigravityService, claudeService } = deps;
  const { sendCloudflareHeartbeat, invalidateAgentDiscovery, startDiscoveryWatchers } = lifecycle;

  for (const provider of PROJECT_PATH_PROVIDERS) {
    ipcMain.handle(`settings:add-${provider}-path`, async (event, { path: projectPath }) => {
      const paths = configStore.addProjectPath(provider, projectPath);
      invalidateAgentDiscovery();
      startDiscoveryWatchers();
      void sendCloudflareHeartbeat().catch(console.error);
      return { success: true, paths };
    });

    ipcMain.handle(`settings:remove-${provider}-path`, async (event, { path: projectPath }) => {
      const paths = configStore.removeProjectPath(provider, projectPath);
      invalidateAgentDiscovery();
      startDiscoveryWatchers();
      void sendCloudflareHeartbeat().catch(console.error);
      return { success: true, paths };
    });

    ipcMain.handle(`settings:get-${provider}-paths`, async () => {
      const metaFn = PATH_PROVIDER_META[provider];
      const extra = metaFn ? await metaFn({ antigravityService, claudeService }) : {};
      return {
        paths: configStore.getProjectPaths(provider),
        ...extra
      };
    });
  }

  ipcMain.handle('settings:get-all-project-paths', async () => {
    return {
      paths: configStore.getAllProjectPaths(),
      ...configStore.getProjectPathsByProvider()
    };
  });
}

module.exports = { registerSettingsPathHandlers };
