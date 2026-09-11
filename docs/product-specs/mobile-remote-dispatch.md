# Spec: Mobile remote dispatch

**Status:** Verified

## Requirement

The mobile PWA views tasks and dispatches work to registered desktop instances via Cloudflare KV — it does not run local CLIs.

## Acceptance criteria

- [x] Dashboard reflects synced state when KV configured
- [x] User can select a computer and enqueue a task
- [x] Desktop headless or full app processes queue items
- [x] Without KV, mobile shows configuration guidance

## Contract details

- Remote-run agents come from the target device's heartbeat `tools[0]['CLI tools']`
  (mapped to `antigravity` / `claude-cli` / `codex` / `opencode`), never from the
  browser's local CLI capabilities — the web runtime has none.
- Queued task shape (both web and desktop senders): `{ id, tool, repo: { path },
prompt, attachments, model, autoCreatePr, branch, requestedBy, createdAt }`.
  The queue processor reads `repo.path`; `autoCreatePr: true` appends a
  commit/push/PR/merge directive to the dispatched prompt.
- Remote repo options come from the device's heartbeat `repos` (path-carrying
  entries); desktop falls back to its local repo catalog when devices report
  name-only summaries.

## Limitations (documented)

- No local Antigravity/Claude CLI execution on phone
- GitHub on mobile is read-oriented vs desktop

## Implementation pointers

- `src/renderer/pages/NewTaskPage.jsx` (remote agents/repos from device tools)
- `src/renderer/platform/web-agent-hub.mjs`, `src/renderer/platform/providers/cloudflare-kv-service.mjs` (web enqueue)
- `cloudflare-kv-service.js`, `headless.js`, `queue-processor-service.js`, `src/main/ipc/provider-registry.js`
- Contract tests: `tests/unit/web-remote-dispatch.verify.mjs`, `tests/unit/queue-processor-service.test.js`
