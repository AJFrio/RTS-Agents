# Spec: ACP-based local agent dispatch

**Status:** Verified

## Requirement

Local CLI-backed agents that support the Agent Client Protocol (Claude Code, Codex, OpenCode, Cursor CLI, and Antigravity when it exposes official ACP flags) are dispatched over ACP (JSON-RPC 2.0 NDJSON over stdio, **protocol version 1**) so task output streams live into the dashboard instead of running fire-and-forget.

ACP **v2 is a draft** (July 2026). RTS sends `protocolVersion: 1`. If an adapter answers with any other version, dispatch fails with `fallbackAllowed: true` and uses the detached CLI when one exists. Do not implement the draft v2 prompt lifecycle.

Cursor **Cloud Agents API** is a separate HTTP API at `/v1` (there is no Cloud v2). Cloud tasks do not use ACP.

## Behavior

- When an ACP adapter is available, task dispatch runs `initialize → session/new → [session/set_mode] → session/prompt` against the adapter and **keeps the child alive** so later turns can reuse the same session:
  - Claude Code via `claude-agent-acp`, then native `claude acp` / `claude --acp` if those probes succeed (auto-allows only read/edit/execute tool kinds, matching the legacy `--allowedTools Read,Edit,Bash` policy)
  - Codex via `codex-acp`, then native `codex acp` if present (auto-allows permissions; matches the legacy `--sandbox workspace-write` permissiveness)
  - OpenCode via its native `opencode acp` subcommand
  - Cursor CLI via `agent acp` (legacy binary `cursor-agent acp`); auth uses the CLI's stored Cursor login
  - Antigravity via official `agy acp` or `agy --acp` only; otherwise detached `agy --print`. No unofficial PTY wrappers.
- Windows npm `.cmd`/`.bat` shims are spawned through `cmd.exe` (`src/main/utils/cli-spawn.js`). Install probes and legacy fallbacks use the same helper so EINVAL cannot block task start.
- Streamed `agent_message_chunk` updates are coalesced into a single flowing assistant message per turn (token-level chunks never render as separate blocks).
- The task card resolves as soon as the ACP session is created; the task completes/fails when the prompt turn returns. The adapter stays running so a follow-up can send another `session/prompt`.
- Follow-ups use the existing `tasks:send-message` path. Local providers (`claude-cli`, `codex`, `opencode`, `antigravity`, and Cursor `cursor-cli-*` ids) append a user turn and accept the next prompt immediately; the reply streams into the same transcript. If the child is gone and `initialize` advertised `loadSession`, RTS reconnects with `session/load` using the persisted `acpSessionId`. Legacy detached CLI sessions do not support follow-ups.
- `runPrompt` remains a one-shot `connect → prompt → close` wrapper. Live sessions are closed on app quit (`acpService.closeAll`).
- Permission requests from the agent are answered automatically per provider policy; unknown agent→client requests are answered with JSON-RPC `-32601` so the agent cannot hang.
- If the adapter is missing or fails before any agent work begins (spawn error, initialize failure/timeout, version mismatch, exit before prompt), dispatch falls back to the legacy detached-CLI path where one exists (Claude, Codex, OpenCode, Antigravity). Cursor has no legacy path: pre-start failures surface as errors. Failures after the prompt was sent mark the task failed and never re-dispatch (no double execution).
- An explicit custom CLI command (headless/CLI settings) opts out of ACP for Claude, Codex, OpenCode, and Antigravity.
- Tracked ACP sessions persist across restarts (`opencodeSessions`, `codexThreads`, `claudeCliSessions`, `cursorCliSessions`, `antigravitySessions`).
- Local install detection requires a runnable CLI or real session data; a bare `~/.claude`/`~/.codex` directory created by other tooling does not mark the provider installed.

## Acceptance criteria

- [ ] With an adapter installed, a new local task streams assistant output into task details while running
- [x] Task status transitions running → completed/failed when the ACP prompt turn ends
- [ ] Without an adapter, dispatch behaves exactly as before (detached CLI spawn, no streaming)
- [ ] ACP failure after prompt start never re-runs the prompt through the legacy path
- [ ] On Windows, `.cmd` CLIs start via `cli-spawn` (no EINVAL toast on legacy fallback)
- [ ] After an ACP turn completes, the task-detail composer can send another prompt on the same session
- [ ] Follow-up after process death resumes via `session/load` when the adapter advertised `loadSession`; otherwise the composer stays hidden (`canFollowUp: false`)

## Implementation pointers

- `src/main/utils/cli-spawn.js` — Windows-safe spawn/probe helpers
- `src/main/services/acp-service.js` — stdio JSON-RPC client, `connect`/`prompt`/`close`, live-session map, adapter probing, permission policies
- `src/main/services/acp-follow-up.js` — shared follow-up accept + status patch helper
- `tests/fixtures/fake-acp-adapter.js` — scriptable fake ACP agent used by `tests/unit/acp-service.test.js`
- `src/main/services/claude-service.js`, `codex-service.js`, `opencode-service.js`, `cursor-service.js`, `antigravity-service.js` — dispatch branches and tracked-session persistence
- `src/renderer/components/ui/ChatTranscript.jsx` + `src/renderer/utils/transcript.js` — grouped transcript rendering
- The official `@agentclientprotocol/sdk` is ESM-only, hence the hand-rolled CommonJS client
