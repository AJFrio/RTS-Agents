# ACP Windows dispatch and local start

## Goal

Unblock local OpenCode/Claude (and sibling CLI) task start on Windows, widen official ACP adapter discovery, and document that Cursor Cloud is API v1 (not v2).

## Acceptance criteria

- [x] Shared `cli-spawn` routes `.cmd`/`.bat` through cmd.exe; probes and legacy starts use it
- [x] ACP resolver returns `{ command, args }` and probes native `acp` / `--acp`
- [x] Antigravity uses official ACP flags only
- [x] Cursor Cloud stays on `/v1`; no fake v2 migrate
- [x] Cursor Local capability includes CLI install; repo scan includes a path that is itself a git repo; New Task accepts a typed absolute path
- [x] Specs, README, and tests updated

## Progress log

| Date | Note |
|------|------|
| 2026-09-01 | Implemented cli-spawn, adapter resolution, Antigravity ACP probe, Cursor v1 audit, start-path UX, docs/tests |
| 2026-09-01 | Windows-aware spawn assertions, PATH .cmd fixtures, graceful ACP stdin shutdown before taskkill |
