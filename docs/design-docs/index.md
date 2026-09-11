# Design docs index

| Document                                           | Status   | Summary                                        |
| -------------------------------------------------- | -------- | ---------------------------------------------- |
| [core-beliefs.md](core-beliefs.md)                 | Verified | Agent-first operating principles for this repo |
| [electron-ipc.md](electron-ipc.md)                 | Verified | IPC and preload boundaries                     |
| [provider-integration.md](provider-integration.md) | Verified | How to add or change a coding provider         |

## Verification legend

- **Verified** — Reviewed against current code in `src/main/` and `src/renderer/`
- **Draft** — Intended direction; may drift from code
- **Stale** — Do not trust; open a gardening PR

Agents: prefer **Verified** docs. If code contradicts a doc, fix the doc in the same change set as the code.
