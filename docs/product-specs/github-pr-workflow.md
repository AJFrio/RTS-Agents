# Spec: GitHub PR workflow

**Status:** Verified

## Requirement

With a GitHub PAT configured, users browse repos, view open PRs, inspect details, merge, and mark drafts ready for review.

## Acceptance criteria

- [ ] Repo list loads sorted by recent activity
- [ ] Open PRs list per repo
- [ ] PR detail modal shows title, body, checks summary when available
- [ ] Merge and “ready for review” require sufficient token scopes; failures show clear errors

## Implementation pointers

- `github-service.js` (REST + GraphQL for ready-for-review)
- `PullRequestsPage.jsx`, `PrModal.jsx`, `BranchesPage.jsx`
