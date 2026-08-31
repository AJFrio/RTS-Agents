# Design

## Product intent

RTS Agents reduces context switching between coding agents (Jules, Cursor, Antigravity, Claude, Codex, OpenCode, etc.) and GitHub. Users should see **one task list**, drill into **provider-specific detail**, and **start work** without leaving the app.

## UX principles

1. **Unified mental model** — Every provider appears as a task card with status, provider badge, and timestamps. Provider quirks live in detail views, not the list.
2. **Progressive disclosure** — List stays light; transcripts, PR links, and tool output appear on the Agent/PR detail screens.
3. **Explicit configuration** — Offline providers show why (missing key, CLI not installed, path not set). Settings onboarding explains each service.
4. **Dark mode parity** — All new UI must work in light and dark (`dark:` Tailwind variants, `slate` neutrals).
5. **Safe defaults** — GitHub tokens and API keys use minimum scopes documented in README; destructive actions confirm in UI.

## Key flows

| Flow | Entry | Success criteria |
|------|-------|------------------|
| Sync dashboard | Header SYNC / poll | Tasks refresh without freezing UI |
| New task | New Task modal | Correct provider + repo/env; task appears in list |
| Agent detail | Card click | Provider-specific history loads or clear error |
| GitHub PR | Branches / PR pages | List PRs, merge, mark ready when token valid |
| Remote dispatch | Computers + mobile | Task reaches chosen desktop and runs |

## Shared primitives

Modal, task-detail, and create-task surfaces compose from these renderer primitives (`src/renderer/components/ui/`, `src/renderer/components/task/`):

- **Modal `size`** — `sm | md | lg | xl | wide`; `wide` spans ~80% of the window on desktop (`lg:w-[80vw]`, capped at `max-w-screen-2xl`). Consumers own height and inner chrome; `size` is optional so legacy consumers render unchanged.
- **Collapsible / SectionHeader** — collapsed-by-default disclosure with `aria-expanded`, chevron icon, and keyboard toggling. `mountWhenClosed` keeps panel content mounted (hidden) so transcript text stays in the DOM. `SectionHeader` is the unboxed variant with count badges and header actions. Available to any consumer; the agent detail view no longer uses it.
- **Task sections** — `TaskContextSection`, `ActivityTimeline`, and `ConversationList` render any provider's details. Provider quirks enter as props (Jules media session, OpenCode header action), never as per-provider components.
- **Unified activity feed** — `UnifiedActivityFeed` renders one chronological stream merging activities, conversation, and messages (`buildUnifiedFeed` in `src/renderer/utils/agent-feed.js`): chat bubbles for user/assistant turns, timeline rows for activity, expandable rows with running-task auto-expand of the latest entry until the user intervenes. Jules media renders inline.

Agent detail view (`AgentModal`): slim sticky top bar carries identity + live status (provider badge, pulsing status badge while running, title, relative time, Go To Task / terminal actions); the body is a single scroll with pinned task context and summary above the unified feed — no collapsible sections, no separate Prompt section (the prompt is visible in the chat transcript; rendered standalone only when the feed is empty). Details for running tasks are pre-fetched in the background (`agent-details-cache`) so clicking a running card renders instantly, with the live fetch still refreshing behind the cache seed. Toasts anchor bottom-right.

## Non-goals (current)

- Replacing provider-native IDEs or full code review UIs
- Running local CLIs inside the mobile PWA
- Multi-user tenancy or server-side user accounts (desktop is single-user local)

## Related specs

- [product-specs/index.md](product-specs/index.md)
- [PRODUCT_SENSE.md](PRODUCT_SENSE.md)
