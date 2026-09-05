# Task view as Agent-tab transcript

## Goal

Render every opened task with the same `ChatTranscript` as the Agent tab:
the dispatched prompt as a user bubble, harness thinking collapsed, and
tool calls expandable in place — including Jules and Cursor cloud payloads
that previously used the activity-feed fallback.

## Acceptance criteria

- [ ] `detailsToTranscript` maps ACP messages, Cursor conversation/runs,
      Jules activities, legacy content, and prompt-only into ChatTranscript
      shape, prepending the prompt when no user turn exists
- [ ] `TaskDetailView` always renders `ChatTranscript` (no activity-feed
      or raw-markdown primary path)
- [ ] Jules verification media renders via `renderCards` + `JulesActivityMedia`
- [x] Task context is collapsed by default; running tasks show Working…;
      cloud tasks poll details, local ACP tasks receive `tasks:session-updated`
- [ ] Unit tests cover the normalizer; `npm run validate` and the renderer
      build pass

## Progress log

| Date | Note |
|------|------|
| 2026-09-02 | Implemented normalizer, task-detail ChatTranscript path, Jules media extract, spec + tests |
