import { getServiceDefinition } from './service-catalog.js';

export const SERVICE_GROUPS = [
  { id: 'jules', title: 'Jules', members: ['jules-cloud'] },
  { id: 'cursor', title: 'Cursor', members: ['cursor-cloud', 'cursor-local'] },
  { id: 'codex', title: 'Codex', members: ['codex-cloud', 'codex-local'] },
  { id: 'claude', title: 'Claude', members: ['claude-cloud', 'claude-local'] },
  { id: 'antigravity', title: 'Antigravity CLI', members: ['antigravity-local'] },
  { id: 'opencode', title: 'OpenCode', members: ['opencode-local'] },
  { id: 'openrouter', title: 'OpenRouter', members: ['openrouter-cloud'] },
  { id: 'github', title: 'GitHub', members: ['github-cloud', 'github-local'] },
  { id: 'jira', title: 'Jira', members: ['jira-cloud'] },
  { id: 'cloudflare', title: 'Cloudflare Sync', members: ['cloudflare-sync'] },
];

export function buildConnectedServiceGroups(connectedServices, state) {
  return SERVICE_GROUPS.map((group) => {
    const services = group.members.filter((serviceId) => connectedServices.includes(serviceId));
    if (services.length === 0) return null;
    const statuses = services.map((serviceId) => getServiceStatus(serviceId, state));
    const attention = statuses.find((status) => status && !status.success && !status.connected);
    const summaries = services.map((serviceId) =>
      getServiceSummary(serviceId, state, getServiceStatus(serviceId, state))
    );
    return {
      ...group,
      services,
      status: attention || statuses[0],
      summary: summaries.join(' · '),
      modeLabel: services
        .map((serviceId) =>
          serviceId.endsWith('-local') ? 'Local' : serviceId.endsWith('-cloud') ? 'Cloud' : 'Sync'
        )
        .join(' + '),
      disconnectable: services.some((serviceId) => isDisconnectable(serviceId, state)),
    };
  }).filter(Boolean);
}

export function getServiceStatus(serviceId, state) {
  switch (serviceId) {
    case 'jules-cloud':
      return state.connectionStatus?.jules;
    case 'cursor-cloud':
      return state.connectionStatus?.cursor;
    case 'cursor-local':
      return state.connectionStatus?.['cursor-cli']?.success
        ? { success: true, connected: true }
        : { success: false, error: 'Cursor CLI not detected' };
    case 'codex-cloud':
      return state.connectionStatus?.codex;
    case 'claude-cloud':
      return state.connectionStatus?.['claude-cloud'];
    case 'claude-local':
      return (
        state.connectionStatus?.['claude-cli'] || {
          success: !!state.serviceInfo?.installations?.claude,
        }
      );
    case 'antigravity-local':
      return (
        state.connectionStatus?.antigravity || {
          success: !!state.serviceInfo?.installations?.antigravity,
        }
      );
    case 'opencode-local':
      return (
        state.connectionStatus?.opencode || {
          success: !!state.serviceInfo?.installations?.opencode,
        }
      );
    case 'openrouter-cloud':
      return state.connectionStatus?.openrouter;
    case 'github-cloud':
      return state.connectionStatus?.github;
    case 'jira-cloud':
      return state.connectionStatus?.jira;
    case 'cloudflare-sync':
      return state.computers?.configured
        ? { success: true, connected: true }
        : { success: false, error: 'Not configured' };
    default:
      return { success: true, connected: true };
  }
}

export function getServiceSummary(serviceId, state, status) {
  switch (serviceId) {
    case 'cursor-local':
      if (!state.connectionStatus?.['cursor-cli']?.success) {
        return 'Repository roots saved, but Cursor CLI is not detected locally';
      }
      return state.settings?.cursorPaths?.length > 0
        ? `${state.settings.cursorPaths.length} repository roots linked`
        : 'Cursor CLI detected — add repository roots to enable local tasks';
    case 'codex-local':
      return `${state.settings?.codexPaths?.length || 0} repository roots connected`;
    case 'claude-local':
      return state.serviceInfo?.installations?.claude
        ? `${state.settings?.claudePaths?.length || 0} repository roots linked`
        : 'Repository roots saved, but Claude Code is not detected locally';
    case 'antigravity-local':
      return state.serviceInfo?.installations?.antigravity
        ? `${state.settings?.antigravityPaths?.length || 0} repository roots linked`
        : 'Repository roots saved, but Antigravity CLI is not detected locally';
    case 'opencode-local':
      return state.serviceInfo?.installations?.opencode
        ? `${state.settings?.opencodePaths?.length || 0} repository roots linked`
        : 'Repository roots saved, but OpenCode CLI is not detected locally';
    case 'github-local':
      return `${state.settings?.githubPaths?.length || 0} repository roots connected`;
    case 'jira-cloud':
      return state.settings?.jiraBaseUrl || status?.error || 'Jira is configured';
    case 'cloudflare-sync':
      return state.serviceInfo?.cloudflare?.accountId
        ? `Account ${state.serviceInfo.cloudflare.accountId}`
        : 'Cloudflare KV sync enabled';
    default:
      return status?.error || 'Verified and ready to use';
  }
}

export function isDisconnectable(serviceId, state) {
  if (
    [
      'jules-cloud',
      'cursor-cloud',
      'codex-cloud',
      'claude-cloud',
      'openrouter-cloud',
      'github-cloud',
      'jira-cloud',
      'cloudflare-sync',
    ].includes(serviceId)
  ) {
    return true;
  }
  if (serviceId === 'cursor-local') return (state.settings?.cursorPaths || []).length > 0;
  if (serviceId === 'codex-local') return (state.settings?.codexPaths || []).length > 0;
  if (serviceId === 'opencode-local') return (state.settings?.opencodePaths || []).length > 0;
  if (serviceId === 'claude-local') return (state.settings?.claudePaths || []).length > 0;
  if (serviceId === 'antigravity-local') return (state.settings?.antigravityPaths || []).length > 0;
  if (serviceId === 'github-local') return (state.settings?.githubPaths || []).length > 0;
  return false;
}

export { getServiceDefinition };
