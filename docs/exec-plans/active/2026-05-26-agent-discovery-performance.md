# Agent discovery performance

## Goal

Reduce main-process blocking and IPC churn during agent polling by async install probes, mtime-based discovery cache, filesystem watchers, and delta agent list updates.

## Acceptance criteria

- [x] No `existsSync` in Antigravity/Claude/OpenCode install probes or ProjectService hot paths
- [x] Polling skips full provider fetch when local fingerprint and cloud config are unchanged
- [x] `agents:get-all` supports `sinceRevision` and returns `unchanged` or `delta` payloads
- [x] Renderer merges deltas and memoizes dashboard cards
- [x] Unit tests for delta + cache

## Progress log

| Date | Note |
|------|------|
| 2026-05-26 | Implemented phases 1–3 (async I/O, fingerprint cache + fs.watch, IPC deltas) |
