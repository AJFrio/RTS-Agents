# OpenCode stale Working status and UI lag

## Goal

Stop OpenCode tasks from staying marked running after a turn ends, and stop
the Electron main process from blocking on synchronous `opencode export` so
typing and clicks stay responsive.

## Acceptance criteria

- [x] Open task `selectedTask` stays in sync with agent list status
- [x] Task chat Working… / sidebar green use live status, not the open snapshot
- [x] Live ACP transcript/status is pushed over `tasks:session-updated`
- [x] `getSessionDetails` prefers in-memory stream messages; export is async and cached
- [x] Discovery cache fingerprint includes session status, not only list length
- [x] Restored `running` sessions without a live ACP child become `completed`
- [x] Watchers cover session stores only (not user repos); silent polls skip `SET_REFRESHING`
- [x] Agent composer input is local state; AppActions/AppState are split
- [x] Claude list scan caches per-file metadata by mtime/size

## Progress log

| Date | Note |
|------|------|
| 2026-09-02 | Implemented status push, async export, watch/render/Claude scan fixes |
