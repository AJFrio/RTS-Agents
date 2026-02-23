<!--
AGENTS: The first level bullet point is the title of the task. The second level bullet point is the description of the task.
-->

* Performance: Blocking I/O in Main Process Services
  * **Problem**: `GeminiService` and `ClaudeService` (and potentially `ProjectService`) use synchronous file system operations (`fs.readdirSync`, `fs.readFileSync`, `fs.statSync`) within loops to scan directories and read session files. This blocks the Electron main thread, leading to UI freezes and unresponsiveness, especially as the number of projects and sessions grows. **Solution**: Refactor these services to use asynchronous `fs.promises` methods and `Promise.all` to handle file operations in parallel without blocking the event loop, specifically in `discoverProjects`, `getProjectSessions`, and `getAllAgents`.

* Performance: Inefficient Polling Mechanism
  * **Problem**: The application polls for all agents every 30 seconds by default. This triggers a full file system scan (due to Issue #1) and a full re-render of the agent list, regardless of whether any changes occurred. **Solution**: Replace polling with file system watchers (e.g., `chokidar`) to detect changes in session directories in real-time. Alternatively, implement a caching strategy where the backend only reads files that have changed since the last scan (using `mtime`).

* Performance: Large IPC Payloads & Renderer Performance
  * **Problem**: The entire list of agents is sent from the main process to the renderer on every poll via `agents:get-all`. In the renderer, this list is re-processed and filtered, which can cause frame drops if the list is large. **Solution**: Implement pagination or incremental updates for the agent list to load data on demand. Use `shouldComponentUpdate` or `React.memo` optimizations in the renderer components to avoid unnecessary re-renders.

* Performance: Agent Orchestrator Recursion Risk
  * **Problem**: The `AgentOrchestrator.chat` method uses recursion to handle tool calls. While there is a depth limit check, this approach is less robust than an iterative loop and complicates state management if the conversation grows long. **Solution**: Refactor the `chat` method to use an iterative `while` loop to handle multiple tool turns instead of recursion.

* Performance: Synchronous `ProjectService.getLocalRepos`
  * **Problem**: `ProjectService.getLocalRepos` performs synchronous file checks (`fs.existsSync`, `fs.readdirSync`) inside a loop over configured paths. **Solution**: Convert `getLocalRepos` to use `fs.promises` and process directories concurrently.
