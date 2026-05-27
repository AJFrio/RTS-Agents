#!/usr/bin/env node
const configStore = require('../src/main/services/config-store');
const julesService = require('../src/main/services/jules-service');
const cursorService = require('../src/main/services/cursor-service');
const codexService = require('../src/main/services/codex-service');
const claudeService = require('../src/main/services/claude-service');
const githubService = require('../src/main/services/github-service');
const jiraService = require('../src/main/services/jira-service');
const openrouterService = require('../src/main/services/openrouter-service');
const cloudflareKvService = require('../src/main/services/cloudflare-kv-service');
const antigravityService = require('../src/main/services/antigravity-service');
const opencodeService = require('../src/main/services/opencode-service');
const providerHealth = require('../src/main/services/provider-health');

function env(name) {
  return process.env[name] || '';
}

function classify(result) {
  if (!result?.configured && result?.installed !== true) return 'not_configured';
  if (result?.success) return 'ok';
  const text =
    `${result?.status || ''} ${result?.error || ''} ${result?.message || ''}`.toLowerCase();
  if (
    text.includes('401') ||
    text.includes('403') ||
    text.includes('unauthorized') ||
    text.includes('forbidden')
  ) {
    return 'auth_failed';
  }
  if (text.includes('429') || text.includes('rate limit')) return 'rate_limited';
  if (text.includes('404') || text.includes('not found') || text.includes('unsupported'))
    return 'stale_contract';
  return result?.status || 'error';
}

function sanitize(result) {
  return {
    provider: result.provider,
    status: classify(result),
    connected: !!result.connected,
    configured: !!result.configured,
    installed: result.installed,
    message: result.message,
    endpointLabel: result.endpointLabel,
    docsUrl: result.docsUrl,
    checkedAt: result.checkedAt,
  };
}

async function runProbe(provider, fn) {
  try {
    return sanitize(await fn());
  } catch (err) {
    return sanitize(providerHealth.fail(provider, err, { configured: true }));
  }
}

async function main() {
  const apiKeys = {
    jules: env('JULES_API_KEY') || configStore.getApiKey('jules'),
    cursor: env('CURSOR_API_KEY') || configStore.getApiKey('cursor'),
    codex: env('OPENAI_API_KEY') || configStore.getApiKey('codex'),
    claude: env('ANTHROPIC_API_KEY') || configStore.getApiKey('claude'),
    github: env('GITHUB_TOKEN') || configStore.getApiKey('github'),
    jira: env('JIRA_API_TOKEN') || configStore.getApiKey('jira'),
    openrouter: env('OPENROUTER_API_KEY') || configStore.getApiKey('openrouter'),
  };

  julesService.setApiKey(apiKeys.jules);
  cursorService.setApiKey(apiKeys.cursor);
  codexService.setApiKey(apiKeys.codex);
  claudeService.setApiKey(apiKeys.claude);
  githubService.setApiKey(apiKeys.github);
  openrouterService.setApiKey(apiKeys.openrouter);

  const savedGetApiKey = configStore.getApiKey.bind(configStore);
  const savedGetJiraBaseUrl = configStore.getJiraBaseUrl.bind(configStore);
  const jiraBaseUrl = env('JIRA_BASE_URL') || savedGetJiraBaseUrl();
  configStore.getApiKey = (provider) => {
    if (provider === 'jira' && apiKeys.jira) return apiKeys.jira;
    return savedGetApiKey(provider);
  };
  configStore.getJiraBaseUrl = () => jiraBaseUrl;

  const cloudflareConfig = {
    accountId: env('CLOUDFLARE_ACCOUNT_ID') || configStore.getCloudflareConfig()?.accountId,
    apiToken: env('CLOUDFLARE_API_TOKEN') || configStore.getCloudflareConfig()?.apiToken,
  };
  cloudflareKvService.setConfig(cloudflareConfig);
  const codexInstalled = await codexService.isCodexInstalled();

  const probes = [
    [
      'jules',
      () => (apiKeys.jules ? julesService.testConnection() : providerHealth.notConfigured('jules')),
    ],
    [
      'cursor',
      () =>
        apiKeys.cursor ? cursorService.testConnection() : providerHealth.notConfigured('cursor'),
    ],
    [
      'codex',
      () =>
        apiKeys.codex
          ? codexService.testConnection()
          : codexInstalled
            ? providerHealth.ok('codex', {
                configured: true,
                installed: true,
                endpointLabel: 'codex --version',
                docsUrl: 'https://developers.openai.com/codex/noninteractive',
                message: 'Codex CLI is available on this machine.',
              })
            : providerHealth.notConfigured('codex', {
                installed: false,
                message: 'OpenAI API key not configured and Codex CLI not found',
              }),
    ],
    [
      'claude-cloud',
      () =>
        apiKeys.claude
          ? claudeService.testConnection()
          : providerHealth.notConfigured('claude-cloud'),
    ],
    [
      'github',
      () =>
        apiKeys.github ? githubService.testConnection() : providerHealth.notConfigured('github'),
    ],
    [
      'jira',
      () => (apiKeys.jira ? jiraService.testConnection() : providerHealth.notConfigured('jira')),
    ],
    [
      'openrouter',
      () =>
        apiKeys.openrouter
          ? openrouterService.testConnection()
          : providerHealth.notConfigured('openrouter'),
    ],
    [
      'cloudflare',
      async () => {
        if (!cloudflareConfig.accountId || !cloudflareConfig.apiToken) {
          return providerHealth.notConfigured('cloudflare');
        }
        await cloudflareKvService.listNamespaces();
        return providerHealth.ok('cloudflare', {
          configured: true,
          endpointLabel: 'GET /client/v4/accounts/:accountId/storage/kv/namespaces',
          docsUrl: 'https://developers.cloudflare.com/api/resources/kv/',
          message: 'Connected to Cloudflare KV.',
        });
      },
    ],
    ['antigravity', () => antigravityService.testConnection()],
    ['opencode', () => opencodeService.testConnection()],
  ];

  const results = [];
  for (const [provider, probe] of probes) {
    results.push(await runProbe(provider, probe));
  }

  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exitCode = 1;
});
