<img width="1916" height="997" alt="image" src="https://github.com/user-attachments/assets/ac16d7c3-f19b-4fca-8cf2-3a8571655820" />


## RTS Agents

RTS Agents is 1 dashboard to access all your coding agents and Github repos across all your service providers and devices

It supports:
- **Local CLI-backed agents**: Gemini CLI, Claude Code CLI, Codex CLI, and Cursor CLI (reads local session files and can start new sessions).
- **Cloud agents**: Jules, Cursor Cloud Agents, OpenAI (Codex via Assistants/Threads), and Claude (Anthropic Messages API).
- **AI Powered Github Utilities**: browse your repositories, view open PRs, open PR details, use agents to resolve merge conflicts, and merge PRs without having to jump between sites

---

## What it can do

### Dashboard
- **Unified task list** across providers (Gemini, Jules, Cursor, Codex, Claude CLI, Claude Cloud)
- **Search + filtering** by provider and status
- **Pagination** for large task sets
- **Auto-refresh (polling)** with configurable interval
- **Task completion notifications** (in-app toast + sound when a task transitions to completed)

### Task details
- Click a task card to view **provider-specific details**, such as:
  - Cursor: conversation transcript
  - Jules: activity timeline + PR output (when available)
  - Gemini CLI: lightweight message history extracted from session JSON files
  - Codex: thread messages and run history
  - Claude CLI / Cloud: message history (local sessions or tracked cloud conversations)

### Create new tasks (“New Task” modal)
Create tasks from the UI, with provider-specific options:
- **Jules**: choose connected repo source + branch, optionally auto-create PR
- **Cursor Cloud**: choose repository + ref/branch, optionally auto-create PR
- **Gemini CLI**: choose a local Git repo path, start a detached `gemini` CLI session
- **Codex**: create a new OpenAI thread (tracked locally in the app), prompt-only (repo optional)
- **Claude CLI**: start a detached `claude` CLI session in a local repo
- **Claude Cloud**: prompt-only (no repository required)

### GitHub “Branches” view
When configured with a GitHub token, you can:
- List your GitHub repositories (sorted by updated time)
- View open PRs for a repo
- Open PR details
- **Merge a PR**
- **Mark a draft PR ready for review**

<img width="1908" height="991" alt="image" src="https://github.com/user-attachments/assets/cb1e9388-2f88-452b-a774-36781bddd934" />


---

## Mobile Companion App (PWA)

The repository includes a mobile-optimized Progressive Web App (PWA) in the `mobile-webapp/` directory.

### Capabilities
- **Remote Control**: View connected desktop instances and dispatch tasks to them via Cloudflare KV.
- **Unified Dashboard**: View and filter tasks across all providers, similar to the desktop app.
- **Cloud Agents**: Create and monitor tasks for cloud providers (Jules, Cursor, Codex, Claude Cloud) directly from your phone.
- **GitHub**: View repositories and branches (read-only).

### Limitations
- **No Local Execution**: It cannot run local CLI tools (Gemini/Claude CLI) directly. Instead, it dispatches these tasks to your running desktop instances.
- **Requires Cloudflare KV**: Syncing between desktop and mobile requires Cloudflare KV configuration.
- **Read-Only Device Status**: It views other devices but does not register itself as a compute node.

### Running the Mobile App

1. Navigate to the directory:
   ```bash
   cd mobile-webapp
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start development server:
   ```bash
   npm run dev
   ```
   Or build for production:
   ```bash
   npm run build
   ```

---

## Installation

### Prerequisites
- **Node.js**: recommended **Node 18+** (Electron 28 runtime)
- **npm** (bundled with Node)
- **Git** (required for cloning and for the in-app “Update & Restart” feature)

Optional, depending on features you use:
- **Gemini CLI** (for Gemini local sessions + creating Gemini tasks)
- **Claude Code CLI** (for Claude local sessions + creating Claude CLI tasks)

### Install dependencies (Windows PowerShell)

```powershell
git clone <YOUR_REPO_URL>
cd <YOUR_REPO_FOLDER>
npm ci
```

If you do not have a lockfile or prefer standard install:

```powershell
npm install
```

### Run the app

Production-style start (build minified CSS, then launch Electron):

```powershell
npm run start
```

Developer mode (Tailwind CSS watch + Electron):

```powershell
npm run dev
```

---

## Keys required (and where they’re used)

This app stores provider credentials in a local Electron settings store. You can configure keys in **Settings → API Command Keys**.

### Jules API key (required for Jules)
- **Used for**: listing sessions, listing sources/repos, creating sessions, reading activities
- **Where it’s sent**: `https://jules.googleapis.com/v1alpha/...`
- **Header**: `X-Goog-Api-Key: <key>`
- **How to get it**: from your Jules console / configuration (the app UI hints “Jules console settings”)

### Cursor Cloud API key (required for Cursor)
- **Used for**: listing agents, reading agent details, listing repositories, creating agents
- **Where it’s sent**: `https://api.cursor.com/v0/...`
- **Auth**: HTTP Basic Auth with the API key as the username (empty password)
- **How to get it**: from Cursor settings (the app UI hints “cursor.com/settings”)

### OpenAI API key (required for Codex)
- **Used for**: creating threads, fetching thread/runs/messages for tracked threads
- **Where it’s sent**: `https://api.openai.com/v1/...`
- **Header**: `Authorization: Bearer <key>`
- **Note**: uses `OpenAI-Beta: assistants=v2`
- **How to get it**: from OpenAI API keys (the app UI hints “platform.openai.com/api-keys”)

### Anthropic API key (required for Claude Cloud)
- **Used for**: sending a prompt via the Anthropic Messages API
- **Where it’s sent**: `https://api.anthropic.com/v1/messages`
- **Header**: `x-api-key: <key>`
- **How to get it**: from the Anthropic console (the app UI hints “console.anthropic.com”)

### GitHub Personal Access Token (required for GitHub view + PR actions)
- **Used for**:
  - Listing your repos
  - Listing PRs and branches
  - Fetching PR details
  - Merging PRs
  - Marking PRs ready for review (GraphQL mutation)
- **Where it’s sent**: `https://api.github.com/...` and `https://api.github.com/graphql`
- **Header**: `Authorization: token <token>`
- **Recommended scopes** (classic PAT):
  - `repo` (private repo access + merge)
  - `read:user` (safe default for `/user`)
- **How to get it**: GitHub settings → developer settings → personal access tokens (the app UI hints “github.com/settings/tokens (classic)”)

---

## Local CLI setup (Gemini CLI and Claude CLI)

These providers are **not configured via API key inside this app**. They rely on locally-installed CLIs and their session folders.

### Gemini CLI
- **Detected by**: existence of a Gemini data directory under your home directory:
  - Windows example: `C:\Users\<you>\.gemini\tmp`
- **Starts tasks by running** (detached): `gemini -p "<prompt>" -y`
  - `-p` prompt/headless mode
  - `-y` auto-approve actions
- **Project selection**:
  - In Settings, add **GitHub Repository Paths** (folders that contain your Git repos)
  - The New Task modal will list repos found under those paths (directories containing `.git`)

If Gemini shows as “not installed”:
- Ensure you have installed Gemini CLI and that you’ve run it at least once so it creates its home folder.
- Ensure `gemini` is available on your `PATH` (the app will run `gemini` / `gemini.cmd` depending on OS).

### Claude Code CLI
- **Detected by**: existence of a Claude data directory under your home directory:
  - Windows example: `C:\Users\<you>\.claude\`
- **Reads local sessions from**:
  - `~/.claude/projects/...` (or equivalent on Windows)
- **Starts tasks by running** (detached): `claude -p "<prompt>" --allowedTools "Read,Edit,Bash"`

If Claude CLI shows as “not installed”:
- Ensure Claude Code CLI is installed and that you’ve run it at least once so it creates its home folder.
- Ensure `claude` is available on your `PATH` (the app will run `claude` / `claude.cmd` depending on OS).

---

## Project setup (first run checklist)

1. **Install dependencies** (`npm ci`)
2. **Start the app** (`npm run dev` or `npm run start`)
3. Open **Settings** and configure what you need:
   - Add API keys for any cloud providers you want to use (Jules, Cursor, Codex, Claude Cloud, GitHub)
   - Add **GitHub Repository Paths** so the app can find local repos for Gemini CLI / Claude CLI tasks
   - Optional: add **Gemini CLI Paths** if you keep Gemini projects/sessions in additional locations
4. Go back to **Dashboard** and click **SYNC** to refresh.

---

## Scripts

- `npm run start`: build minified Tailwind CSS and launch Electron
- `npm run dev`: Tailwind CSS watch + launch Electron
- `npm run test`: Jest unit + integration tests
- `npm run test:e2e`: Playwright E2E tests (optimized for headless Linux with `xvfb-maybe`)

### Running Playwright on Windows
The provided `test:e2e` script uses `env` and `xvfb-maybe`, which are typically not available on Windows.

On Windows, install browsers and run Playwright directly:

```powershell
npx playwright install
npx playwright test
```

---

## How it’s built (high level)

- **Electron main process**: `main.js`
  - Owns provider services and IPC handlers
  - Polling emits `agents:refresh-tick` events to the renderer
- **Preload bridge**: `preload.js`
  - Exposes a safe `window.electronAPI` to the renderer via `contextBridge`
- **Renderer UI**: `src/renderer/app.js`
  - Dashboard UI + Settings + New Task modal + GitHub view
- **Provider services**: `src/main/services/*.js`
  - `gemini-service.js` (local session discovery + start session)
  - `claude-service.js` (local session discovery + Anthropic API + start CLI session)
  - `jules-service.js` (Jules API)
  - `cursor-service.js` (Cursor Cloud API)
  - `codex-service.js` (OpenAI Assistants/Threads; tracks created threads locally)
  - `github-service.js` (GitHub REST + GraphQL for “ready for review”)
- **Persistence**: `electron-store` via `src/main/services/config-store.js`
  - Stores API keys, polling settings, repo paths, filters, and tracked Codex/Claude cloud IDs locally.

---

## Troubleshooting

### A provider shows “Offline” or “Error”
- Open **Settings** and use the provider’s **TEST** button.
- Confirm your key/token is valid and has the necessary permissions.

### Gemini / Claude CLI is not detected
- Ensure the CLI is installed and available in `PATH`.
- Run the CLI once manually to create its home directory under your user profile.

### “Update & Restart” does not work
The app runs `git pull` in the current working directory and then relaunches.
- Ensure the app is running from a **git clone** with a configured remote
- Ensure `git` is installed and available in `PATH`
- Ensure your environment has permission to pull from the remote

---

## Notes on security

- API keys are stored locally using `electron-store` with a built-in encryption key in the app. This provides basic at-rest obfuscation but should not be treated as a substitute for OS-level security.
- Prefer tokens with the minimum scopes needed, especially for GitHub.
