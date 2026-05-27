const { ipcMain } = require('electron');
const { PROJECT_PATH_PROVIDERS } = require('../services/config-path-registry');

/**
 * Provider-specific metadata returned by settings:get-*-paths handlers.
 */
const PATH_PROVIDER_META = {
  gemini: ({ geminiService }) => ({
    defaultPath: geminiService.getDefaultPath(),
    installed: geminiService.isGeminiInstalled()
  }),
  claude: ({ claudeService }) => ({
    defaultPath: claudeService.getDefaultPath(),
    installed: claudeService.isClaudeInstalled()
  }),
  cursor: () => ({}),
  codex: () => ({}),
  github: () => ({})
};

function registerSettingsPathHandlers(deps) {
  const { configStore, lifecycle, geminiService, claudeService } = deps;
  const { sendCloudflareHeartbeat } = lifecycle;

  for (const provider of PROJECT_PATH_PROVIDERS) {
    ipcMain.handle(`settings:add-${provider}-path`, async (event, { path: projectPath }) => {
      const paths = configStore.addProjectPath(provider, projectPath);
      void sendCloudflareHeartbeat().catch(console.error);
      return { success: true, paths };
    });

    ipcMain.handle(`settings:remove-${provider}-path`, async (event, { path: projectPath }) => {
      const paths = configStore.removeProjectPath(provider, projectPath);
      void sendCloudflareHeartbeat().catch(console.error);
      return { success: true, paths };
    });

    ipcMain.handle(`settings:get-${provider}-paths`, async () => {
      const metaFn = PATH_PROVIDER_META[provider];
      const extra = metaFn ? metaFn({ geminiService, claudeService }) : {};
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
