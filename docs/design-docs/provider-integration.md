# Provider integration

**Status:** Verified

## Provider types

| Type          | Examples                                            | Config                   | Discovery                                   |
| ------------- | --------------------------------------------------- | ------------------------ | ------------------------------------------- |
| Cloud API key | Jules, Cursor cloud, Claude cloud                   | Settings → API keys      | HTTP list/create endpoints                  |
| Local CLI     | Antigravity, Claude CLI, Codex CLI, OpenCode        | CLI on PATH + repo paths | Scan session dirs or tracked local launches |
| Hybrid        | Cursor (local paths + cloud API)                    | Both                     | Combined in aggregator                      |

## Current provider contracts

| Provider         | Health probe                                                          | Auth / install                                             | Notes                                                                                                |
| ---------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Jules            | `GET https://jules.googleapis.com/v1alpha/sources?pageSize=1`         | `X-Goog-Api-Key`                                           | API is alpha; sources must be connected in Jules first. Detail view loads activity text via `listActivities` (media bytes stripped), then lazy-loads `Artifact.media` per activity through `GET .../activities/{id}`. |
| Cursor           | `GET https://api.cursor.com/v1/me`                                    | Basic auth with `apiKey:` (Bearer also accepted by Cursor) | Cloud Agents API **v1** (replaced v0; there is no Cloud v2). Durable agents plus runs; list responses use `items`. Local Cursor CLI uses ACP (`agent acp`), not this HTTP API. |
| Codex CLI        | `codex --version`; launch with `codex exec --sandbox workspace-write` | CLI on PATH or configured command                          | Local coding-agent path. No OpenAI Responses / Assistants cloud integration.                         |
| Claude Cloud     | `GET https://api.anthropic.com/v1/models`                             | `x-api-key` + `anthropic-version`                          | Avoid billed message calls for health checks.                                                        |
| Claude CLI       | `claude` install / `~/.claude/projects`                               | CLI or session directory                                   | Local tasks prefer ACP (`claude-agent-acp`, then `claude acp` / `--acp`). Windows probes/spawns go through `cli-spawn`. Sessions are JSONL under `~/.claude/projects`. |
| Antigravity CLI  | `agy --version`; ACP if `agy acp` / `agy --acp` exists; else `agy --print` | CLI on PATH or configured command                          | Official ACP flags only. No unofficial PTY wrapper.                                                  |
| OpenCode         | `opencode --version`; ACP via `opencode acp`; fallback `opencode run` | CLI on PATH or configured command                          | Windows `.cmd` shims must use `cli-spawn`. Details load via `export`; terminal resume via `utils:open-opencode-session`. |
| GitHub           | `GET https://api.github.com/user`                                     | `Authorization: Bearer` PAT + API version header           | Needs scopes/permissions for repo and PR operations.                                                 |
| Jira             | `GET /rest/api/3/myself`                                              | Basic `email:api_token` against Jira base URL              | Atlassian API tokens may expire; surface that in errors.                                             |
| OpenRouter       | `GET https://openrouter.ai/api/v1/models`                             | `Authorization: Bearer`                                    | Used for orchestrator models/chat, not dashboard agent discovery.                                    |
| Cloudflare KV    | `GET /client/v4/accounts/:accountId/storage/kv/namespaces`            | Account ID + API token with Workers KV Storage permissions | Used for sync and remote queues. Never retry with disabled TLS verification.                         |

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
