# Spec: Sidebar snapshot cache + repo merge

**Status:** Implemented

## Requirement

After an app restart the Repos/Agents sidebar must show previously seen
tasks immediately (no empty wait for provider discovery). Tasks that are
the same git project on different providers — for example a local CLI
session in `Open Shop` and a Cursor cloud agent on
`github.com/you/open-shop` — must share one sidebar section whose active
count includes both.

## Restart cache

- Renderer hydrates `state.agents` from localStorage
  (`rts_agent_snapshot_v1`) on boot so the sidebar, recent-task list, and
  dashboard counts paint from the last snapshot.
- The snapshot stores slim rows only (id, provider, status, repository,
  `repoRemote`, timestamps, short prompt/name). Transcripts and stream
  buffers are not persisted.
- Live `agents:get-all` still runs after first paint and replaces the
  snapshot. Failed refreshes keep the cached list.
- Main persists the same slim list plus a path→git-remote map to
  `userData/agent-discovery-snapshot.json` so Janus `peekAgents` and the
  next desktop boot have a disk copy.

## Repo merge (local + cloud)

- Grouping key is a canonical identity, not the raw `repository` string.
- Local paths (`D:\GitHub\Open Shop`) and cloud URLs
  (`https://github.com/you/open-shop.git`) collapse to the same slug
  (`open-shop`) when that slug maps to a single remote.
- Distinct remotes that share a repo name (`alice/app` vs `bob/app`) stay
  separate (`owner/name` labels).
- When a local folder name does not match the GitHub repo name, main
  attaches `repoRemote` from `git config remote.origin.url` (cached; not
  spawned on every poll) so those tasks still merge.

## Acceptance criteria

- [ ] Restarting the app shows last-seen repos/tasks in the sidebar before
      provider scans finish
- [ ] A local task and a Cursor cloud (or Jules) task for the same GitHub
      repo share one Repos section; two running tasks show `2 active`
- [ ] Two different GitHub repos with the same name do not merge
- [ ] Cached running status is corrected once live discovery returns
- [ ] Web/PWA uses the same localStorage snapshot (no Electron disk file)

## Implementation pointers

- `src/renderer/utils/repo-identity.js` — parse + `groupTasksByRepo`
- `src/renderer/utils/agent-snapshot-cache.js` — localStorage snapshot
- `src/renderer/components/sidebar/ReposAgentsSection.jsx`
- `src/renderer/context/app-state.js` — hydrate + persist on list updates
- `src/main/services/agent-discovery-cache.js` — disk snapshot
- `src/main/services/repo-remote-cache.js` — git origin cache
- `tests/unit/repo-identity.verify.mjs`
- `tests/unit/agent-snapshot-cache.verify.mjs`
- `tests/unit/repo-remote-cache.test.js`
