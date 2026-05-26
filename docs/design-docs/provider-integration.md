# Provider integration

**Status:** Verified

## Provider types

| Type | Examples | Config | Discovery |
|------|----------|--------|-----------|
| Cloud API key | Jules, Cursor cloud, Codex, Claude cloud | Settings → API keys | HTTP list/create endpoints |
| Local CLI | Gemini, Claude CLI, Codex local, OpenCode | CLI on PATH + repo paths | Scan session dirs under user home |
| Hybrid | Cursor (local paths + cloud API) | Both | Combined in aggregator |

## Adding a cloud provider

1. Create `src/main/services/<name>-service.js` (singleton `module.exports = new Service()`).
2. Use `config-store` for `hasApiKey` / get key; use `http-service` for fetch wrapper.
3. Register discovery + create handlers in `main.js` poll/creation paths.
4. Add entry to `src/renderer/components/settings/service-catalog.js`.
5. Add unit tests under `tests/unit/<name>-service.test.js`.
6. Update README “Keys required” and `docs/product-specs/`.

## Adding a local CLI provider

1. Detect install via home-dir markers or `which`/`where` pattern used by siblings.
2. Implement `getAllAgents` / `startSession` (or equivalent) without blocking the event loop when possible (`fs.promises`).
3. Wire New Task modal branch in renderer.
4. Document CLI flags and PATH requirements in README.

## Normalized task shape

Provider services should map to the common list shape consumed by the dashboard (id, provider, status, title, timestamps, repo hints). Match fields used in existing services before inventing new names.

## Mobile

If the provider requires local CLI, mobile only **queues** work to a desktop via Cloudflare — implement dispatch in orchestrator/KV path, not in PWA execution.
