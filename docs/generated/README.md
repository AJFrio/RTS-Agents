# Generated documentation

This directory holds **machine-generated** artifacts checked in for agent legibility (schema dumps, IPC inventories, etc.).

## Regeneration

When generators exist, run:

```bash
npm run docs:generate
```

Today this is a placeholder; add scripts as the codebase grows (e.g. `scripts/generate-ipc-inventory.js`).

## Rules

- Do not hand-edit generated files — change the generator instead.
- CI may fail if generated output drifts from source (`npm run validate:docs`).
