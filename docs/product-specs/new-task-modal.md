# Spec: New task

**Status:** Verified

## Requirement

Users create new work from the New Task canvas tab (formerly a modal) with provider-specific fields.

## Provider options (desktop)

| Provider | Required input |
|----------|----------------|
| Jules | Repo source, branch, optional auto-PR |
| Cursor cloud | Repository, ref, optional auto-PR |
| Antigravity CLI | Local git repo path |
| Codex | Prompt; repo optional |
| Claude CLI | Local repo path |
| Claude cloud | Prompt only |
| OpenCode | Per opencode-service capabilities |

## Model selection (optional)

When a harness reports the models it supports, the composer shows a
"Model" pill dropdown; leaving it on "Harness default" sends no model.

| Harness | Model list source | Model applied via |
|---------|-------------------|-------------------|
| OpenCode | `opencode models` (live) | `--model` CLI arg / ACP `session/set_mode` |
| Antigravity | `agy models` (live) | `--model` CLI arg |
| Cursor | `agent models` (CLI) or Cursor cloud API | ACP `session/set_mode` / cloud `body.model` |
| Codex | OpenAI `/v1/models` (API key) | `--model` CLI arg |
| Claude CLI | Static documented aliases | `--model` CLI arg / ACP `session/set_mode` |
| Claude cloud | Anthropic `/v1/models` (API key) | Messages API `model` field |
| Jules | Not supported (API has no model field) | — |

Remote tasks carry the model in the KV queue payload; the executing device
threads it into the same service dispatch paths.

## Acceptance criteria

- [ ] The tab only shows providers that are configured or detected
- [ ] Model dropdown only appears when the selected harness reports models
- [ ] Selected model reaches the CLI args / REST body / remote queue payload
- [ ] Successful create resets the form and the new task appears in the task list after refresh
- [ ] Validation errors are shown inline (missing repo, missing key)

## Implementation pointers

- `src/renderer/pages/NewTaskPage.jsx`
- `src/main/services/model-registry.js` (per-provider model listing + cache)
- `models:get` IPC handler in `src/main/ipc/register-tasks.js`
- Creation IPC handlers in `main.js`
