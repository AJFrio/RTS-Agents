# Plans

Execution planning for RTS Agents follows the [harness engineering](https://openai.com/index/harness-engineering/) model: **versioned plans in-repo**, not external docs only.

## Where plans live

| Type              | Location                                                           | When to use                         |
| ----------------- | ------------------------------------------------------------------ | ----------------------------------- |
| Active work       | [exec-plans/active/](exec-plans/active/)                           | Multi-step features, migrations     |
| Completed         | [exec-plans/completed/](exec-plans/completed/)                     | Archive with date prefix            |
| Tech debt backlog | [exec-plans/tech-debt-tracker.md](exec-plans/tech-debt-tracker.md) | Ongoing issues, performance         |
| Quick agent queue | [../UPDATES.md](../UPDATES.md)                                     | Small bullets; **remove when done** |

## Plan template (active)

Create `docs/exec-plans/active/YYYY-MM-DD-short-name.md`:

```markdown
# Title

## Goal

One paragraph.

## Acceptance criteria

- [ ] …

## Progress log

| Date       | Note      |
| ---------- | --------- |
| YYYY-MM-DD | Started … |
```

## Lightweight changes

Single-file fixes do not need a plan file. Mention IPC/provider touched in the PR/commit body.

## Agent workflow

1. Read `AGENTS.md` → this file → relevant spec in `product-specs/` or `design-docs/`.
2. If scope spans main + renderer + mobile, write an active plan first.
3. On completion: move plan to `completed/`, update QUALITY_SCORE if domain grade changed, delete matching `UPDATES.md` items.
