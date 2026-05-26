<!--
AGENTS: The first level bullet point is the title of the task. The second level bullet point is the description of the task.
-->

* Performance Review Findings
  * **Blocking I/O in Main Process Services**: Remaining work — polling still full-scans; some `existsSync` install probes remain. Session discovery in Gemini/Claude uses `fs.promises` + `Promise.all`.
  * **Inefficient Polling Mechanism**: The application polls for all agents every 30 seconds by default. This triggers a full file system scan and a full re-render of the agent list, regardless of whether any changes occurred. **Solution**: Replace polling with file system watchers (e.g., `chokidar`) to detect changes in session directories in real-time. Alternatively, implement a caching strategy where the backend only reads files that have changed since the last scan (using `mtime`).
  * **Large IPC Payloads & Renderer Performance**: The entire list of agents is sent from the main process to the renderer on every poll via `agents:get-all`. In the renderer, this list is re-processed and filtered, which can cause frame drops if the list is large. **Solution**: Implement pagination or incremental updates for the agent list to load data on demand. Use `shouldComponentUpdate` or `React.memo` optimizations in the renderer components to avoid unnecessary re-renders.
