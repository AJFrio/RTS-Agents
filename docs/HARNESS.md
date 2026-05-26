# Engineering harness

RTS Agents adopts the [harness engineering](https://openai.com/index/harness-engineering/) model: **humans steer, agents execute**, with the repository as the system of record.

## Quick commands

```powershell
npm run validate          # docs + architecture + lint + unit tests (no integration)
npm run validate:docs     # knowledge-base structure
npm run validate:architecture
npm run lint
npm run test:ci           # Jest, skips tests/integration (machine-local FS)
npm run test              # full Jest including integration
```

Mobile app (from `mobile-webapp/`): `npm run lint`, `npm run typecheck`.

## Layout

| Path | Purpose |
|------|---------|
| [AGENTS.md](../AGENTS.md) | Entry map (~100 lines) |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | System boundaries |
| [docs/design-docs/](design-docs/) | IPC, providers, core beliefs |
| [docs/product-specs/](product-specs/) | Verifiable feature behavior |
| [docs/exec-plans/](exec-plans/) | Active/completed plans + tech debt |
| [scripts/validate-*.js](../scripts/) | Mechanical doc/architecture checks |

## Agent workflow

1. Read `AGENTS.md` → relevant `docs/*` spec or design doc.
2. For multi-surface work, add `docs/exec-plans/active/YYYY-MM-DD-name.md`.
3. Implement; run `npm run validate` before claiming done.
4. Update specs/QUALITY_SCORE if behavior or grades change.
5. Remove completed bullets from [UPDATES.md](../UPDATES.md).

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on push/PR to `main`: desktop validate + lint + `test:ci`, mobile lint + typecheck, Playwright e2e on Linux.

## Gardening

Periodically: align docs with code, tighten ESLint from `warn` → `error` per directory, add generators under `docs/generated/`, and pay items in [exec-plans/tech-debt-tracker.md](exec-plans/tech-debt-tracker.md).
