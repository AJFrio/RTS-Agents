# Electron IPC design

**Status:** Verified

## Model

```
Renderer  →  window.electronAPI.*  →  preload.js  →  ipcRenderer.invoke
                                                      ↓
main.js  →  registerAllIpcHandlers()  →  src/main/ipc/register-*.js
           ↓
       services/*.js
```

## Adding a channel

1. Implement `ipcMain.handle('domain:action', …)` in the matching `src/main/ipc/register-<domain>.js` module (wired from `src/main/ipc/index.js`).
2. Expose `domainAction: (args) => ipcRenderer.invoke('domain:action', args)` in `preload.js`.
3. Wrap in `ElectronAPI.jsx` / `useElectronAPI()` for React.
4. Document the channel in this file (table below) in the same PR.

## Channel inventory (representative)

| Channel | Purpose |
|---------|---------|
| `agents:get-all` | Aggregated task list from all providers |
| `agents:get-details` | Provider-specific detail payload |
| `settings:*` | Keys, polling, theme, paths, filters |
| `github:*` | Repos, PRs, merge, ready-for-review |
| `cloudflare:*` | KV config, heartbeat, key sync |
| `computers:list` | Registered devices |
| `jira:*` | Boards, sprints, issues |
| `orchestrator:*` | Chat / models / tool dispatch |

Search `ipcMain.handle` under `src/main/ipc/` for the authoritative full list.

## Rules

- Handlers return JSON-serializable plain objects.
- Never pass API keys to renderer except masked UI state from settings getters designed for display.
- Long operations: consider progress events (`webContents.send`) if UX needs streaming; today most paths are request/response.
