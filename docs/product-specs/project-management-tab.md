# Spec: Project Management tab

**Status:** Implemented

## Requirement

One "Project Management" view (id `project-management`) where users browse
Linear and Jira issues and dispatch any issue to a coding agent through the
New Task modal.

## User flow

1. **Configure**: Settings → API Command Keys → add a Linear personal API key
   (service `linear-cloud`) and/or a Jira base URL + token.
2. **Open the tab**: desktop sidebar or mobile drawer "Project Management".
3. **Select scope**: pick a Linear team and/or Jira board. The selection
   persists across visits (`rts_linear_team_id`, `rts_jira_board_id` in
   localStorage).
4. **Browse**: each row shows a source badge (Linear/Jira), issue key, title,
   and status pill. Clicking a row opens the issue detail modal.
5. **Dispatch**: the row's Dispatch button opens the New Task modal prefilled
   with `[SOURCE] KEY: Title` plus the issue description, Location preset to
   Cloud.

## Behavior (desktop)

- Neither Linear nor Jira configured → guard screen ("Project Management Not
  Configured") with an "Open Settings" button (`setView('settings')`).
- Sections render only for configured providers. Each loads when the view is
  entered with an empty list and has its own Refresh button.
- Linear section: team `<select>` (`#linear-team-select`), first 50 issues of
  the selected team.
- Jira section: board `<select>` (`#jira-board-select`), backlog issues of the
  selected board.
- Row click opens `LinearIssueModal` / `JiraIssueModal`. The Linear modal
  re-fetches the full issue (`api.linear.getIssue`) and shows key, state,
  title, description, assignee, priority, and updated time.
- Header shows the view title "Project Management" and a combined Linear +
  Jira issue count.

## Behavior (web)

The same page and modals run in the Cloudflare-hosted web app. The platform
provider `linear-service.mjs` calls the same-origin worker proxy `/api/linear`,
which forwards the GraphQL POST to `https://api.linear.app/graphql` using the
client-stored key (the `X-API-Key` request header becomes the raw
`Authorization` header). The worker answers 401 when no key is sent and 502
on upstream failure. Envelopes and issue normalization match the desktop IPC
shapes.

## AppContext state

| State                       | Shape / meaning                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `state.linear`              | `{ teams, issues, selectedTeamId, loading, error }`; `SET_LINEAR` merges                        |
| `state.linearIssueModal`    | Issue shown in the Linear detail modal (`OPEN_LINEAR_ISSUE_MODAL` / `CLOSE_LINEAR_ISSUE_MODAL`) |
| `configuredServices.linear` | `true` when `apiKeys.linear` is set                                                             |

Actions: `openLinearIssueModal`, `closeLinearIssueModal`, `openNewTaskModal`.

## IPC (desktop)

| Channel             | Payload       | Returns               |
| ------------------- | ------------- | --------------------- |
| `linear:get-teams`  | none          | `{ success, teams }`  |
| `linear:get-issues` | `{ teamId }`  | `{ success, issues }` |
| `linear:get-issue`  | `{ issueId }` | `{ success, issue }`  |

Failures return `{ success: false, error }`. Preload exposes
`window.electronAPI.linear` (`getTeams`, `getIssues`, `getIssue`) via
`src/preload/api-linear.js`.

## Linear service

`src/main/services/linear-service.js` posts GraphQL to
`https://api.linear.app/graphql` with the raw key in the `Authorization`
header (no scheme prefix) and a 30s timeout. Methods: `testConnection` (viewer
query), `listTeams`, `listIssues(teamId)` (first 50), `getIssue(id)`. Issues
are normalized to `{ id, key, title, description, state, priority, url,
project, assignee, updatedAt }` (`key` is the Linear `identifier`).

## Settings

| Field         | Value                                                        |
| ------------- | ------------------------------------------------------------ |
| Catalog entry | `linear-cloud` (title "Linear", category "Integrations")     |
| Kind          | `cloud-api-key`                                              |
| Provider      | `linear` (stored as `apiKeys.linear`)                        |
| Field         | `apiKey` (password, "Enter Linear personal API key")         |
| Test          | `linearService.testConnection()` → `connectionStatus.linear` |
| Disconnect    | `removeApiKey('linear')`                                     |

## Out of scope

- No Linear or Jira issue creation or mutation from the app (read-only).
- No assignee filtering beyond the existing Jira board behavior.
- No real-time sync; lists refresh on view entry, on team/board change, and
  via the per-section Refresh button.

## Acceptance criteria

- [ ] With Linear configured, teams load on view entry and the persisted team is reselected
- [ ] With neither provider configured, the guard screen offers Open Settings
- [ ] Row click opens the matching detail modal; the Linear modal shows the fetched full issue
- [ ] Dispatch opens the New Task modal with the `[SOURCE] KEY: Title` prompt and Cloud preset
- [ ] Web serves the same view through `/api/linear` with `X-API-Key`
- [ ] Settings shows the `linear-cloud` card with test and disconnect

## Implementation pointers

- `src/renderer/pages/ProjectManagementPage.jsx`
- `src/renderer/modals/LinearIssueModal.jsx`
- `src/main/services/linear-service.js`, `src/main/ipc/register-linear.js`
- `src/preload/api-linear.js`
- `src/renderer/platform/providers/linear-service.mjs`, `worker/index.ts` (`/api/linear`)
- `src/renderer/components/settings/service-catalog.js`, `service-status.js`, `connected-services.js`
