export type MobileServiceId =
  | 'jules'
  | 'cursor'
  | 'codex'
  | 'claude'
  | 'openrouter'
  | 'gemini'
  | 'github'
  | 'jira'
  | 'cloudflare';

export interface MobileServiceDefinition {
  id: MobileServiceId;
  title: string;
  subtitle: string;
  icon: string;
  description: string;
  fields: Array<{
    key: string;
    label: string;
    type: 'text' | 'password';
    placeholder: string;
  }>;
}

export const MOBILE_SERVICE_CATALOG: MobileServiceDefinition[] = [
  {
    id: 'jules',
    title: 'Jules',
    subtitle: 'Cloud assistant',
    icon: 'cloud',
    description: 'Connect Jules to create and monitor hosted coding sessions.',
    fields: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter Jules API key' }],
  },
  {
    id: 'cursor',
    title: 'Cursor',
    subtitle: 'Cloud assistant',
    icon: 'cloud_sync',
    description: 'Connect Cursor Cloud so mobile can launch and inspect Cursor agents.',
    fields: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter Cursor API key' }],
  },
  {
    id: 'codex',
    title: 'Codex',
    subtitle: 'OpenAI assistants',
    icon: 'api',
    description: 'Connect the Codex/OpenAI assistants API used by the mobile dashboard.',
    fields: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter OpenAI API key' }],
  },
  {
    id: 'claude',
    title: 'Claude',
    subtitle: 'Anthropic API',
    icon: 'smart_toy',
    description: 'Connect Anthropic to run Claude conversations from the PWA.',
    fields: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter Anthropic API key' }],
  },
  {
    id: 'openrouter',
    title: 'OpenRouter',
    subtitle: 'Model provider',
    icon: 'hub',
    description: 'Connect OpenRouter for orchestrator model access on mobile.',
    fields: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter OpenRouter API key' }],
  },
  {
    id: 'gemini',
    title: 'Gemini API',
    subtitle: 'Model provider',
    icon: 'token',
    description: 'Connect Gemini API access for model selection and orchestration support.',
    fields: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter Gemini API key' }],
  },
  {
    id: 'github',
    title: 'GitHub',
    subtitle: 'Repository integration',
    icon: 'deployed_code',
    description: 'Connect GitHub so repos, branches, and pull requests load on mobile.',
    fields: [{ key: 'apiKey', label: 'Personal Access Token', type: 'password', placeholder: 'Enter GitHub token' }],
  },
  {
    id: 'jira',
    title: 'Jira',
    subtitle: 'Project integration',
    icon: 'task_alt',
    description: 'Connect Jira with a base URL and API token.',
    fields: [
      { key: 'baseUrl', label: 'Jira Base URL', type: 'text', placeholder: 'https://your-domain.atlassian.net' },
      { key: 'apiKey', label: 'API Token', type: 'password', placeholder: 'Enter Jira token or email:token' },
    ],
  },
  {
    id: 'cloudflare',
    title: 'Cloudflare KV',
    subtitle: 'Remote sync',
    icon: 'cloud_upload',
    description: 'Connect Cloudflare KV to load remote devices and pull keys.',
    fields: [
      { key: 'accountId', label: 'Account ID', type: 'text', placeholder: 'Enter Cloudflare account ID' },
      { key: 'apiToken', label: 'API Token', type: 'password', placeholder: 'Enter Cloudflare API token' },
      { key: 'namespaceTitle', label: 'Namespace Title', type: 'text', placeholder: 'rtsa' },
    ],
  },
];
