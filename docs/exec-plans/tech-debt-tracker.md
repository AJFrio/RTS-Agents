# Tech debt tracker

Synced from [UPDATES.md](../../UPDATES.md) performance findings. Remove items here when fixed and delete matching UPDATES bullets.

## Performance / architecture

| ID | Issue | Suggested fix | Priority |
|----|-------|---------------|----------|
## Harness / DX

| ID | Issue | Suggested fix | Priority |
|----|-------|---------------|----------|
| TD-010 | Root app had no ESLint | Added `eslint.config.js` — extend rules over time | Low |
| TD-011 | E2E script Linux-specific (`xvfb-maybe`) | CI uses Linux; document Windows `npx playwright test` | Low |
| TD-014 | `mobile-webapp` ESLint has 29+ errors | Fix or relax rules; re-enable `npm run lint` in CI | Medium |

## Completed

| ID | Fixed | Notes |
|----|-------|-------|
| TD-004 | 2026-05-26 | `AgentOrchestrator.chat` uses iterative tool loop with `maxToolTurns` cap |
| TD-005 | 2026-05-26 | `ProjectService.getLocalRepos` already async with `Promise.all` |
| TD-013 | 2026-05-26 | KV unit tests target `putValue` / `getValueText`; re-enabled in `test:ci` |
| TD-015 | 2026-05-26 | Removed `continue-on-error` on GHA e2e job (xvfb-maybe unchanged) |
| TD-012 | 2026-05-26 | IPC handlers in `src/main/ipc/register-*.js`; preload split under `src/preload/` |
| TD-001 | 2026-05-26 | Async install probes (`pathExists`); ProjectService uses async existence checks |
| TD-002 | 2026-05-26 | `agent-discovery-fingerprint` + `fs.watch` debounce; skip fetch when fingerprint stable |
| TD-003 | 2026-05-26 | `agents:get-all` revision + delta; renderer `MERGE_AGENTS_DELTA`; `React.memo` on cards |
