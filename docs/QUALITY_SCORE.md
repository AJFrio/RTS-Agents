# Quality Score

Graded **B** = acceptable for daily use, **C** = works but known debt, **D** = risky / needs investment. Updated during harness gardening; agents should refresh when touching a domain.

| Domain                                             | Layer           | Grade | Gaps                                                   |
| -------------------------------------------------- | --------------- | ----- | ------------------------------------------------------ |
| Dashboard / task list                              | Renderer + IPC  | B     | Delta IPC; filter still runs on merge                  |
| Agent discovery (CLI)                              | Main services   | B     | Mtime cache + watchers; cloud still polled on interval |
| Cloud providers (Jules, Cursor, Codex, Claude API) | Main services   | B     | Error UX varies by provider                            |
| Agent orchestrator                                 | Main            | B     | Recursive tool loop; depth limits                      |
| GitHub PR utilities                                | Main + renderer | B     | Token scope docs only in README                        |
| Settings / onboarding                              | Renderer        | B     | Service catalog maintained manually                    |
| Cloudflare multi-device                            | Main + KV       | C     | Requires manual KV setup                               |
| Mobile PWA                                         | mobile-webapp   | B     | ESLint present; fewer E2E tests                        |
| Documentation harness                              | docs/ + CI      | B     | New scaffold; validators basic                         |
| Security (XSS, secrets)                            | Cross-cutting   | B     | Markdown parser is custom                              |
| CI / lint                                          | Repo            | C     | Desktop ESLint new; E2E Linux-only in script           |

## How to improve a grade

1. Fix items in [exec-plans/tech-debt-tracker.md](exec-plans/tech-debt-tracker.md).
2. Add or extend tests in `tests/unit/` or `tests/e2e/`.
3. Update this table in the same PR as the fix.
