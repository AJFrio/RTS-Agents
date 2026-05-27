const { ipcMain } = require('electron');
const providerHealth = require('../services/provider-health');

function registerUtilsHandlers(deps) {
  const {
    configStore,
    antigravityService,
    julesService,
    cursorService,
    codexService,
    claudeService,
    openRouterService,
    githubService,
    jiraService,
    opencodeService,
    app,
    shell,
    dialog,
    exec,
    spawn,
    getMainWindow,
    appRoot
  } = deps;

  function performUpdate() {
    console.log('Update requested. Executing git stash, git pull, npm install...');

    return new Promise((resolve) => {
      const command = 'git stash --include-untracked && git pull && npm install';

      exec(command, { cwd: appRoot }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Update failed: ${error.message}`);
          resolve({ success: false, error: error.message });
          return;
        }

        console.log(`Update stdout: ${stdout}`);
        if (stderr) console.error(`Update stderr: ${stderr}`);

        resolve({ success: true });

        console.log('Update successful. Restarting application with npm start...');

        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const subprocess = spawn(npmCmd, ['start'], {
          detached: true,
          stdio: 'ignore',
          cwd: appRoot,
          shell: false
        });
        subprocess.unref();

        app.quit();
      });
    });
  }

  ipcMain.handle('app:update', async () => {
    return performUpdate();
  });

  /**
   * Open external URL in browser
   */
ipcMain.handle('utils:open-external', async (event, { url }) => {
    await shell.openExternal(url);
    return { success: true };
  });
  
  /**
   * Open directory selection dialog
   */
ipcMain.handle('dialog:open-directory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openDirectory']
    });
    if (canceled) {
      return null;
    } else {
      return filePaths[0];
    }
  });
  
  /**
   * Get provider connection status
   */
ipcMain.handle('utils:get-status', async () => {
    const [julesStatus, cursorStatus, codexStatus, claudeCloudStatus, githubStatus, jiraStatus, openRouterStatus] = await Promise.allSettled([
      configStore.hasApiKey('jules') ? julesService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
      configStore.hasApiKey('cursor') ? cursorService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
      configStore.hasApiKey('codex') ? codexService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
      configStore.hasApiKey('claude') ? claudeService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
      configStore.hasApiKey('github') ? githubService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
      configStore.hasApiKey('jira') ? jiraService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
      configStore.hasApiKey('openrouter') ? openRouterService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' })
    ]);
  
    // Local CLI status: connected if CLI is installed
    const [antigravityInstalled, claudeCliInstalled, codexInstalled, opencodeInstalled] = await Promise.all([
      antigravityService.isAntigravityInstalled(),
      claudeService.isClaudeInstalled(),
      codexService.isCodexInstalled(),
      opencodeService.isOpenCodeInstalled()
    ]);
    return {
      antigravity: {
        success: antigravityInstalled,
        connected: antigravityInstalled,
        error: antigravityInstalled ? null : 'Antigravity CLI not found'
      },
      openrouter: openRouterStatus.status === 'fulfilled'
        ? openRouterStatus.value
        : providerHealth.fail('openrouter', openRouterStatus.reason, { configured: configStore.hasApiKey('openrouter') }),
      jules: julesStatus.status === 'fulfilled' ? julesStatus.value : { success: false, error: julesStatus.reason?.message },
      cursor: cursorStatus.status === 'fulfilled' ? cursorStatus.value : { success: false, error: cursorStatus.reason?.message },
      codex: configStore.hasApiKey('codex')
        ? (codexStatus.status === 'fulfilled' ? codexStatus.value : providerHealth.fail('codex', codexStatus.reason, { configured: true }))
        : (codexInstalled
          ? providerHealth.ok('codex', {
            configured: true,
            installed: true,
            docsUrl: 'https://developers.openai.com/codex/noninteractive',
            endpointLabel: 'codex --version',
            message: 'Codex CLI is available on this machine.'
          })
          : providerHealth.notConfigured('codex', {
            installed: false,
            docsUrl: 'https://developers.openai.com/codex/noninteractive',
            endpointLabel: 'codex --version',
            message: 'OpenAI API key not configured and Codex CLI not found'
          })),
      'claude-cli': {
        success: claudeCliInstalled,
        connected: claudeCliInstalled,
        error: claudeCliInstalled ? null : 'Claude CLI not installed'
      },
      opencode: {
        success: opencodeInstalled,
        connected: opencodeInstalled,
        error: opencodeInstalled ? null : 'OpenCode CLI not found'
      },
      'claude-cloud': claudeCloudStatus.status === 'fulfilled'
        ? claudeCloudStatus.value
        : providerHealth.fail('claude-cloud', claudeCloudStatus.reason, { configured: configStore.hasApiKey('claude') }),
      github: githubStatus.status === 'fulfilled' ? githubStatus.value : { success: false, error: githubStatus.reason?.message },
      jira: jiraStatus.status === 'fulfilled' ? jiraStatus.value : { success: false, error: jiraStatus.reason?.message }
    };
  });

  return { performUpdate };
}

module.exports = { registerUtilsHandlers };
