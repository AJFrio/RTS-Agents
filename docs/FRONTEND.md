# Frontend (Renderer)

## Stack

- React 18 functional components + hooks
- Vite build → `dist/renderer/`
- Tailwind CSS 3 (`src/renderer/index.css`, `tailwind.config.js`)
- Global state: `src/renderer/context/AppContext.jsx`
- Safe Electron API: `src/renderer/context/ElectronAPI.jsx` / `preload.js`

## Structure

```
src/renderer/
  App.jsx              # Routes / layout shell
  pages/               # Dashboard, Settings, Agent, GitHub, Computers, …
  components/          # Reusable UI (ui/, layout/, settings/)
  modals/              # NewTask, PR, repo creation, …
  context/             # AppContext, ElectronAPI
  utils/               # markdown.js (custom parser — XSS-sensitive)
```

## Conventions

- **ESM** `import`/`export` in renderer code.
- **File names**: kebab-case for modules; PascalCase for component files (e.g. `AgentModal.jsx`).
- **Styling**: Tailwind only; avoid inline styles except dynamic values.
- **Icons**: Material-style names in `service-catalog.js` map to icon font classes.
- **Polling**: Driven by main process events; renderer subscribes via `electronAPI`, do not duplicate provider polling in React.

## Markdown rendering

`utils/markdown.js` is custom. Any change must preserve XSS safety (no raw HTML from untrusted agent output). Run `tests/unit/markdown.verify.js` after edits.

## Adding a UI feature

1. Add IPC + preload method if backend data is needed.
2. Extend `AppContext` only for cross-page state.
3. Verify light + dark mode.
4. Add unit test if pure logic; E2E if critical user path.

## Mobile parity

`mobile-webapp/` mirrors concepts (dashboard, settings, agents) in TypeScript. Not every desktop feature exists on mobile; check [ARCHITECTURE.md](../ARCHITECTURE.md) before porting.
