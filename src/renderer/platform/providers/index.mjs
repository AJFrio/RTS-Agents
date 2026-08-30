/**
 * Provider service registry for the web runtime.
 *
 * Single composition point: builds every provider service with the injected
 * storage adapter / fetch impl / raw key-value store so the whole stack is
 * testable in Node (see tests/unit/web-platform.verify.mjs).
 */

import { createJulesService } from './jules-service.mjs';
import { createCursorService } from './cursor-service.mjs';
import { createCodexService } from './codex-service.mjs';
import { createClaudeService } from './claude-service.mjs';
import { createGithubService } from './github-service.mjs';
import { createJiraService } from './jira-service.mjs';
import { createCloudflareKvService } from './cloudflare-kv-service.mjs';
import { createOpenRouterService } from './openrouter-service.mjs';
import { createAgentOrchestratorService } from './agent-orchestrator-service.mjs';

export function createProviders({ storage, fetchImpl, kv = null } = {}) {
  const openrouter = createOpenRouterService({ storage, fetchImpl });

  return {
    jules: createJulesService({ storage, fetchImpl }),
    cursor: createCursorService({ storage, fetchImpl }),
    codex: createCodexService({ storage, fetchImpl, kv }),
    claude: createClaudeService({ storage, fetchImpl, kv }),
    github: createGithubService({ storage, fetchImpl }),
    jira: createJiraService({ storage, fetchImpl }),
    cloudflareKv: createCloudflareKvService({ storage, fetchImpl }),
    openrouter,
    orchestrator: createAgentOrchestratorService({ openrouter, storage }),
  };
}

export default createProviders;
