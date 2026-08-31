import { useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { getServiceStatus, getServiceSummary, isDisconnectable } from './service-status.js';

/**
 * Extracted connected-services logic (previously inline in SettingsPage) so
 * the Plugins tab can own it without a one-off copy.
 */
export function useConnectedServices() {
  const { state, api, loadSettings, checkConnectionStatus, openConfirmModal } = useApp();

  const connectedServices = useMemo(
    () => buildConnectedServices(state),
    [state.serviceInfo, state.settings, state.computers, state.connectionStatus]
  );

  const disconnectService = useCallback(
    async (serviceId) => {
      if (!api) return;

      try {
        if (serviceId === 'jules-cloud') {
          await api.removeApiKey('jules');
        } else if (serviceId === 'cursor-cloud') {
          await api.removeApiKey('cursor');
        } else if (serviceId === 'codex-cloud') {
          await api.removeApiKey('codex');
        } else if (serviceId === 'claude-cloud') {
          await api.removeApiKey('claude');
        } else if (serviceId === 'openrouter-cloud') {
          await api.removeApiKey('openrouter');
        } else if (serviceId === 'github-cloud') {
          await api.removeApiKey('github');
        } else if (serviceId === 'jira-cloud') {
          await api.removeApiKey('jira');
          await api.setJiraBaseUrl('');
        } else if (serviceId === 'cloudflare-sync') {
          await api.clearCloudflareConfig();
        } else if (serviceId === 'cursor-local') {
          for (const pathValue of state.settings?.cursorPaths || []) {
            await api.removeCursorPath(pathValue);
          }
        } else if (serviceId === 'codex-local') {
          for (const pathValue of state.settings?.codexPaths || []) {
            await api.removeCodexPath(pathValue);
          }
        } else if (serviceId === 'opencode-local') {
          for (const pathValue of state.settings?.opencodePaths || []) {
            await api.removeOpenCodePath(pathValue);
          }
        } else if (serviceId === 'claude-local') {
          for (const pathValue of state.settings?.claudePaths || []) {
            await api.removeClaudePath(pathValue);
          }
        } else if (serviceId === 'antigravity-local') {
          for (const pathValue of state.settings?.antigravityPaths || []) {
            await api.removeAntigravityPath(pathValue);
          }
        } else if (serviceId === 'github-local') {
          for (const pathValue of state.settings?.githubPaths || []) {
            await api.removeGithubPath(pathValue);
          }
        }

        await loadSettings();
        await checkConnectionStatus();
      } catch (err) {
        console.error(`Failed to disconnect ${serviceId}:`, err?.message || err);
      }
    },
    [api, checkConnectionStatus, loadSettings, state.settings]
  );

  const disconnectServiceGroup = useCallback(
    (group) => {
      openConfirmModal({
        title: `Disconnect ${group.title}?`,
        message: `This will remove the saved ${group.modeLabel.toLowerCase()} connection for ${group.title}.`,
        onConfirm: async () => {
          for (const serviceId of group.services) {
            if (isDisconnectable(serviceId, state)) {
              await disconnectService(serviceId);
            }
          }
        },
      });
    },
    [disconnectService, openConfirmModal, state]
  );

  return { connectedServices, disconnectService, disconnectServiceGroup };
}

export function buildConnectedServices(state) {
  const services = [];
  const apiKeys = state.serviceInfo?.apiKeys || {};

  if (apiKeys.jules) services.push('jules-cloud');
  if (apiKeys.cursor) services.push('cursor-cloud');
  if ((state.settings?.cursorPaths || []).length > 0 || state.connectionStatus?.['cursor-cli']?.success)
    services.push('cursor-local');
  if (apiKeys.codex) services.push('codex-cloud');
  if ((state.settings?.codexPaths || []).length > 0) services.push('codex-local');
  if (apiKeys.claude) services.push('claude-cloud');
  if (state.serviceInfo?.installations?.claude || (state.settings?.claudePaths || []).length > 0)
    services.push('claude-local');
  if (
    state.serviceInfo?.installations?.antigravity ||
    (state.settings?.antigravityPaths || []).length > 0
  )
    services.push('antigravity-local');
  if (
    state.serviceInfo?.installations?.opencode ||
    (state.settings?.opencodePaths || []).length > 0
  )
    services.push('opencode-local');
  if (apiKeys.openrouter) services.push('openrouter-cloud');
  if (apiKeys.github) services.push('github-cloud');
  if ((state.settings?.githubPaths || []).length > 0) services.push('github-local');
  if (apiKeys.jira || state.settings?.jiraBaseUrl) services.push('jira-cloud');
  if (state.serviceInfo?.cloudflare?.configured || state.computers?.configured)
    services.push('cloudflare-sync');

  return [...new Set(services)];
}

export { getServiceStatus, getServiceSummary, isDisconnectable };
