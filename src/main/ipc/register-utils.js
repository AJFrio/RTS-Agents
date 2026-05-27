const { ipcMain } = require('electron');

function registerUtilsHandlers(deps) {
  const {
    configStore,
    geminiService,
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

  async function testOpenAiApiKeyConnection() {
    const openAiKey = configStore.getApiKey('openai');
    if (!openAiKey) {
      return { success: false, error: 'Not configured' };
    }

    const existingCodexKey = configStore.getApiKey('codex');

    try {
      codexService.setApiKey(openAiKey);
      return await codexService.testConnection();
    } finally {
      codexService.setApiKey(existingCodexKey || null);
    }
  }

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
    const [julesStatus, cursorStatus, codexStatus, claudeCloudStatus, githubStatus, jiraStatus, openRouterStatus, openAiStatus, geminiApiStatus] = await Promise.allSettled([
      configStore.hasApiKey('jules') ? julesService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
      configStore.hasApiKey('cursor') ? cursorService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
      configStore.hasApiKey('codex') ? codexService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
      configStore.hasApiKey('claude') ? claudeService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
      configStore.hasApiKey('github') ? githubService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
      configStore.hasApiKey('jira') ? jiraService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
      configStore.hasApiKey('openrouter') ? openRouterService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
      configStore.hasApiKey('openai') ? testOpenAiApiKeyConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
      configStore.hasApiKey('gemini') ? geminiService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' })
    ]);
  
    // Claude CLI status: connected if CLI is installed
    const claudeCliInstalled = claudeService.isClaudeInstalled();
    // Claude Cloud status: connected if API key is valid
    const claudeCloudValid = claudeCloudStatus.status === 'fulfilled' && claudeCloudStatus.value.success;
    const geminiInstalled = geminiService.isGeminiInstalled();
    const geminiApiValid = geminiApiStatus.status === 'fulfilled' && geminiApiStatus.value.success;
    
    return {
      gemini: {
        success: geminiInstalled || geminiApiValid,
        connected: geminiInstalled || geminiApiValid,
        error: geminiInstalled
          ? null
          : geminiApiValid
            ? null
            : (configStore.hasApiKey('gemini') ? (geminiApiStatus.value?.error || 'Gemini API key invalid') : 'Gemini CLI not found & API Key missing')
      },
      openrouter: {
        success: openRouterStatus.status === 'fulfilled' && openRouterStatus.value.success,
        connected: openRouterStatus.status === 'fulfilled' && openRouterStatus.value.success,
        error: openRouterStatus.status === 'fulfilled' ? openRouterStatus.value.error : openRouterStatus.reason?.message
      },
      openai: {
        success: openAiStatus.status === 'fulfilled' && openAiStatus.value.success,
        connected: openAiStatus.status === 'fulfilled' && openAiStatus.value.success,
        error: openAiStatus.status === 'fulfilled' ? openAiStatus.value.error : openAiStatus.reason?.message
      },
      jules: julesStatus.status === 'fulfilled' ? julesStatus.value : { success: false, error: julesStatus.reason?.message },
      cursor: cursorStatus.status === 'fulfilled' ? cursorStatus.value : { success: false, error: cursorStatus.reason?.message },
      codex: codexStatus.status === 'fulfilled' ? codexStatus.value : { success: false, error: codexStatus.reason?.message },
      'claude-cli': {
        success: claudeCliInstalled,
        connected: claudeCliInstalled,
        error: claudeCliInstalled ? null : 'Claude CLI not installed'
      },
      opencode: (() => {
        const o = opencodeService.isOpenCodeInstalled();
        return { success: o, connected: o, error: o ? null : 'OpenCode CLI not found' };
      })(),
      'claude-cloud': {
        success: claudeCloudValid,
        connected: claudeCloudValid,
        error: claudeCloudValid ? null : (configStore.hasApiKey('claude') ? 'API key invalid' : 'Not configured')
      },
      github: githubStatus.status === 'fulfilled' ? githubStatus.value : { success: false, error: githubStatus.reason?.message },
      jira: jiraStatus.status === 'fulfilled' ? jiraStatus.value : { success: false, error: jiraStatus.reason?.message }
    };
  });

  return { performUpdate };
}

module.exports = { registerUtilsHandlers };
