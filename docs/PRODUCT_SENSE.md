# Product Sense

## Who it’s for

Developers who run **multiple coding agents** across machines and want a **single control plane** — not another IDE.

## Jobs to be done

1. **“What’s running?”** — See all agent sessions and cloud tasks in one list with status.
2. **“Start something”** — Pick provider, repo, and prompt without opening five different UIs.
3. **“Ship the PR”** — From the app: list PRs, inspect, merge, mark draft ready.
4. **“Use my phone”** — Check status and kick off cloud (or queued local) work via the PWA.
5. **“Coordinate machines”** — Register desktops, push keys/repos via KV, dispatch to the right box.

## Provider positioning

| Provider                               | User expectation                                           |
| -------------------------------------- | ---------------------------------------------------------- |
| Jules / Cursor cloud                   | Fully remote; API key in Settings                          |
| Gemini / Claude / Codex / OpenCode CLI | Local install + repo paths; app discovers sessions on disk |
| OpenRouter                             | Optional model hub for orchestrator chat                   |
| GitHub                                 | PAT for repo/PR features only                              |

## Success signals

- User can complete Settings onboarding and see at least one provider online.
- SYNC returns tasks within one poll cycle without noticeable UI freeze.
- New task appears in dashboard after creation (cloud or CLI).

## Feedback → repo

User-reported bugs and review comments should become:

- An entry in `docs/exec-plans/active/` for multi-step fixes, or
- `UPDATES.md` bullets for small tracked debt, or
- A golden-principle / lint rule if the mistake is repeatable.
