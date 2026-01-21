// Common types for the RTS Agents mobile app

export type Provider = 'jules' | 'cursor' | 'codex' | 'claude-cloud';
export type AgentStatus = 'running' | 'completed' | 'pending' | 'failed' | 'stopped';

export interface AgentTask {
  id: string;
  provider: Provider;
  name: string;
  status: AgentStatus;
  prompt: string;
  repository: string | null;
  branch: string | null;
  prUrl: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  summary: string | null;
  rawId: string;
  webUrl: string | null;
  source?: string | null;
}

export interface AgentDetails extends AgentTask {
  activities?: Activity[];
  conversation?: ConversationMessage[];
  messages?: Message[];
}

export interface Activity {
  id: string;
  type: string;
  originator?: string;
  title?: string | null;
  description?: string | null;
  timestamp?: string;
  artifacts?: unknown[];
}

export interface ConversationMessage {
  id: string;
  type: string;
  text: string;
  isUser: boolean;
}

export interface Message {
  id: string;
  role: string;
  content: string;
  createdAt?: Date | null;
  timestamp?: string | null;
}

export interface Repository {
  id: string;
  name: string;
  url?: string;
  owner?: string | null;
  repo?: string | null;
  displayName: string;
  defaultBranch?: string;
}

export interface Branch {
  name: string;
  commit?: {
    sha: string;
    url?: string;
  };
  protected?: boolean;
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  state: string;
  body: string | null;
  html_url: string;
  user: {
    login: string;
    avatar_url: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  created_at: string;
  updated_at: string;
  mergeable?: boolean;
  mergeable_state?: string;
  draft?: boolean;
  node_id?: string;
}

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  owner: {
    login: string;
    avatar_url: string;
  };
  default_branch: string;
  updated_at: string;
}

export interface Computer {
  id: string;
  name: string;
  deviceType?: 'desktop' | 'headless' | string;
  platform: string;
  status: 'on' | 'off';
  lastHeartbeat?: string;
  lastStatusAt?: string;
  tools?: Array<{
    'CLI tools': string[];
  }>;
  repos?: {
    name: string;
    path: string | null;
  }[];
  reposUpdatedAt?: string;
}

export interface TaskCreateOptions {
  prompt: string;
  repository: string;
  branch?: string;
  autoCreatePr?: boolean;
  title?: string;
}

export interface ApiKeyStatus {
  jules: boolean;
  cursor: boolean;
  codex: boolean;
  claude: boolean;
  jira: boolean;
  github: boolean;
  cloudflare: boolean;
}

export interface CloudflareConfig {
  accountId: string;
  apiToken: string;
  namespaceId?: string;
  namespaceTitle?: string;
}

export interface AppSettings {
  pollingInterval: number;
  autoPolling: boolean;
  theme: 'system' | 'light' | 'dark';
  jiraBaseUrl?: string;
}

export interface ProviderCounts {
  jules: number;
  cursor: number;
  codex: number;
  'claude-cloud': number;
  total: number;
}
