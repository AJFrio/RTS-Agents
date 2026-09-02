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

## Default landing

- First load opens the Agent tab (`currentView: 'agent'` in
  `src/renderer/context/app-state.js`).
- Closing a task (`CLOSE_TASK`) returns to `previousView`, or Agent if none.
- The sidebar wordmark (`data-view="dashboard"`) still opens the All Tasks
  dashboard card grid. Mobile bottom nav keeps a Tasks tab for that view and
  a More sheet for destinations that do not fit the five-tab bar.

## Sidebar sections

- Toggle (persisted in `rts_sidebar_mode_v1`): **Repos** groups tasks by
  repository, **Agents** groups them by harness.
- Each section is collapsed by default and shows its first 10 non-running
  tasks when expanded; "See all" opens the repo/harness sessions modal.
- Running tasks always render above the collapse, even when the section is
  collapsed, with a pulsing emerald status dot.

## Agent tab (Janus)

- Cursor-style chat against `orchestrator:chat`. Assistant turns are labeled
  **Janus**. The empty state heading ("What should we work on?") and the
  Composer sit above the recent-task list. Placeholder: "Ask Janus to start,
  find, or summarize work…". The model picker is an inline text+chevron
  control inside the Composer (`variant="inline"`), not a page header.
- Composer shell uses a masked 1px overlay ring (not CSS `border` or
  box-shadow) so rounded corners stay continuous on Chromium.
- Consecutive Janus / transcript tool calls collapse into one **Tool
  Calls** bar (count in the label). Expanding it reveals each call, which
  can then be expanded on its own. A single call still renders as one row.
- Janus surfaces clickable cards inline with the turn: **task** (opens the
  transcript; shows harness, repo, branch, time, and a prompt/summary
  line), **device** (opens Devices and focuses that machine), **repo**
  (GitHub → Repositories, local → Devices), and **pull request** (opens
  the PR modal). `list_*` tools surface up to 8 of those cards themselves.
  Show tools (`show_task`, `show_device`, `show_repo`, `show_pull_request`)
  are for a single named item or something Janus just created. Janus
  answers "what's running?" from the dashboard agent cache (no provider
  rescan) and runs independent read tools in parallel. Write tools (only
  when the user asked):
  `create_local_repo`, `create_github_repo`, `pull_repo`,
  `merge_pull_request`, `close_pull_request`, `mark_pr_ready`.
- While a turn is in flight, a dual-orbit Janus mark + "Working…" appears
  under the transcript (neutral, busy-state only; static under
  `prefers-reduced-motion`).
- A **Recent tasks** list (`#agent-recent-tasks`) sits below the Composer on
  the empty landing: title, status, harness, repo, relative time. Rows use
  `.agent-recent-task`. Sorted by `updatedAt`/`createdAt`, capped at 20.
  Clicking a row calls `openTask` → task-detail. Running rows use emerald
  text/pill/dot; completed rows use grey. Sending a message animates the
  list closed (200ms, `prefers-reduced-motion` instant) so the chat owns
  the canvas. **New chat** (top-left) restores the empty landing and the
  list. Janus messages persist in `orchestratorChat` across tab
  switches.
- There is no Tasks header toggle or `TaskBrowserPanel`.

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
  desktop for jules, cursor (cloud), and claude-cloud.
  Other harnesses show a disabled note instead.

## Mobile shell (<768px)

- Sidebar and its resize handle are hidden; `#bottom-nav` is the only
  primary navigation.
- **Primary tabs:** Agent, New Task, Tasks (`dashboard`), Repos (`branches`),
  More.
- **More sheet** (`#bottom-nav-more`): Plugins, Pull Requests, Devices,
  Settings. Opening a destination closes the sheet.
- Canvas padding uses `--bottom-nav-offset` so Agent / New Task / task
  follow-up composers and the Repositories list-detail pane are not covered
  by the tab bar or the iOS home indicator.
- Repositories and Devices switch to a one-pane drill-in below `lg`
  (1024px): the list hides while a selection is open; a back control
  returns to the list.
- Header actions wrap; dashboard search occupies its own row on narrow
  viewports. Toasts move to `top-center` so they do not sit on the tab bar.

## Service hub

- Plugins tab owns connected-service cards (Manage / Disconnect) and the
  addable catalog. There is no page-header **Add service** button.
- Each catalog card has **Add service**; connected cards have **Manage**.
  Both open a focused single-service modal (`ServiceOnboardingModal`,
  `Modal` `size="md"`) with no catalog sidebar.
- Modal title is `Connect {service}` or `Manage {service}` (e.g. Connect
  Cloudflare KV), never "Service Onboarding".
- Cloudflare KV is token-first. **Detect & connect** discovers the account
  and verifies in one shot (`src/renderer/components/settings/service-onboarding.js`).
  The detect control is hidden when `discoverCloudflareAccount` is missing
  (web degradation).
- Settings keeps only Display, Data polling, and System sections.
- Devices tab replaces the old Computers page: device cards open a detail
  pane with services, repositories, running tasks (local device) or the
  remote queue, and a start-task button that pre-targets the device.

## Acceptance criteria

- [ ] First load shows `#view-agent` with `#agent-recent-tasks` visible;
      sending a message animates the list closed; New chat reverses it
- [ ] Sidebar wordmark opens `#view-dashboard`; CLOSE_TASK returns to the
      previous view or Agent
- [ ] Sidebar resize clamps to [200px, 33% window] and persists across restarts
- [ ] Running tasks stay visible when their repo/harness section is collapsed
- [ ] Janus tool calls group under a Tool Calls bar; task / device /
      repo / PR cards render in the chat; clicking a task card or a
      `.agent-recent-task` row opens the task chat log
- [ ] Plugins has no header Add service; card Add service / Manage opens a
      focused `Connect` / `Manage` modal with no catalog sidebar
- [ ] ACP-dispatched sessions stream tool calls and thinking into the task
      chat log, collapsed and expandable
- [ ] Follow-ups work for jules, cursor, and claude-cloud tasks
- [ ] No blue remains in the UI; only status colors (emerald/amber/red/grey)
      appear. Agent recent tasks: running emerald, completed grey
- [ ] Below 768px, `#sidebar` is hidden, `#bottom-nav` shows Agent / New Task /
      Tasks / Repos / More, and More opens Plugins, PRs, Devices, Settings
- [ ] Mobile canvas clears `--bottom-nav-offset`; Repositories and Devices
      drill in below `lg` with a back control

## Implementation pointers

- `src/renderer/components/layout/` (Layout, Sidebar, Header, BottomNav)
- `src/renderer/utils/mobile-nav.js`, `src/renderer/hooks/use-media-query.js`
- `src/renderer/components/sidebar/ReposAgentsSection.jsx`
- `src/renderer/modals/RepoSessionsModal.jsx`
- `src/renderer/pages/AgentPage.jsx`, `NewTaskPage.jsx`, `TaskDetailView.jsx`,
  `PluginsPage.jsx`, `DevicesPage.jsx`
- `src/renderer/context/app-state.js` (default view, CLOSE_TASK)
- `src/renderer/components/chat/` (Composer, TaskCard, RecentTasksList)
- `src/renderer/components/settings/ServiceOnboardingModal.jsx`,
  `service-onboarding.js`
- `src/main/services/opencode-session-parser.js` (`applySessionUpdate`)
- `src/main/services/agent-orchestrator.js` (tools, task cards)
- `src/main/ipc/provider-registry.js` (`sendTaskMessage` follow-up providers)
