# Spec: ACP-based local agent dispatch

**Status:** Verified

## Requirement

Local CLI-backed agents that support the Agent Client Protocol (Claude Code, Codex, OpenCode, Cursor CLI) are dispatched over ACP (JSON-RPC 2.0 NDJSON over stdio, protocol version 1) so task output streams live into the dashboard instead of running fire-and-forget.

## Behavior

- When an ACP adapter is available, task dispatch runs `initialize → session/new → session/prompt` against the adapter:
  - Claude Code via `claude-agent-acp` (auto-allows only read/edit/execute tool kinds, matching the legacy `--allowedTools Read,Edit,Bash` policy)
  - Codex via `codex-acp` (auto-allows permissions; matches the legacy `--sandbox workspace-write` permissiveness)
  - OpenCode via its native `opencode acp` subcommand
  - Cursor CLI via `agent acp` (legacy binary `cursor-agent acp`); auth uses the CLI's stored Cursor login
- Streamed `agent_message_chunk` updates are coalesced into a single flowing assistant message per turn (token-level chunks never render as separate blocks).
- The task card resolves as soon as the ACP session is created; the task completes/fails when the prompt turn returns.
- Permission requests from the agent are answered automatically per provider policy; unknown agent→client requests are answered with JSON-RPC `-32601` so the agent cannot hang.
- If the adapter is missing or fails before any agent work begins (spawn error, initialize failure/timeout, version mismatch, exit before prompt), dispatch falls back to the legacy detached-CLI path where one exists (Claude, Codex, OpenCode). Cursor has no legacy path: pre-start failures surface as errors. Failures after the prompt was sent mark the task failed and never re-dispatch (no double execution).
- An explicit custom CLI command (headless/CLI settings) opts out of ACP for Claude, Codex, and OpenCode.
- Tracked ACP sessions persist across restarts (`opencodeSessions`, `codexThreads`, `claudeCliSessions`, `cursorCliSessions`).
- Local install detection requires a runnable CLI or real session data; a bare `~/.claude`/`~/.codex` directory created by other tooling does not mark the provider installed.

## Acceptance criteria

- [ ] With an adapter installed, a new local task streams assistant output into task details while running
- [ ] Task status transitions running → completed/failed when the ACP prompt turn ends
- [ ] Without an adapter, dispatch behaves exactly as before (detached CLI spawn, no streaming)
- [ ] ACP failure after prompt start never re-runs the prompt through the legacy path

## Implementation pointers

- `src/main/services/acp-service.js` — stdio JSON-RPC client, adapter probing, permission policies
- `tests/fixtures/fake-acp-adapter.js` — scriptable fake ACP agent used by `tests/unit/acp-service.test.js`
- `src/main/services/claude-service.js`, `codex-service.js`, `opencode-service.js`, `cursor-service.js` — dispatch branches and tracked-session persistence
- `src/renderer/components/ui/ChatTranscript.jsx` + `src/renderer/utils/transcript.js` — grouped transcript rendering
- The official `@agentclientprotocol/sdk` is ESM-only, hence the hand-rolled CommonJS client
