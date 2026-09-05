const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  AGENT_LIST_KEYS,
  REPO_LIST_KEYS,
  fetchAllAgents,
  getAgentDetails,
  fetchRepositories,
  fetchAllRepositories,
  createTask,
  sendTaskMessage,
} = require('../ipc/provider-registry');

const MCP_PROTOCOL_VERSION = '2025-06-18';
const MCP_SUPPORTED_PROTOCOL_VERSIONS = new Set([
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
]);
const MCP_ENDPOINT_PATH = '/mcp';
const MCP_MAX_BODY_BYTES = 1024 * 1024;
const MCP_LIST_LIMIT_DEFAULT = 50;
const MCP_LIST_LIMIT_MAX = 200;

const DISPATCH_PROVIDERS = new Set([
  'jules',
  'cursor',
  'antigravity',
  'codex',
  'claude-cli',
  'claude-cloud',
  'opencode',
]);

const MCP_TOOLS = [
  {
    name: 'list_agents',
    description:
      'List coding agents tracked by RTS across all providers with their statuses. Filter by provider or status.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: [...AGENT_LIST_KEYS] },
        status: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: MCP_LIST_LIMIT_MAX },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_agent_details',
    description:
      'Get details for a single agent/task by provider and raw id, including transcript or output where available.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: [...AGENT_LIST_KEYS] },
        rawId: { type: 'string' },
        filePath: { type: 'string' },
      },
      required: ['provider', 'rawId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_repositories',
    description:
      'List repositories available for dispatching tasks, either for one provider or across all providers.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: [...REPO_LIST_KEYS] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'dispatch_task',
    description:
      'Start a coding agent task. Local providers run on this machine; pass targetDeviceId to queue the task on a registered remote device (Cloudflare KV).',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: [...DISPATCH_PROVIDERS] },
        prompt: { type: 'string', minLength: 1 },
        projectPath: { type: 'string' },
        repository: { type: 'string' },
        targetDeviceId: { type: 'string' },
        model: { type: 'string' },
        title: { type: 'string' },
      },
      required: ['provider', 'prompt'],
      additionalProperties: false,
    },
  },
  {
    name: 'send_task_message',
    description:
      'Send a follow-up message to a running cloud agent (jules, cursor, claude-cloud).',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['jules', 'cursor', 'claude-cloud'] },
        rawId: { type: 'string' },
        message: { type: 'string', minLength: 1 },
      },
      required: ['provider', 'rawId', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_devices',
    description:
      'List registered devices (via Cloudflare KV) with their latest remote task status. Requires Cloudflare KV to be configured.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
];

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return MCP_LIST_LIMIT_DEFAULT;
  return Math.min(Math.floor(n), MCP_LIST_LIMIT_MAX);
}

function timingsafeTokenMatch(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

let cachedServerVersion = null;

function serverVersion() {
  if (cachedServerVersion) return cachedServerVersion;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf8'));
    cachedServerVersion = typeof pkg.version === 'string' && pkg.version ? pkg.version : '1.0.0';
  } catch (err) {
    console.error('Failed to read package version for MCP serverInfo:', err.message);
    cachedServerVersion = '1.0.0';
  }
  return cachedServerVersion;
}

class McpServerService {
  constructor() {
    this.server = null;
    this.deps = null;
  }

  async start(deps) {
    if (!deps || !deps.configStore) {
      throw new Error('MCP server requires deps with configStore');
    }
    this.deps = deps;
    const cfg = deps.configStore.getMcpConfig();
    if (!cfg.enabled) {
      return this.status();
    }
    if (this.server) {
      return this.status();
    }

    deps.configStore.getOrCreateMcpToken();
    const server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        console.error('MCP server request error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }));
      });
    });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(cfg.port, cfg.host, () => resolve());
    });
    server.removeAllListeners('error');
    server.on('error', (err) => console.error('MCP server error:', err));
    this.server = server;
    return this.status();
  }

  async stop() {
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise((resolve) => server.close(() => resolve()));
  }

  status() {
    const cfg = this.deps?.configStore?.getMcpConfig?.() || {
      enabled: false,
      host: '127.0.0.1',
      port: 3210,
      token: '',
    };
    const address = this.server ? this.server.address() : null;
    const port = typeof address?.port === 'number' ? address.port : cfg.port;
    return {
      running: !!this.server,
      enabled: cfg.enabled,
      host: cfg.host,
      port,
      url: `http://${cfg.host}:${port}${MCP_ENDPOINT_PATH}`,
      tokenSet: !!cfg.token,
    };
  }

  isAuthorized(req) {
    const token = this.deps?.configStore?.getMcpConfig?.().token || '';
    const header = req.headers?.authorization || '';
    if (!token || !header.startsWith('Bearer ')) return false;
    return timingsafeTokenMatch(header.slice('Bearer '.length).trim(), token);
  }

  async handleRequest(req, res) {
    if (req.method !== 'POST' || req.url !== MCP_ENDPOINT_PATH) {
      res.writeHead(req.url === MCP_ENDPOINT_PATH ? 405 : 404, {
        'Content-Type': 'application/json',
        Allow: 'POST',
      });
      res.end(JSON.stringify({ error: 'Method or path not allowed' }));
      return;
    }

    if (!this.isAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let raw = '';
    let overflow = false;
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MCP_MAX_BODY_BYTES) {
        overflow = true;
        req.destroy();
      }
    });

    await new Promise((resolve, reject) => {
      req.on('end', resolve);
      req.on('error', reject);
    });

    if (overflow) return;

    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      this.writeJsonRpc(res, { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null });
      return;
    }

    if (Array.isArray(message)) {
      const responses = [];
      for (const entry of message) {
        const response = await this.handleJsonRpc(entry);
        if (response) responses.push(response);
      }
      if (responses.length === 0) {
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end();
      } else {
        this.writeJsonRpc(res, responses);
      }
      return;
    }

    const response = await this.handleJsonRpc(message);
    if (response) {
      this.writeJsonRpc(res, response);
    } else {
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end();
    }
  }

  writeJsonRpc(res, body) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  async handleJsonRpc(message) {
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request' },
        id: message && typeof message === 'object' ? message.id ?? null : null,
      };
    }
    if (typeof message.method !== 'string') {
      return {
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request' },
        id: message.id ?? null,
      };
    }

    const isNotification = message.id === undefined || message.id === null;

    try {
      switch (message.method) {
        case 'initialize': {
          const requested = message.params?.protocolVersion;
          const protocolVersion =
            MCP_SUPPORTED_PROTOCOL_VERSIONS.has(requested) || typeof requested !== 'string'
              ? MCP_PROTOCOL_VERSION
              : requested;
          return {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              protocolVersion,
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: 'rts-agents', version: serverVersion() },
            },
          };
        }
        case 'notifications/initialized':
          return null;
        case 'ping':
          return { jsonrpc: '2.0', id: message.id, result: {} };
        case 'tools/list':
          return { jsonrpc: '2.0', id: message.id, result: { tools: MCP_TOOLS } };
        case 'tools/call':
          return {
            jsonrpc: '2.0',
            id: message.id,
            result: await this.callTool(message.params || {}),
          };
        default: {
          const errorResponse = {
            jsonrpc: '2.0',
            error: { code: -32601, message: `Method not found: ${message.method}` },
            id: message.id ?? null,
          };
          return isNotification ? null : errorResponse;
        }
      }
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id: message.id ?? null,
        error: { code: -32603, message: err?.message || 'Internal error' },
      };
    }
  }

  async callTool({ name, arguments: args }) {
    const tool = MCP_TOOLS.find((entry) => entry.name === name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const payload = await this.executeTool(name, args || {});
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        isError: payload && payload.error ? true : undefined,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: err?.message || 'Tool execution failed' }],
        isError: true,
      };
    }
  }

  async executeTool(name, args) {
    const deps = this.deps;
    switch (name) {
      case 'list_agents': {
        const result = await fetchAllAgents(deps);
        let agents = Array.isArray(result.agents) ? result.agents : [];
        if (args.provider) {
          agents = agents.filter((agent) => agent.provider === args.provider);
        }
        if (args.status) {
          const wanted = String(args.status).toLowerCase();
          agents = agents.filter(
            (agent) => String(agent.status || '').toLowerCase() === wanted
          );
        }
        return {
          agents: agents.slice(0, clampLimit(args.limit)),
          total: agents.length,
          counts: result.counts || {},
          errors: result.errors || [],
        };
      }
      case 'get_agent_details': {
        const rawId = String(args.rawId || '');
        if (!rawId) throw new Error('rawId is required');
        return await getAgentDetails(deps, {
          provider: args.provider,
          rawId,
          filePath: args.filePath || undefined,
        });
      }
      case 'list_repositories': {
        if (args.provider) {
          return await fetchRepositories(deps, args.provider);
        }
        return await fetchAllRepositories(deps);
      }
      case 'dispatch_task': {
        const prompt = String(args.prompt || '');
        if (!prompt.trim()) throw new Error('prompt is required');
        if (!DISPATCH_PROVIDERS.has(args.provider)) {
          throw new Error(`Unknown provider: ${args.provider}`);
        }
        const options = {
          prompt,
          attachments: [],
        };
        if (typeof args.projectPath === 'string' && args.projectPath) {
          options.projectPath = args.projectPath;
        }
        if (typeof args.repository === 'string' && args.repository) {
          options.repository = args.repository;
        }
        if (typeof args.targetDeviceId === 'string' && args.targetDeviceId) {
          options.targetDeviceId = args.targetDeviceId;
        }
        if (typeof args.model === 'string' && args.model) {
          options.model = args.model;
        }
        if (typeof args.title === 'string' && args.title) {
          options.title = args.title;
        }
        return await createTask(deps, { provider: args.provider, options });
      }
      case 'send_task_message': {
        const message = String(args.message || '');
        const rawId = String(args.rawId || '');
        if (!message.trim()) throw new Error('message is required');
        if (!rawId) throw new Error('rawId is required');
        return await sendTaskMessage(deps, {
          provider: args.provider,
          rawId,
          message,
        });
      }
      case 'list_devices': {
        const { cloudflareKvService, lifecycle } = deps;
        if (!cloudflareKvService || !lifecycle?.ensureCloudflareNamespaceId) {
          throw new Error('Cloudflare KV is not available');
        }
        const namespaceId = await lifecycle.ensureCloudflareNamespaceId();
        if (!namespaceId) {
          return { configured: false, devices: [] };
        }
        const [devices, tasks] = await Promise.all([
          cloudflareKvService.ensureDevicesArray(namespaceId),
          cloudflareKvService.getTasksMap(namespaceId),
        ]);
        return {
          configured: true,
          devices: (Array.isArray(devices) ? devices : []).map((device) => ({
            ...device,
            taskStatus: device?.id ? tasks?.[device.id] || null : null,
          })),
        };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}

module.exports = new McpServerService();
