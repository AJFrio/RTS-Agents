# Agent Guide (AGENTS.md)

This file serves as a guide for AI agents and developers working on the **RTS Agents** codebase. It outlines the project structure, coding standards, and best practices to ensure consistency and quality.

## Project Structure

The repository is organized into three main areas:

*   **`src/main/`**: The Electron **main process** code.
    *   **`services/`**: Contains business logic and API integrations (e.g., `jules-service.js`, `claude-service.js`). These are typically singleton classes exported using `module.exports = new Service()`.
    *   **`main.js`**: The entry point for the Electron app.
    *   **`preload.js`**: Preload script exposing safe APIs to the renderer via `contextBridge`.
*   **`src/renderer/`**: The React **renderer process** (frontend) code.
    *   **`components/`**: Reusable UI components.
    *   **`pages/`**: Top-level page components (e.g., `DashboardPage`, `SettingsPage`).
    *   **`context/`**: React Context definitions (e.g., `AppContext`).
    *   **`modals/`**: Modal dialog components.
    *   **`utils/`**: Helper functions (e.g., markdown parsing).
*   **`mobile-webapp/`**: A separate Progressive Web App (PWA) optimized for mobile devices. It shares similar architectural patterns but is a distinct Vite project.

## Coding Standards

### General
*   **Indentation**: Use **2 spaces** for indentation.
*   **Semicolons**: Always use semicolons.
*   **Comments**: Comment complex logic, but prefer self-documenting code (clear variable/function names).
*   **File Naming**: Use `kebab-case` for file names (e.g., `jules-service.js`, `agent-modal.jsx`). Component files use `PascalCase` (e.g., `AgentModal.jsx`).

### Frontend (React)
*   **Components**: Use **Functional Components** with Hooks (`useState`, `useEffect`, etc.).
*   **State Management**: Use the global `AppContext` (`useApp` hook) for shared state. Avoid deep prop drilling.
*   **Styling**: Use **Tailwind CSS**.
    *   Support **Dark Mode** explicitly using the `dark:` modifier (e.g., `bg-white dark:bg-slate-800`).
    *   Use the `slate` color palette for neutrals.
    *   Avoid `!important` unless absolutely necessary to override global styles (like default input backgrounds).
*   **Imports**: Use ESM `import`/`export`.

### Backend (Electron Main)
*   **Modules**: Use CommonJS `require`/`module.exports`.
*   **Services**: Encapsulate logic in Service classes.
    *   Handle errors gracefully (try-catch).
    *   Return Promises for async operations.
    *   Validate inputs (e.g., `JulesService` checks for API keys).
*   **Security**:
    *   Store sensitive data (API keys) in `electron-store` (via `ConfigStore`), never in plain text files.
    *   Validate file paths to prevent directory traversal.

### Testing
*   **Unit Tests**: Located in `tests/`. Run with `npm run test` (Jest).
    *   Note: Some tests may need to transform ESM to CommonJS manually if testing renderer code in Node environment (see `tests/unit/markdown.verify.js`).
*   **E2E Tests**: Located in `tests/` or defined in `playwright.config.js`. Run with `npm run test:e2e`.
    *   On headless environments, use `xvfb-maybe`.
*   **Verification**: Always verify changes. If adding a UI feature, ensure it works in both Light and Dark modes.

## Workflow & Best Practices

*   **UPDATES.md**: This file tracks tasks.
    *   When picking up a task, read the details carefully.
    *   **Crucial**: When a task is completed, **remove it** from `UPDATES.md` to signal completion.
*   **Git**:
    *   Commit messages should be descriptive.
    *   Do not commit build artifacts (e.g., `dist/`, `styles/output.css`).
*   **Environment**:
    *   Ensure `node_modules` are installed (`npm install`).
    *   The app requires a build step for CSS (`npm run build:css` or similar) before running in some modes.

## Specific Gotchas

*   **Markdown**: The app uses a custom markdown parser (`src/renderer/utils/markdown.js`). If modifying markdown rendering, verify against XSS vectors.
*   **Mobile App**: The `mobile-webapp` is a separate entity. Changes to the main desktop app logic might need to be replicated or adapted for the mobile app if applicable.
