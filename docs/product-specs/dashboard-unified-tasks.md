# Spec: Unified dashboard tasks

**Status:** Verified

## Requirement

The dashboard shows tasks from all configured providers in one sortable/filterable list.

## Behavior

- User can filter by provider and status.
- Pagination applies when task count exceeds page size.
- SYNC or poll interval refreshes the list from main process aggregation.
- Completing tasks may trigger in-app notification (toast + optional sound).

## Acceptance criteria

- [ ] With at least one provider configured, tasks appear after SYNC
- [ ] Filters reduce visible set without losing provider badge accuracy
- [ ] Clicking a card opens provider-appropriate detail view

## Implementation pointers

- `src/renderer/pages/DashboardPage.jsx`
- `ipcMain.handle('agents:get-all')` in `main.js`
- Provider services under `src/main/services/`
