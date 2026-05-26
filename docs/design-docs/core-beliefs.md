# Core beliefs (agent-first)

These principles guide humans and coding agents working in RTS Agents.

## 1. Repository is the system of record

Decisions, architecture, plans, and acceptance criteria live in `docs/` and versioned markdown — not only chat or README fragments. If it isn’t in the repo, treat it as unknown.

## 2. AGENTS.md is a map, not a manual

Read `AGENTS.md` first, then follow links. Do not expect every rule in one file.

## 3. Boundaries beat style debates

- Renderer ↔ main only via preload IPC.
- Provider logic in `src/main/services/`.
- Secrets only in `config-store` / Cloudflare KV when explicitly synced.

## 4. Validate at boundaries

Parse and validate IPC inputs, API responses, and file paths before use. Do not guess provider payload shapes.

## 5. Prefer boring, inspectable patterns

CommonJS in main, ESM in renderer, singleton services — match existing files. Reuse `http-service` patterns for HTTP.

## 6. Continuous small debt paydown

When you touch sync FS or polling, consider fixing or filing `docs/exec-plans/tech-debt-tracker.md`. Do not add new blocking sync scans without note.

## 7. User-visible quality

Light/dark mode, clear offline reasons, and tests for security-sensitive utils (markdown) are part of “done.”

## 8. Harness maintenance

Run `npm run validate:docs` and `npm run test` before claiming completion. Update QUALITY_SCORE when materially improving a domain.
