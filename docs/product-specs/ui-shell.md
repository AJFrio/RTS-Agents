# Spec: Neutral shell + task chat log

**Status:** Verified

## Requirement

The desktop app presents a Cursor-inspired neutral shell (sidebar + canvas) and
renders every task's transcript as a chat log on the canvas.

## Layout

- Sidebar (fixed left region): brand button (opens the unified task list),
  seven nav rows — Agent, New Task, Plugins, Devices, Pull Requests,
  Repositories, Settings — a hairline divider, then a Repos/Agents toggle.
- Sidebar width is drag-resizable between 200px and 1/3 of the window; the
  value persists in localStorage (`rts_sidebar_width_v1`).
- Canvas (right region) renders the selected tab; chat views own their scroll
  with a fixed composer footer.

## Sidebar sections

- Toggle (persisted in `rts_sidebar_mode_v1`): **Repos** groups tasks by
  repository, **Agents** groups them by harness.
- Each section is collapsed by default and shows its first 10 non-running
  tasks when expanded; "See all" opens the repo/harness sessions modal.
- Running tasks always render above the collapse, even when the section is
  collapsed, with a pulsing emerald status dot.

## Agent tab (orchestrator)

- Cursor-style chat against `orchestrator:chat`; the model is chosen with the
  orchestrator model picker.
- The orchestrator's tool calls render as expandable rows; every task it
  starts or references surfaces as a clickable task card that opens the task
  chat log on the canvas.
- The "Tasks" panel lists previous tasks with harness and repo filters.

## Task chat log (canvas task detail)

- Clicking any task opens its transcript on the canvas: user turns
  right-aligned in inset bubbles, agent turns full-width; tool calls and
  thinking blocks arrive collapsed and expand in place.
- Structured transcript data comes from ACP `session/update` handling
  (`applySessionUpdate`): `agent_message_chunk`, `agent_thought_chunk`,
  `tool_call`, and `tool_call_update` all land on stream messages that
  `agents:get-details` returns with `thinking` / `toolCalls` fields.
- Providers without structured messages fall back to the unified activity
  feed (Jules) or raw markdown content.
- Follow-up composer at the bottom sends `tasks:send-message`; supported on
  desktop for jules, cursor (cloud), claude-cloud, and codex cloud responses.
  Other harnesses show a disabled note instead.

## Service hub

- Plugins tab owns connected-service cards (manage/disconnect), the full
  addable catalog, and guided onboarding (the ServiceOnboardingModal).
- Settings keeps only Display, Data polling, and System sections.
- Devices tab replaces the old Computers page: device cards open a detail
  pane with services, repositories, running tasks (local device) or the
  remote queue, and a start-task button that pre-targets the device.

## Acceptance criteria

- [ ] Sidebar resize clamps to [200px, 33% window] and persists across restarts
- [ ] Running tasks stay visible when their repo/harness section is collapsed
- [ ] Orchestrator tool calls and task cards render in the chat; clicking a
      card opens the task chat log
- [ ] ACP-dispatched sessions stream tool calls and thinking into the task
      chat log, collapsed and expandable
- [ ] Follow-ups work for jules, cursor, claude-cloud, and codex cloud tasks
- [ ] No blue remains in the UI; only status colors (emerald/amber/red) appear

## Implementation pointers

- `src/renderer/components/layout/` (Layout, Sidebar, Header, BottomNav)
- `src/renderer/components/sidebar/ReposAgentsSection.jsx`
- `src/renderer/modals/RepoSessionsModal.jsx`
- `src/renderer/pages/AgentPage.jsx`, `NewTaskPage.jsx`, `TaskDetailView.jsx`,
  `PluginsPage.jsx`, `DevicesPage.jsx`
- `src/renderer/components/chat/` (Composer, TaskCard)
- `src/main/services/opencode-session-parser.js` (`applySessionUpdate`)
- `src/main/services/agent-orchestrator.js` (tools, task cards)
- `src/main/ipc/provider-registry.js` (`sendTaskMessage` follow-up providers)
