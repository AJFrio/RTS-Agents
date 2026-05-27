# Tech debt tracker

Synced from [UPDATES.md](../../UPDATES.md) performance findings. Remove items here when fixed and delete matching UPDATES bullets.

## Performance / architecture

| ID | Issue | Suggested fix | Priority |
|----|-------|---------------|----------|
| TD-001 | Sync FS in Gemini/Claude/Project services blocks main thread | `fs.promises` + `Promise.all` in discovery | High |
| TD-002 | 30s full poll rescans everything | File watchers or mtime cache | High |
| TD-003 | Full agent list over IPC every poll | Pagination or delta updates | Medium |

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

_Partial TD-001 (2026-05-26): Claude session scan paths use `fs.promises`; Gemini discovery was already async. Remaining sync checks: `existsSync` for install probes and infrequent project-service paths._
