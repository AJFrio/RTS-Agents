# Spec: Mobile remote dispatch

**Status:** Verified

## Requirement

The mobile PWA views tasks and dispatches work to registered desktop instances via Cloudflare KV — it does not run local CLIs.

## Acceptance criteria

- [ ] Dashboard reflects synced state when KV configured
- [ ] User can select a computer and enqueue a task
- [ ] Desktop headless or full app processes queue items
- [ ] Without KV, mobile shows configuration guidance

## Limitations (documented)

- No local Antigravity/Claude CLI execution on phone
- GitHub on mobile is read-oriented vs desktop

## Implementation pointers

- `mobile-webapp/src/services/agent-orchestrator-service.ts`
- `cloudflare-kv-service.js`, `headless.js`, `queue-processor-service.js`
