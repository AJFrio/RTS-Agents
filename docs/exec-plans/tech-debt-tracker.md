# Tech debt tracker

Synced from [UPDATES.md](../../UPDATES.md) performance findings. Remove items here when fixed and delete matching UPDATES bullets.

## Performance / architecture

| ID | Issue | Suggested fix | Priority |
|----|-------|---------------|----------|
| TD-001 | Sync FS in Gemini/Claude/Project services blocks main thread | `fs.promises` + `Promise.all` in discovery | High |
| TD-002 | 30s full poll rescans everything | File watchers or mtime cache | High |
| TD-003 | Full agent list over IPC every poll | Pagination or delta updates | Medium |
| TD-004 | Orchestrator `chat` uses recursion for tools | Iterative while-loop with depth cap | Medium |
| TD-005 | `getLocalRepos` sync in loop | Async parallel directory reads | Medium |

## Harness / DX

| ID | Issue | Suggested fix | Priority |
|----|-------|---------------|----------|
| TD-010 | Root app had no ESLint | Added `eslint.config.js` — extend rules over time | Low |
| TD-011 | E2E script Linux-specific (`xvfb-maybe`) | CI uses Linux; document Windows `npx playwright test` | Low |
| TD-012 | `main.js` monolith (~1600+ lines) | Extract IPC registration modules | Low |
| TD-013 | `cloudflare-kv-service.test.js` references removed `putKey` API | Rewrite tests for current KV service surface | Medium |
| TD-014 | `mobile-webapp` ESLint has 29+ errors | Fix or relax rules; re-enable `npm run lint` in CI | Medium |
| TD-015 | Playwright Electron E2E fails in GHA | Install Linux deps + xvfb; remove `continue-on-error` on e2e job | Medium |

## Completed

_Move rows here with date when done._
