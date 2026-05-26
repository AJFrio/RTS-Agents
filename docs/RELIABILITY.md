# Reliability

## Known risks (see also UPDATES.md / tech-debt-tracker)

1. **Synchronous FS in main** — `gemini-service`, `claude-service`, `project-service` use sync `fs` in discovery loops → main-thread stalls at scale.
2. **Full-list polling** — Periodic refresh rescans and ships entire agent lists over IPC → renderer churn.
3. **Orchestrator recursion** — `agent-orchestrator.chat` uses recursion for tool turns; prefer iterative loop for deep chains.

## Operational expectations

| Area | Target | Notes |
|------|--------|-------|
| App boot | Interactive window after `ready-to-show` | Services init after first paint |
| Poll interval | User-configurable (Settings) | Default ~30s; disable when not needed |
| Cloudflare heartbeat | 5 min | Devices marked offline after ~6 min stale |
| Provider errors | Per-provider error object in responses | UI shows Offline/Error, not silent fail |

## Failure handling

- Services: try/catch, return `{ error: message }` or empty lists — do not throw through IPC unless unrecoverable.
- GitHub/Jira: surface HTTP status in renderer banners (`ErrorBanner`).
- Headless mode: log failures, continue queue processing where possible.

## Testing for regressions

- `npm run test` — unit tests for services, markdown, orchestrator
- `npm run test:e2e` — Playwright (Linux CI uses xvfb; Windows: `npx playwright test`)
- After I/O refactors: run `tests/performance/claude-service.bench.js` if touching discovery

## Future improvements (encoded as debt)

- File watchers (`chokidar`) or mtime-based incremental scan
- Paginated / incremental IPC for agent lists
- Structured logging in main (single format, no secrets)
