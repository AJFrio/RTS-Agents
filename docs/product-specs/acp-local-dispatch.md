# Spec: ACP-based local agent dispatch

**Status:** Verified (one-shot dispatch; Claude Code follow-ups and session resume verified end-to-end against a real `claude-agent-acp`) / Unverified for Codex and Cursor CLI adapters, which were not installed on the machine used for testing

## Requirement

Local CLI-backed agents that support the Agent Client Protocol (Claude Code, Codex, OpenCode, Cursor CLI) are dispatched over ACP (JSON-RPC 2.0 NDJSON over stdio, protocol version 1) so task output streams live into the dashboard instead of running fire-and-forget.

## Behavior

- When an ACP adapter is available, task dispatch runs `initialize → session/new → session/prompt` against the adapter:
  - Claude Code via `claude-agent-acp` (auto-allows only read/edit/execute tool kinds, matching the legacy `--allowedTools Read,Edit,Bash` policy)
  - Codex via `codex-acp` (auto-allows permissions; matches the legacy `--sandbox workspace-write` permissiveness)
  - OpenCode via its native `opencode acp` subcommand
  - Cursor CLI via `agent acp` (legacy binary `cursor-agent acp`); auth uses the CLI's stored Cursor login
- Streamed `agent_message_chunk` updates are coalesced into a single flowing assistant message per turn (token-level chunks never render as separate blocks).
- The adapter process stays alive after the opening turn so the user can send follow-up prompts into the same conversation from the task modal (`session/prompt` again on the same `sessionId`). Live sessions are held in a registry keyed by task id and are torn down on idle timeout (30 min default), adapter exit, or app quit.
- When no live adapter remains (restart, crash, idle reap), a follow-up transparently resumes the stored session via ACP `session/load`. The client checks the adapter's `loadSession` capability first, as the spec requires, and reports a clear error rather than silently starting a fresh conversation that has lost all prior context. A resumed adapter replays the prior conversation as `session/update` notifications before the load completes.
- The adapter's own session id is persisted per task (`acpSessionId`; OpenCode reuses its existing `opencodeSessionId`) so resume survives an app restart.
- Claude CLI sessions discovered by scanning the transcripts directory are also resumable, retroactively: the `.jsonl` filename is the ACP session id. The project directory is read from the transcript's `cwd` field rather than reversed from the dash-encoded folder name, which is ambiguous for any directory containing a dash. Verified against a real `claude-agent-acp`: prompting a loaded session appends to the original transcript rather than forking, so the follow-up appears in the existing conversation.
- Follow-up availability is a point-in-time question (`tasks:can-send-message`): a task qualifies if its adapter is live *or* it has a resumable session id.
- All four ACP providers (Claude Code, Codex, OpenCode, Cursor CLI) support interactive follow-ups through one shared controller (`acp-follow-up.js`). Antigravity does not: it is a fire-and-forget `--print` spawn with no ACP path, so it remains read-only.
- A follow-up appends the user's message to the transcript before prompting, which also breaks the assistant chunk-merge so the next reply is not concatenated onto the previous one.
- Unattended one-shot dispatch (`acpService.runPrompt`) is unchanged: it opens a session, sends exactly one prompt, and always disposes the adapter.
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
- [ ] A follow-up sent from the task modal continues the same session without respawning the adapter
- [ ] The follow-up composer is hidden for tasks with no live session (restart, crash, idle reap) and for providers without follow-up support
- [ ] Live adapters are disposed on app quit and after the idle timeout
- [ ] A follow-up after an app restart resumes the prior conversation via session/load rather than starting a fresh one
- [ ] An adapter without the loadSession capability produces a clear error and no partial transcript entry
- [x] A follow-up to a Claude CLI session discovered on disk resumes it and appends to the original transcript (verified: 3 turns, 3 adapter processes, one file)

## Implementation pointers

- `src/main/services/acp-service.js` — stdio JSON-RPC client, adapter probing, permission policies; `openSession` (long-lived, multi-turn) with `runPrompt` as the one-shot wrapper
- `src/main/services/acp-session-registry.js` — live session registry with idle reaping
- `src/main/services/acp-follow-up.js` — shared follow-up controller (live-session vs. session/load resume) used by all four ACP providers
- `src/main/ipc/provider-registry.js` — `sendTaskMessage` / `canSendTaskMessage` follow-up routing
- `src/renderer/components/task/FollowUpComposer.jsx` — composer, gated on `tasks:can-send-message`
- `tests/fixtures/fake-acp-adapter.js` — scriptable fake ACP agent used by `tests/unit/acp-service.test.js`
- `src/main/services/claude-service.js`, `codex-service.js`, `opencode-service.js`, `cursor-service.js` — dispatch branches and tracked-session persistence
- `src/renderer/components/ui/ChatTranscript.jsx` + `src/renderer/utils/transcript.js` — grouped transcript rendering
- The official `@agentclientprotocol/sdk` is ESM-only, hence the hand-rolled CommonJS client
