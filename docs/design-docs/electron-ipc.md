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
| `tasks:session-updated` | Push event: live transcript/status for an ACP task (preload `onSessionUpdated`) |
| `utils:open-opencode-session` | Launch external terminal with OpenCode TUI (`-s ses_*`) in project directory |
| `settings:*` | Keys, polling, theme, paths, filters |
| `github:*` | Repos, PRs, merge, ready-for-review |
| `cloudflare:*` | KV config, heartbeat, key sync |
| `computers:list` | Registered devices |
| `jira:*` | Boards, sprints, issues |
| `orchestrator:*` | Chat / models / tool dispatch |

Search `ipcMain.handle` under `src/main/ipc/` for the authoritative full list.

## Web runtime (no Electron)

The same renderer runs on Cloudflare Workers. `src/renderer/context/ElectronAPI.jsx` resolves in precedence order: `window.__electronAPI` (test mocks) → `window.electronAPI` (preload) → `src/renderer/platform/web-api.mjs` (browser adapter). When adding a channel:

1. Add the `ipcMain.handle` + preload method as above.
2. Implement the same method on the web adapter (`web-api.mjs`, delegating to `src/renderer/platform/providers/*` for provider HTTP through the same-origin `/api/*` proxy in `worker/index.ts`).
3. Keep local-only capabilities (filesystem, dialogs, local CLIs, app updates) returning graceful failures on web.

**Hard constraints:** the renderer must stay free of client-side URL routing — the Vite build uses `base: './'` because Electron loads `dist/renderer/index.html` via `loadFile`; Workers Assets SPA fallback depends on it too. Never import `src/main/` modules from the renderer.

## Rules

- Handlers return JSON-serializable plain objects.
- Never pass API keys to renderer except masked UI state from settings getters designed for display.
- Long operations: consider progress events (`webContents.send`) if UX needs streaming; today most paths are request/response.
