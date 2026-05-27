/**
 * electron-store schema for RTS Agents desktop config.
 */
const schema = {
  apiKeys: {
    type: 'object',
    properties: {
      cursor: {
        type: 'string',
        default: ''
      },
      jules: {
        type: 'string',
        default: ''
      },
      codex: {
        type: 'string',
        default: ''
      },
      openrouter: {
        type: 'string',
        default: ''
      },
      claude: {
        type: 'string',
        default: ''
      },
      github: {
        type: 'string',
        default: ''
      },
      cloudflare: {
        type: 'string',
        default: ''
      },
      jira: {
        type: 'string',
        default: ''
      }
    },
    default: {}
  },
  cloudflare: {
    type: 'object',
    properties: {
      accountId: { type: 'string', default: '' },
      apiToken: { type: 'string', default: '' },
      namespaceId: { type: 'string', default: '' },
      namespaceTitle: { type: 'string', default: 'rtsa' }
    },
    default: {}
  },
  device: {
    type: 'object',
    properties: {
      id: { type: 'string', default: '' },
      name: { type: 'string', default: '' }
    },
    default: {}
  },
  codexThreads: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        createdAt: { type: 'string' },
        prompt: { type: 'string' },
        repository: { type: 'string' },
        branch: { type: 'string' },
        title: { type: 'string' }
      }
    },
    default: []
  },
  claudeConversations: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
        prompt: { type: 'string' },
        repository: { type: 'string' },
        title: { type: 'string' },
        status: { type: 'string' }
      }
    },
    default: []
  },
  opencodeSessions: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        rawId: { type: 'string' },
        prompt: { type: 'string' },
        projectPath: { type: 'string' },
        status: { type: 'string' },
        filePath: { type: 'string' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' }
      }
    },
    default: []
  },
  antigravitySessions: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        rawId: { type: 'string' },
        prompt: { type: 'string' },
        projectPath: { type: 'string' },
        status: { type: 'string' },
        filePath: { type: 'string' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' }
      }
    },
    default: []
  },
  settings: {
    type: 'object',
    properties: {
      pollingInterval: {
        type: 'number',
        default: 30000,
        minimum: 5000,
        maximum: 300000
      },
      autoPolling: {
        type: 'boolean',
        default: true
      },
      antigravityPaths: {
        type: 'array',
        items: { type: 'string' },
        default: []
      },
      claudePaths: {
        type: 'array',
        items: { type: 'string' },
        default: []
      },
      cursorPaths: {
        type: 'array',
        items: { type: 'string' },
        default: []
      },
      codexPaths: {
        type: 'array',
        items: { type: 'string' },
        default: []
      },
      githubPaths: {
        type: 'array',
        items: { type: 'string' },
        default: []
      },
      jiraBaseUrl: {
        type: 'string',
        default: ''
      },
      cliCommands: {
        type: 'object',
        properties: {
          antigravity: { type: 'string', default: '' },
          claude: { type: 'string', default: '' },
          opencode: { type: 'string', default: '' }
        },
        default: {}
      },
      theme: {
        type: 'string',
        enum: ['light', 'dark', 'system'],
        default: 'system'
      },
      displayMode: {
        type: 'string',
        enum: ['fullscreen', 'windowed'],
        default: 'fullscreen'
      },
      filters: {
        type: 'object',
        properties: {
          providers: {
            type: 'object',
            default: {}
          },
          statuses: {
            type: 'object',
            default: {}
          },
          search: {
            type: 'string',
            default: ''
          }
        },
        default: {}
      },
      selectedModel: {
        type: 'string',
        default: 'openrouter/openai/gpt-4o'
      }
    },
    default: {}
  },
  sessionOutputs: {
    type: 'object',
    default: {}
  }
};

module.exports = { schema };
