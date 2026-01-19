# RTS Agents Dashboard

A centralized dashboard for monitoring and managing various AI agents and CLI tools. This Electron-based application provides a unified interface to track tasks, sessions, and agents from multiple providers including Gemini, Jules, Cursor, OpenAI Codex, and Claude.

## Features

*   **Unified Dashboard:** View all your active and past AI agent sessions in one place.
*   **Multi-Provider Support:** Seamlessly integrates with:
    *   **Gemini CLI:** Monitor local Gemini CLI sessions.
    *   **Jules:** Track Jules agent tasks.
    *   **Cursor:** View Cursor AI agent activities.
    *   **OpenAI Codex:** Interact with OpenAI's Codex.
    *   **Claude:** Support for both Claude Code CLI (local) and Claude Cloud (API).
*   **Task Management:** Create new tasks and sessions directly from the dashboard.
*   **Live Monitoring:** Auto-polling feature to keep session statuses up-to-date.
*   **Configuration Management:** Easy management of API keys, project paths, and settings.
*   **Dark Mode UI:** Modern, clean interface built with Tailwind CSS.

## Supported Agents

1.  **Gemini CLI:** Scans your local `.gemini` directory to track CLI sessions.
2.  **Claude Code:** Supports both local CLI tracking (via `.claude` directory) and cloud-based conversations via Anthropic API.
3.  **Jules:** Integrates with Jules service for task management.
4.  **Cursor:** Connects to Cursor's agent capabilities.
5.  **Codex:** Direct integration with OpenAI's models.

## Prerequisites

*   Node.js (v16 or higher)
*   npm (v7 or higher)
*   Git

## Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd RTS-Agents
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

## Usage

### Running the Application

To start the application in production mode:

```bash
npm start
```

### Development

For development with hot-reloading for CSS:

```bash
npm run dev
```

This command runs `electron .` and `tailwindcss` in watch mode concurrently.

### Building CSS

To manually build the Tailwind CSS output:

```bash
npm run build:css
```

For a minified production build:

```bash
npm run build:css:prod
```

## Project Structure

*   `main.js`: Electron main process entry point. Handles window creation and IPC events.
*   `src/main/services/`: Backend services for each AI provider (Gemini, Claude, Jules, etc.) and configuration management.
*   `src/renderer/`: Frontend logic and UI handling.
*   `src/input.css`: Tailwind CSS input file.
*   `styles/output.css`: Compiled CSS output.
*   `index.html`: Main application window HTML.

## Testing

Run unit tests:
```bash
npm test
```

Run end-to-end tests:
```bash
npm run test:e2e
```

## License

MIT
