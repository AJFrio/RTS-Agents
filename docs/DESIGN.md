# Design

> UI overhaul contract (2026): neutral, Cursor-inspired app shell. This document supersedes
> prior design guidance. Color carries status only — never decoration.

## 0. Research Log

- **Reference (Layer B)**: `cursor.md` design-system reference — structure only (hairline borders,
  border-ring elevation, radius scale, 150ms color / 200ms shadow motion, mono for technical labels,
  warm hover shifts replaced by neutral equivalents per user contract).
- **Taste (Layer A)**: `minimalist-skill.md` — borders-only elevation, typographic hierarchy,
  near-zero shadows, muted status tints.
- **Layout**: `layout-skill.md` — `fixed-sidenav-shell` + `list-detail`, scroll ownership named per region.
- **User contract**: neutral whites/greys/blacks; **no blue**; color only for status semantics
  (green = good/running, red = bad/failed, amber = queued, grey = idle). Sidebar small, resizable to
  1/3 viewport. Canvas shows the active tab's content. Skipped: lazyweb/imagen lanes (user supplied
  a concrete direction; desktop Electron app, no marketing surface).

## 1. Product intent

RTS Agents is one cockpit for every coding agent (Claude, Codex, Cursor, OpenCode, Antigravity,
Jules, cloud harnesses) and GitHub. Users chat with Janus, start tasks on any harness /
device / repo, watch every running session, and read any task's transcript — without leaving the app.

## 2. UX principles

1. **Chat-first** — The Agent tab is Janus: a minimal composer that expands into
   power controls (harness, model, repo, device) only when needed. Task creation and follow-ups
   reuse the same composer surface.
2. **Living sidebar** — Repos/Agents sections show what is running *right now*, even when collapsed.
   Running sessions stay visible and pulse until they finish.
3. **Canvas** — One right-hand region renders the selected tab. Clicking a task anywhere opens its
   transcript as a chat log on the canvas: user vs. agent clearly distinct; tool calls, thinking,
   and artifacts collapsed by default, expandable in place.
4. **No dead space** — Components occupy only the space their content needs. No oversized paddings,
   no one-off wrapper cards, no decorative frames. Consolidate components that do the same job.
5. **Status is the only color** — Beyond green/amber/red/grey semantics and one neutral accent,
   everything is monochrome. Provider identity is typography + icons, not brand colors.
6. **Light/dark parity** — Every surface works in both themes (`dark:` variants, `neutral` ramp).

## 3. Visual system

### 3.1 Palette

Neutral ramp (Tailwind `neutral` + custom stops). **Blue is banned.** Accent is inverted-neutral
(dark text on light buttons, white on dark) — there is no brand hue.

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` (app/canvas) | `#fafafa` | `#0f0f0f` | Canvas background |
| `bg-raised` (sidebar) | `#f4f4f5` | `#181818` | Sidebar, header strips |
| `bg-card` | `#ffffff` | `#1e1e1e` | Cards, composer, modals |
| `bg-inset` | `#f4f4f5` | `#141414` | Inset wells: code, collapsed tool bodies, thumbnails |
| `border` | `#e5e5e5` | `#262626` | Hairline borders, dividers |
| `border-strong` | `#d4d4d4` | `#404040` | Emphasized borders, hover edges |
| `text` | `#171717` | `#ededed` | Primary text |
| `text-secondary` | `#737373` | `#a0a0a0` | Secondary text |
| `text-tertiary` | `#a3a3a3` | `#6e6e6e` | Disabled/hint text |
| `accent-bg` | `#171717` | `#ededed` | Primary button fill |
| `accent-text` | `#ffffff` | `#0f0f0f` | Primary button text |

Status semantics (the only chromatic colors):

| State | Base | Tint | Signal |
|---|---|---|---|
| running | emerald-600 / emerald-400 | `bg-emerald-500/10` | pulsing dot + subtle shimmer on rows |
| completed (good) | emerald-700 / emerald-400 | check icon, `bg-emerald-500/10` badge | done (dashboard / sidebar) |
| completed (Agent recent list) | neutral-500 / neutral-400 | grey pill + dot | finished work on the Agent canvas |
| queued/pending | amber-600 / amber-400 | `bg-amber-500/10` | waiting |
| failed/stopped (bad) | red-600 / red-400 | `bg-red-500/10` | error |
| idle/not-configured | neutral-400 | `bg-neutral-400/10` | neutral |

### 3.2 Typography

- Family: `Plus Jakarta Sans` (display) with Inter/system-ui fallback — unchanged from repo
  config (local Electron app; no new webfont deps). Mono: `ui-monospace, SFMono-Regular, Menlo,
  Consolas, monospace` for repo names, branch names, commands, technical labels.
- UI body: 13px (`text-[13px]`), secondary 12px (`text-xs`), micro labels 11px uppercase
  `tracking-wider`. Page titles 15–16px semibold. Chat body 14px. Long-form (transcript text)
  14px/1.6.
- Hierarchy by size + weight (500/600) — never by color, except status semantics.

### 3.3 Depth & elevation

**Borders-only.** No drop shadows on cards, rows, or the sidebar. Hairline `border` tokens separate
every surface. Modals get one ambient shadow (`shadow-xl` equivalent, low opacity) + scrim.
Hover = background tone shift + `border-strong` edge, never shadow growth.

### 3.4 Radius & spacing

- Radius: 6px controls/inputs, 8px cards/modals, 9999px only for tiny status pills.
- Spacing base 4px. Dense: sidebar rows py-1.5 px-2; cards p-4; canvas padding p-6 with
  `max-w` content limiters on wide pages.
- Touch targets ≥ 28px in sidebar, ≥ 32px in canvas, ≥ 44px in the mobile
  bottom nav and More sheet.

## 4. Layout & scroll ownership

`fixed-sidenav-shell`:

- **Sidebar** (`aside`, fixed region): width state 240px default, drag-resizable 200px → 33vw max.
  Internal `nav` owns its scroll. Resize via 4px drag handle on the right edge (cursor col-resize).
- **Canvas** (`main`, fluid): owns its scroll per view. Chat views (Agent, task transcript) are
  `scroll-body-shell` — scrolling message region with a Composer above the Agent recent-task
  list (or pinned at the bottom of a task transcript).
- Mobile (<768px): sidebar hidden; canvas is full-bleed and clears
  `--bottom-nav-offset` (4rem bar + safe-area inset) so composers and
  list/detail panes sit above the tab bar. Bottom nav shows Agent, New Task,
  Tasks, Repos, and **More** (Plugins, Pull Requests, Devices, Settings).

Stress contract: empty lists render an inline empty state in the canvas; long repo/task names
truncate with ellipsis; unbroken strings (paths, tokens) `overflow-wrap: anywhere`; sidebar
sections survive 50+ repos by virtualizing nothing but scrolling their own list body.

## 5. Primitives (all in `src/renderer/components/ui/` unless noted)

- **Composer** (`Composer.jsx`, components/chat/) — Cursor chat box: borderless textarea in a
  `bg-card` `rounded-2xl` shell, hairline ring via a masked 1px overlay (not CSS
  `border` / box-shadow, so corners stay continuous on Chromium). Bottom row:
  circular `+` (attach) on the left,
  inline text+chevron controls (model / repo / device / branch), circular send on the right.
  Image attachments show as inline thumbnails. Reused by Agent, New Task, and task follow-ups.
- **ChatMessage** (`components/chat/`) — user vs. agent distinction: user messages sit in a
  right-aligned `bg-inset` bubble; agent messages are full-width unboxed text. Renders markdown.
- **ToolCallBlock** (`components/chat/`) — consecutive calls collapse to a **Tool Calls**
  bar; expanding reveals each chip, which expands in place to `bg-inset` input/output.
- **Surface cards** (`TaskCard` / `SurfaceCard`, components/chat/) — Janus-surfaced
  task, device, repo, and PR cards. Task: title, harness, repo, branch, status, time,
  prompt/summary. Click opens the matching canvas view or PR modal.
- **StatusDot / StatusPill** — pulsing emerald for running; static semantic colors otherwise.
- **Collapsible / SectionHeader** — existing disclosure primitives, restyled to hairline neutrals.
- **Modal** — existing sizes, restyled: `bg-card`, hairline border, single ambient shadow.
- **Icon set** — inline SVG icon module (`components/ui/icons.jsx`): replaces
  material-symbols font with tree-shakeable stroke icons (24px grid, 1.5 stroke). No emojis.

## 6. Sidebar anatomy

```
┌──────────────────────────────┐
│ RTS Agents wordmark (small)   │
├──────────────────────────────┤
│ Agent        New Task         │  nav rows, 13px, icon+label
│ Plugins      Devices          │
│ Pull Requests                 │
│ Repositories                  │
│ Settings                      │
├─ hairline divider ───────────┤
│ [ Repos | Agents ] toggle     │  segmented control, full width
│ ▸ repo-name        (10 tasks)  │  expandable sections
│   • task rows, 10 max         │
│   See all → modal             │
│ ▸ harness-name                │  running sessions pinned
│   • running rows always shown │  even when section collapsed
├──────────────────────────────┤
│ (resize handle, right edge)   │
└──────────────────────────────┘
```

- Expandable repo sections show first 10 tasks + "See all" (opens sessions modal for that repo).
- Any actively running task in a repo renders *above* the collapse — even when the section is
  collapsed — with a pulsing status dot and emerald tint.
- Harness sections (Agents toggle) behave identically: running sessions always visible.

## 7. Motion

- Color/border transitions: 150ms ease. Background shifts on hover: 150ms.
- Active press: `scale(0.98)`. Sidebar resize: live width, no animation.
- Collapse/expand: height animation via grid-template-rows (GPU-friendly), 200ms ease; instant
  under `prefers-reduced-motion`. The Agent recent-tasks list uses this when a message is sent.
  Sidebar drag-resize stays unanimated.
- Running pulse: 2s opacity pulse on the status dot — ambient animation tied to real running state.
- Janus busy mark: dual counter-rotating arcs while the Agent tab is waiting on a turn
  (neutral, not emerald). Static under `prefers-reduced-motion`.
- No decorative motion anywhere.

## 8. Accessibility constraints

- All interactive elements are real `<button>`/`<a>` with visible `focus-visible` rings
  (`outline` neutral-strong, 2px offset).
- Disclosure rows expose `aria-expanded`; segmented toggle is `role=tablist`-like with
  `aria-pressed`. Status conveyed by text/icon + color, never color alone.
- Contrast: text pairs ≥ 4.5:1 (both themes); status tints keep their icon/text legible.
- Keyboard: full nav + chat + composer operable by keyboard; Enter submits, Shift+Enter newline.

## 9. Accepted debt

- Material Symbols font remains for icons not yet ported to the inline SVG
  set (filter chip and a few status glyphs); new components use inline SVG
  only.

## 10. Non-goals (current)

- Remote-queue tasks in the sidebar (local/cloud provider tasks only, per product decision).
- Replacing provider-native IDEs; full code review UIs.
- Multi-user tenancy.
