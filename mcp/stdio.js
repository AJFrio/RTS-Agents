#!/usr/bin/env node
/**
 * Stdio-to-HTTP bridge for the RTS Agents MCP server.
 *
 * Lets stdio-only MCP clients (Claude Desktop, Codex CLI, OpenCode, ...)
 * connect to the RTS desktop app. Reads newline-delimited JSON-RPC from
 * stdin, POSTs each message to the RTS MCP HTTP endpoint, and writes the
 * JSON-RPC responses to stdout as newline-delimited JSON.
 *
 * Configuration (env or flags):
 *   RTS_MCP_URL / --url      MCP endpoint (default http://127.0.0.1:3210/mcp)
 *   RTS_MCP_TOKEN / --token  Bearer token from RTS Settings (mcp:get-info)
 *
 * Example claude_desktop_config.json entry:
 *   "rts-agents": {
 *     "command": "node",
 *     "args": ["/path/to/RTS-Agents/mcp/stdio.js", "--token", "<token>"]
 *   }
 */

const http = require('http');
const https = require('https');

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

const url = readArg('--url') || process.env.RTS_MCP_URL || 'http://127.0.0.1:3210/mcp';
const token = readArg('--token') || process.env.RTS_MCP_TOKEN || '';

function postRpc(message) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error(`Invalid RTS_MCP_URL: ${url}`));
      return;
    }
    const body = JSON.stringify(message);
    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'Content-Length': Buffer.byteLength(body),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: 120000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 202) {
            resolve(null);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`RTS MCP endpoint returned HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid response from RTS MCP endpoint (HTTP ${res.statusCode})`));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('RTS MCP request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

function write(message) {
  if (message) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  }
}

function writeError(id, code, message) {
  write({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

let buffer = '';

function handleLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    writeError(null, -32700, 'Parse error');
    return;
  }

  postRpc(message)
    .then(write)
    .catch((err) => {
      writeError(message && message.id, -32000, err?.message || 'Bridge request failed');
    });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newlineIndex;
  while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newlineIndex);
    buffer = buffer.slice(newlineIndex + 1);
    handleLine(line);
  }
});
process.stdin.on('end', () => {
  if (buffer.trim()) handleLine(buffer);
  process.exit(0);
});
process.stdin.resume();
