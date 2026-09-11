# Spec: Web vs desktop surfaces

**Status:** Implemented

## Requirement

The same React renderer runs in Electron and in the Cloudflare-hosted web
app. Controls that need a local machine (CLI install, folder picker, app
update/restart, window mode) must render only on desktop. The website
keeps cloud keys, GitHub/Jira, Cloudflare KV, and remote dispatch.

## Runtime detection

- Desktop: `window.electronAPI` (preload) or `window.__electronAPI` (e2e).
- Web: neither bridge is present; `useElectronAPI()` uses `createWebApi()`.
- Flags live in `src/renderer/platform/runtime.mjs` and `useRuntime()`.

## Hidden on web

| Surface                                      | Desktop only                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| Settings → Window mode                       | Electron window chrome                                                            |
| Settings → Update & restart                  | git pull + app relaunch                                                           |
| Plugins → local-path services                | Claude Code, OpenCode, Codex, Antigravity, Cursor local roots, GitHub local roots |
| New Task → Local                             | Run a CLI on this machine                                                         |
| Create repo → This computer / remote enqueue | Local `git init` / KV enqueue stub                                                |
| Browse folder                                | Native directory dialog                                                           |
| OpenCode Terminal                            | Spawn a local TUI                                                                 |

## Shown on both

Theme, polling, cloud API keys (Jules, Cursor Cloud, Claude Cloud,
OpenRouter, GitHub, Jira), Cloudflare KV, dashboard/agent/PRs/repos,
New Task Cloud + Remote, Devices (linked machines).

## Acceptance criteria

- [ ] Web Settings has no Window mode and no Update & restart
- [ ] Web Plugins catalog has no `kind: 'local-path'` cards
- [ ] Web New Task offers Cloud and Remote only; Local presets fall back to Cloud
- [ ] Web Create Repository is GitHub-only
- [ ] Desktop still shows every control above
- [ ] `tests/unit/web-platform.verify.mjs` covers runtime flags and filters

## Implementation pointers

- `src/renderer/platform/runtime.mjs`, `src/renderer/hooks/use-runtime.js`
- `SettingsPage.jsx`, `PluginsPage.jsx`, `NewTaskPage.jsx`, `CreateRepoModal.jsx`
- `ServiceOnboardingModal.jsx`, `DevicesPage.jsx`
