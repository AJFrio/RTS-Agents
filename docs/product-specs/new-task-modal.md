# Spec: New task

**Status:** Verified

## Requirement

Users create new work from the New Task canvas tab (formerly a modal) with provider-specific fields.

## Layout

- Compact top-aligned strip (`space-y-3`, no vertical centering / `my-auto`).
  Location is Cloud / Local / Remote on desktop and Cloud / Remote on the
  web app (local CLIs cannot run in the browser). Agent chips wrap in a
  row. Selecting an agent does not insert a Repo block between the chips
  and the prompt.
- **Device-first dispatch (remote)**: when Location is Remote, a Device
  section appears above the Agent section and a device must be selected
  first. The Agent chips then list only the harnesses the selected device
  reports via its heartbeat `tools[0]['CLI tools']`. No device selected →
  no harness chips ("Select a device above to see its available
  harnesses."). The old composer-footer device pill is gone.
- Repository / project path stays in the Composer footer as a text+chevron
  control next to Branch / Auto-PR / Model (DESIGN.md §5). The Composer
  itself is the shared Cursor chat box (rounded-2xl, circular - and send).
- Stable ids for e2e: `#new-task-modal`, `#environment-*`, `#service-*`,
  `#task-repo-search`, `#repo-dropdown`, `#device-<deviceId>`,
  `#create-task-btn`.
- Validation copy stays inline. Do not reserve a large empty error panel.
  Remote validation order: device → agent → prompt → repo.

## Provider options (desktop)

| Provider        | Required input                        |
| --------------- | ------------------------------------- |
| Jules           | Repo source, branch, optional auto-PR |
| Cursor cloud    | Repository, ref, optional auto-PR     |
| Antigravity CLI | Local git repo path                   |
| Codex           | Prompt; repo optional                 |
| Claude CLI      | Local repo path                       |
| Claude cloud    | Prompt only                           |
| OpenCode        | Per opencode-service capabilities     |

## Model selection (optional)

When a harness reports the models it supports, the composer shows a
"Model" pill dropdown; leaving it on "Harness default" sends no model.

| Harness      | Model list source                        | Model applied via                           |
| ------------ | ---------------------------------------- | ------------------------------------------- |
| OpenCode     | `opencode models` (live)                 | `--model` CLI arg / ACP `session/set_mode`  |
| Antigravity  | `agy models` (live)                      | `--model` CLI arg                           |
| Cursor       | `agent models` (CLI) or Cursor cloud API | ACP `session/set_mode` / cloud `body.model` |
| Codex        | None (harness default)                   | `--model` CLI arg when a model is typed     |
| Claude CLI   | Static documented aliases                | `--model` CLI arg / ACP `session/set_mode`  |
| Claude cloud | Anthropic `/v1/models` (API key)         | Messages API `model` field                  |
| Jules        | Not supported (API has no model field)   | —                                           |

Remote tasks carry the model in the KV queue payload; the executing device
threads it into the same service dispatch paths.

## Acceptance criteria

- [ ] Control strip is top-aligned; Repo appears as a composer footer pill;
      remote dispatch requires a Device section above the Agent section
- [ ] The tab only shows providers that are configured or detected
- [ ] Remote harness chips reflect only the selected device's reported tools
- [ ] Model dropdown only appears when the selected harness reports models
- [ ] Selected model reaches the CLI args / REST body / remote queue payload
- [ ] Successful create opens the new task on the canvas and the task appears in the sidebar / recent list
- [ ] Validation errors are shown inline (missing device, missing repo, missing key)

## Implementation pointers

- `src/renderer/pages/NewTaskPage.jsx`
- `src/main/services/model-registry.js` (per-provider model listing + cache)
- `models:get` IPC handler in `src/main/ipc/register-tasks.js`
- Creation IPC handlers in `main.js`
