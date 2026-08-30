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
- **Collapsible / SectionHeader** — collapsed-by-default disclosure with `aria-expanded`, chevron icon, and keyboard toggling. `mountWhenClosed` keeps panel content mounted (hidden) so transcript text stays in the DOM. `SectionHeader` is the unboxed variant with count badges and header actions.
- **Task sections** — `TaskContextSection`, `ActivityTimeline`, and `ConversationList` render any provider's details. Provider quirks enter as props (Jules media session, OpenCode header action), never as per-provider components.

Detail-view defaults: metadata (Context) starts collapsed; primary content (Prompt, Summary, Conversation, Messages) starts expanded; running tasks auto-expand the latest activity row until the user intervenes.

## Non-goals (current)

- Replacing provider-native IDEs or full code review UIs
- Running local CLIs inside the mobile PWA
- Multi-user tenancy or server-side user accounts (desktop is single-user local)

## Related specs

- [product-specs/index.md](product-specs/index.md)
- [PRODUCT_SENSE.md](PRODUCT_SENSE.md)
