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

## Run broadcasting (shared KV run log)

- The KV `runs` value is a shared run log (array, newest-first, capped at
  200) so any device — desktop or web — can see all runs across cloud and
  local machines. Run shape: `{ id, deviceId, deviceName, provider, name,
  status, repo, branch, prUrl, createdAt, updatedAt }`.
- A remote dispatch is just a queued request; the target device executes it
  as a local run (queue-processor → the same CLI `startSession` paths). Its
  status transitions (`starting` → `running`, `completed`, `failed`) are
  upserted into `runs` with ids prefixed `remote:`.
- Local runs are broadcast by each device: main.js broadcasts the discovery
  cache snapshot to `runs` on every heartbeat and on debounced snapshot
  changes (`run-broadcaster-service.js`, ids prefixed `<deviceId>:`).
- Read path: desktop `runs:get` IPC + preload `getRuns`; web
  `web-cloudflare-sync.getRuns`. The Devices page detail shows a device's
  recent runs from this log (local and remote devices alike).

## Limitations (documented)

- No local Antigravity/Claude CLI execution on phone
- GitHub on mobile is read-oriented vs desktop

## Implementation pointers

- `src/renderer/pages/NewTaskPage.jsx` (remote agents/repos from device tools)
- `src/renderer/platform/web-agent-hub.mjs`, `src/renderer/platform/providers/cloudflare-kv-service.mjs` (web enqueue + runs read)
- `cloudflare-kv-service.js`, `run-broadcaster-service.js`, `headless.js`, `queue-processor-service.js`, `src/main/ipc/provider-registry.js`
- Contract tests: `tests/unit/web-remote-dispatch.verify.mjs`, `tests/unit/queue-processor-service.test.js`, `tests/unit/run-broadcaster-service.test.js`
