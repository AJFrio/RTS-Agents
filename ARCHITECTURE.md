# RTS Agents — Architecture Map

RTS Agents is an **agent orchestration dashboard**: one place to monitor, create, and route coding tasks across local CLIs and cloud providers, with optional multi-device sync via Cloudflare KV.

## System boundaries

| Surface       | Runtime                  | Entry            | Role                                                   |
| ------------- | ------------------------ | ---------------- | ------------------------------------------------------ |
| Desktop app   | Electron 28              | `main.js`        | Primary product: IPC, polling, provider services       |
| Renderer UI   | React 18 + Vite          | `src/renderer/`  | Dashboard, settings, modals, GitHub/Jira views         |
| Mobile PWA    | Vite + Cloudflare Worker | `mobile-webapp/` | Remote dashboard; dispatches to desktop via KV         |
| Headless node | Node (no UI)             | `headless.js`    | Registers device, pulls keys, runs queued remote tasks |

## Layering (desktop)

```
Renderer (React, ESM)
    ↕ contextBridge only
Preload (preload.js)
    ↕ ipcMain.handle / ipcRenderer.invoke
Main process (main.js, CommonJS)
    → IPC handlers (src/main/ipc/*.js)
    → Services (src/main/services/*.js)
    → ConfigStore (electron-store)
    → OS / network / child processes
```

**Rules agents must follow:**

1. Renderer never imports main-process modules or Node APIs.
2. New capabilities go through `preload.js` + a named IPC channel in `main.js`.
3. Provider HTTP and filesystem logic stays in `src/main/services/`, not in React components.
4. Secrets only in `config-store.js` (electron-store); never committed to the repo.

## Domain modules

| Domain           | Main services                                                                                              | Renderer areas                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Agent discovery  | `gemini-service`, `claude-service`, `opencode-service`, `jules-service`, `cursor-service`, `codex-service` | Dashboard, AgentPage                    |
| Task creation    | same + `project-service`                                                                                   | NewTaskModal                            |
| Orchestration    | `agent-orchestrator`, `openrouter-service`                                                                 | Agent chat / tools                      |
| GitHub           | `github-service`                                                                                           | BranchesPage, PullRequestsPage, PrModal |
| Multi-device     | `cloudflare-kv-service`, `queue-processor-service`                                                         | ComputersPage, Settings                 |
| Projects / repos | `project-service`, `config-store` paths                                                                    | Settings, repo pickers                  |
| Integrations     | `jira-service`                                                                                             | Jira views (where enabled)              |

## Data flow (typical poll cycle)

1. `main.js` timer calls each provider service’s discovery methods.
2. Results normalized to a shared agent/task shape and sent via `agents:get-all`.
3. Renderer `AppContext` holds list state; pages filter/paginate locally.
4. On completion transitions, renderer may show toast + sound.

## Mobile sync (optional)

When Cloudflare KV is configured, desktop instances heartbeat and expose API keys/repos to authorized mobile clients. Mobile does **not** run local CLIs; it enqueues work for a selected desktop.

## Deeper documentation

- [docs/DESIGN.md](docs/DESIGN.md) — product and UX principles
- [docs/FRONTEND.md](docs/FRONTEND.md) — React/Tailwind conventions
- [docs/SECURITY.md](docs/SECURITY.md) — secrets, IPC, markdown XSS
- [docs/RELIABILITY.md](docs/RELIABILITY.md) — polling, I/O, failure modes
- [docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md) — domain health grades
- [docs/design-docs/core-beliefs.md](docs/design-docs/core-beliefs.md) — agent-first operating rules
