# RTS Agents — Agent map

**RTS Agents** is an Electron agent-orchestration dashboard: monitor and dispatch coding tasks across Jules, Cursor, Gemini, Claude, Codex, OpenCode, GitHub, and multi-device Cloudflare sync.

This file is the **table of contents**. Detailed guidance lives under `docs/` (system of record). Do not duplicate long manuals here.

## Start here

| Step | Action |
|------|--------|
| 1 | Read [ARCHITECTURE.md](ARCHITECTURE.md) for boundaries and domains |
| 2 | Pick a task type → [docs/PLANS.md](docs/PLANS.md) and [UPDATES.md](UPDATES.md) |
| 3 | Follow domain docs below before editing code |

## Repository layout

```
main.js, preload.js          # Electron entry + IPC bridge
src/main/services/           # Provider & orchestration (CommonJS)
src/renderer/                # React UI (ESM, Vite)
mobile-webapp/               # PWA + Cloudflare Worker (separate package)
tests/                       # Jest unit/integration, Playwright e2e
docs/                        # Knowledge base (design, specs, plans)
```

## Documentation index

| Topic | Path |
|-------|------|
| Architecture map | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Design & UX | [docs/DESIGN.md](docs/DESIGN.md) |
| Frontend rules | [docs/FRONTEND.md](docs/FRONTEND.md) |
| Security | [docs/SECURITY.md](docs/SECURITY.md) |
| Reliability / perf debt | [docs/RELIABILITY.md](docs/RELIABILITY.md), [docs/exec-plans/tech-debt-tracker.md](docs/exec-plans/tech-debt-tracker.md) |
| Quality grades | [docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md) |
| Product context | [docs/PRODUCT_SENSE.md](docs/PRODUCT_SENSE.md) |
| Planning workflow | [docs/PLANS.md](docs/PLANS.md) |
| Harness guide | [docs/HARNESS.md](docs/HARNESS.md) |
| Design doc catalog | [docs/design-docs/index.md](docs/design-docs/index.md) |
| Agent-first principles | [docs/design-docs/core-beliefs.md](docs/design-docs/core-beliefs.md) |
| IPC boundaries | [docs/design-docs/electron-ipc.md](docs/design-docs/electron-ipc.md) |
| New provider guide | [docs/design-docs/provider-integration.md](docs/design-docs/provider-integration.md) |
| Feature specs | [docs/product-specs/index.md](docs/product-specs/index.md) |
| User-facing setup | [README.md](README.md) |

## Coding standards (summary)

- **2 spaces**, **semicolons** everywhere.
- **Main**: CommonJS, singleton services in `src/main/services/`.
- **Renderer**: React hooks, ESM, Tailwind + `dark:` + `slate` palette, `AppContext` for shared state.
- **Files**: kebab-case modules; PascalCase component filenames.
- **Secrets**: `config-store` / electron-store only — never commit keys.
- **IPC**: renderer ↔ main only via `preload.js`; validate paths and inputs in main.

Full conventions were previously inlined here; see [docs/FRONTEND.md](docs/FRONTEND.md) and [docs/design-docs/core-beliefs.md](docs/design-docs/core-beliefs.md).

## Testing & verification

```powershell
npm run validate          # docs + lint + unit tests
npm run test              # Jest
npm run lint              # ESLint (desktop root)
npx playwright test       # E2E on Windows
```

- Unit tests: `tests/unit/`
- E2E: `tests/e2e/` — CI uses Linux + xvfb; locally on Windows use `npx playwright test` (see README).
- After **markdown** changes: `tests/unit/markdown.verify.js`
- UI changes: verify **light and dark** mode.

## Workflow

- **UPDATES.md**: active task bullets for agents; **remove lines when done**.
- **Exec plans**: multi-step work in `docs/exec-plans/active/`, archive to `completed/`.
- **Commits**: descriptive messages; no `dist/` or secrets.
- **Mobile**: separate `mobile-webapp/` — replicate behavior only when the feature applies remotely.

## Gotchas

- Custom markdown parser: [src/renderer/utils/markdown.js](src/renderer/utils/markdown.js) — XSS-sensitive.
- Sync filesystem scans in several services block the main process — see tech-debt tracker before adding more.
- `main.js` is large; new IPC should stay thin and delegate to services.

## Harness maintenance

This repo uses [harness engineering](https://openai.com/index/harness-engineering/): structured docs, validators, and CI. When adding features, update the relevant spec under `docs/product-specs/` and run `npm run validate:docs`.
