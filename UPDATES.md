<!--
AGENTS: The first level bullet point is the title of the task. The second level bullet point is the description of the task.
-->

- Verify Project Management tab manually
  - Linear + Jira issue browsing, detail modals, and Dispatch prefill are implemented and unit-tested; remaining: manual QA of the Project Management tab on desktop and web with real Linear/Jira credentials.
- Antigravity legacy streaming, followups, and terminal open: in review, ready to ship
  - Legacy `agy --print` sessions now stream live via official `--output-format stream-json` flags (init/step_update/result NDJSON), accept followup turns on the same conversation via `--conversation <uuid>`, and can open an external terminal through `utils:open-antigravity-session`. ACP path unchanged; no PTY wrappers. Spec addendum added to docs/product-specs/acp-local-dispatch.md; docs validated.
