# Security

## Secrets

| Asset | Storage | Never |
|-------|---------|-------|
| API keys (Jules, Cursor, OpenAI, Anthropic, GitHub, Jira, Cloudflare) | `electron-store` via `config-store.js` | Commit to git, log in console in production |
| Encryption key for store | Hardcoded in app (obfuscation only) | Treat as strong encryption |

Mobile may sync keys through Cloudflare KV when user explicitly configures sync — treat KV namespace as sensitive infrastructure.

## IPC surface

- `contextIsolation: true`, `nodeIntegration: false` in `main.js`.
- Renderer accesses main only through `preload.js` `contextBridge`.
- New handlers: validate inputs (paths, IDs, provider enums) in main before calling services.
- **Path traversal**: `project-service` and path pickers must reject `..` and non-directory paths outside allowed roots.

## Network

- All provider calls originate from main process services.
- Use HTTPS endpoints only; do not disable TLS verification.
- GitHub token: minimum scopes (`repo`, `read:user` as documented in README).

## Renderer XSS

- Agent and PR content may contain markdown from external agents.
- `markdown.js` + DOMPurify (where used) are security boundaries — review both on changes.
- Do not use `dangerouslySetInnerHTML` with unsanitized provider HTML.

## Dependencies

- Run `npm audit` periodically; CI does not yet gate on audit (see QUALITY_SCORE.md).
- Prefer well-known packages; pin major versions in lockfiles.

## Reporting

Document security issues in exec plans or private channel per project owner policy; do not paste live tokens into issues or docs.
