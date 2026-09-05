# MCP server (external agent access)

## Summary

The RTS desktop app hosts an MCP (Model Context Protocol) server so external MCP clients — cloud agents, Claude Desktop, Codex CLI, OpenCode, or any MCP-capable harness — can drive RTS directly: dispatch coding-agent tasks, read agent statuses, list repositories and devices, and send follow-ups. This is the programmatic counterpart to the in-app Janus orchestrator: instead of a human (or Janus) driving the UI, an external agent connects over MCP.

## Architecture

| Piece | Location | Role |
|-------|----------|------|
| MCP HTTP server | `src/main/services/mcp-server-service.js` | node:http JSON-RPC endpoint, token auth, tool registry. Delegates to `provider-registry` services. No new npm dependencies. |
| Stdio bridge | `mcp/stdio.js` | For stdio-only MCP clients: reads newline-delimited JSON-RPC on stdin, POSTs to the HTTP endpoint, writes responses to stdout. |
| Config | `config-store` `mcpServer` section | `{ enabled, host, port, token }`. Token auto-generated (32-byte hex) on first enable. |
| Settings IPC | `register-settings.js` | `mcp:get-info`, `mcp:set-config`, `mcp:regenerate-token`. |
| Lifecycle | `main.js` | Starts after `initializeServices()` when enabled; stops on `window-all-closed` / `before-quit`. |

## Protocol

- Transport: Streamable-HTTP-compatible MCP over a single `POST /mcp` endpoint; JSON responses (`202 Accepted` for notifications).
- JSON-RPC 2.0. Supported methods: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`. Protocol version `2025-06-18` (accepts older client versions `2025-03-26`, `2024-11-05`).
- Server info: `rts-agents` with the app version from `package.json`.

## Security

- Every request requires `Authorization: Bearer <token>`; compared with `crypto.timingSafeEqual`. Rotating the token in Settings takes effect immediately (token is read per request).
- Binds to `127.0.0.1` by default. Exposing it beyond localhost changes the threat model: put it behind a tunnel with TLS and treat the token as a secret. The only origin it trusts is the token bearer.
- Request bodies capped at 1 MiB. Provider enums are validated server-side; dispatch paths flow through the existing `resolveTaskProjectPath` validation (allowed repo roots only).
- Token is stored in `electron-store` via `config-store` (same seam as all other secrets; see [SECURITY.md](../SECURITY.md)).

## Tools

| Tool | Arguments | Behavior |
|------|-----------|----------|
| `list_agents` | `provider?`, `status?`, `limit?` | All agents across providers (fresh `fetchAllAgents`, not the discovery cache), with optional filters; returns `agents`, `total`, `counts`, `errors`. |
| `get_agent_details` | `provider`, `rawId`, `filePath?` | Provider-specific detail/transcript via `getAgentDetails`. |
| `list_repositories` | `provider?` | One provider via `fetchRepositories` or all via `fetchAllRepositories`. |
| `dispatch_task` | `provider`, `prompt`, `projectPath?`, `repository?`, `targetDeviceId?`, `model?`, `title?` | Local dispatch on this machine; with `targetDeviceId` queues a remote task on that device through Cloudflare KV (same path as mobile remote dispatch). |
| `send_task_message` | `provider`, `rawId`, `message` | Follow-up message for jules / cursor / claude-cloud. |
| `list_devices` | — | Registered devices from Cloudflare KV with their latest remote task status merged in; `configured: false` when KV is not set up. |

Tool errors surface as MCP `isError` content (e.g. unknown provider, dispatch failure) rather than transport errors.

## Connecting a client

**HTTP clients** (point at the endpoint with the token as a bearer header):

```
http://127.0.0.1:<port>/mcp
Authorization: Bearer <token>
```

**Stdio clients** (Claude Desktop, Codex CLI, OpenCode, ...):

```json
{
  "mcpServers": {
    "rts-agents": {
      "command": "node",
      "args": ["/path/to/RTS-Agents/mcp/stdio.js", "--token", "<token>"]
    }
  }
}
```

`RTS_MCP_URL` / `--url` override the endpoint (default `http://127.0.0.1:3210/mcp`); `RTS_MCP_TOKEN` / `--token` provide the bearer token. The desktop app must be running — the MCP server lives inside it.

## Verification

- Unit tests: `tests/unit/mcp-server-service.test.js` — auth (401s), initialize, tools/list, list_agents filters, dispatch_task success/failure, list_devices merge, unknown tool/method, stop().
- Manual: enable in Settings (`mcp:set-config`), then `curl` the endpoint with the token and run an `initialize` / `tools/list` round-trip.
