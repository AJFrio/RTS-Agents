# Spec: New task modal

**Status:** Verified

## Requirement

Users create new work from the UI with provider-specific fields.

## Provider options (desktop)

| Provider | Required input |
|----------|----------------|
| Jules | Repo source, branch, optional auto-PR |
| Cursor cloud | Repository, ref, optional auto-PR |
| Gemini CLI | Local git repo path |
| Codex | Prompt; repo optional |
| Claude CLI | Local repo path |
| Claude cloud | Prompt only |
| OpenCode | Per opencode-service capabilities |

## Acceptance criteria

- [ ] Modal only shows providers that are configured or detected
- [ ] Successful create closes modal and new task appears on dashboard after refresh
- [ ] Validation errors are shown inline (missing repo, missing key)

## Implementation pointers

- `src/renderer/modals/NewTaskModal.jsx`
- Creation IPC handlers in `main.js`
