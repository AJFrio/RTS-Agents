# Local ACP follow-up turns

## Goal

Keep local ACP adapter processes alive after the first turn and wire the existing task-detail follow-up composer through `tasks:send-message` for every ACP-connected local agent (Claude CLI, Codex, OpenCode, Cursor CLI, Antigravity).

## Acceptance criteria

- [x] `acp-service.connect` keeps the child alive; `runPrompt` still kills after one turn
- [x] Follow-ups send another `session/prompt` (or `session/load` + prompt when resumable)
- [x] Task detail composer shows for local ACP sessions with `canFollowUp`
- [x] Legacy detached CLI sessions do not get follow-ups
- [x] Live adapters close on app quit

## Progress log

| Date | Note |
|------|------|
| 2026-09-02 | Implemented multi-turn ACP client, provider follow-ups, IPC/UI, tests, specs |
