# Sidebar cache and cross-provider repo merge

## Goal

Make the Repos/Agents sidebar usable immediately after restart by
persisting the last task snapshot, and merge the same git project when it
appears as both a local path and a cloud URL (local CLI + Cursor cloud).

## Acceptance criteria

- [x] Renderer hydrates agents from localStorage on boot
- [x] Main persists a slim discovery snapshot + path→remote map
- [x] Sidebar groups local paths and GitHub remotes with the same slug
- [x] Distinct remotes that share a repo name stay separate
- [x] Git origin lookups are cached and not spawned on every poll
- [x] Unit tests cover identity, snapshot cache, remotes, and hydrate

## Progress log

| Date | Note |
|------|------|
| 2026-09-08 | Implemented snapshot persist + canonical repo grouping |
