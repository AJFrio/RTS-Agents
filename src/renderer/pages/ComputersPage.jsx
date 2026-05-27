import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import { Card } from '../components/ui/Card.jsx';
import { formatTimeAgo } from '../utils/format.js';

function pickPreferredProvider(tools) {
  if (!Array.isArray(tools)) return 'antigravity';
  if (tools.includes('Antigravity CLI')) return 'antigravity';
  if (tools.includes('OpenCode CLI')) return 'opencode';
  if (tools.includes('claude CLI')) return 'claude-cli';
  if (tools.includes('Codex CLI')) return 'codex';
  return 'antigravity';
}

function getTools(device) {
  if (Array.isArray(device?.tools) && device.tools.length > 0 && device.tools[0]?.['CLI tools']) {
    return device.tools[0]['CLI tools'];
  }
  return [];
}

function ToolChip({ children, className }) {
  return <span className={`rounded-md border px-2 py-0.5 text-xs ${className}`}>{children}</span>;
}

function ComputerCard({ device, onQueueTask, isThisDevice }) {
  const name = device?.name || device?.id || 'Unknown device';
  const id = device?.id || '--';
  const lastHeartbeat = device?.lastHeartbeat || device?.heartbeatAt || device?.updatedAt || null;
  const then = lastHeartbeat ? new Date(lastHeartbeat) : null;
  const status = typeof device?.status === 'string' ? device.status.toLowerCase() : '';
  const online = status
    ? status === 'on'
    : then
      ? Date.now() - then.getTime() < 6 * 60 * 1000
      : false;
  const statusLabel = online ? 'Online' : 'Offline';
  const statusClass = online
    ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/20'
    : 'text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700';
  const isHeadless = String(device?.deviceType || '').toLowerCase() === 'headless';
  const tools = getTools(device);

  return (
    <Card className="rounded-xl p-4 shadow-sm hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Computer</div>
          <div className="mt-1 line-clamp-1 text-lg font-display font-bold tracking-tight text-slate-800 dark:text-white">
            {name}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Device ID: {id}</div>
          {isThisDevice && (
            <div className="mt-1 text-xs font-medium text-primary">This installation</div>
          )}
        </div>
        <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      {isHeadless && (
        <div className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-700 dark:text-yellow-200">
          Headless runner: no local UI, available for queued work only.
        </div>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Last heartbeat
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300">
            {lastHeartbeat ? formatTimeAgo(lastHeartbeat) : '--'}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            Supported agents
          </div>
          <div className="flex flex-wrap gap-2">
            {tools.includes?.('Antigravity CLI') && (
              <ToolChip className="border-emerald-500 text-emerald-600 dark:text-emerald-400">
                Antigravity CLI
              </ToolChip>
            )}
            {tools.includes?.('claude CLI') && (
              <ToolChip className="border-orange-500 text-orange-600 dark:text-orange-400">
                Claude CLI
              </ToolChip>
            )}
            {tools.includes?.('Codex CLI') && (
              <ToolChip className="border-cyan-500 text-cyan-600 dark:text-cyan-400">
                Codex CLI
              </ToolChip>
            )}
            {tools.includes?.('OpenCode CLI') && (
              <ToolChip className="border-violet-500 text-violet-600 dark:text-violet-400">
                OpenCode CLI
              </ToolChip>
            )}
            {tools.length === 0 && (
              <span className="text-xs text-slate-500">No local agents detected</span>
            )}
          </div>
        </div>
        {online && tools.length > 0 && (
          <div className="mt-4 border-t border-slate-200 pt-3 dark:border-border-dark">
            <button
              type="button"
              onClick={onQueueTask}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/50 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              <span className="material-symbols-outlined text-sm">send</span>
              Queue task on this device
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function ComputersPage() {
  const { state, setView, api, fetchComputers, openNewTaskModal } = useApp();
  const { computers, currentView, localDeviceId } = state;

  useEffect(() => {
    if (currentView === 'computers' && api?.listComputers) {
      fetchComputers();
    }
  }, [currentView, api, fetchComputers]);

  if (computers.loading && computers.list.length === 0) {
    return (
      <div id="view-computers" className="view-content">
        <LoadingSpinner label="Fetching Computers..." />
      </div>
    );
  }

  if (!computers.configured) {
    return (
      <div id="view-computers" className="view-content">
        <EmptyState
          icon="computer"
          title="No Computers Found"
          subtitle="Configure Cloudflare KV in Settings to see available computers."
          actionLabel="Open Settings"
          onAction={() => setView('settings')}
        />
      </div>
    );
  }

  if (computers.list.length === 0) {
    return (
      <div id="view-computers" className="view-content">
        <EmptyState
          icon="computer"
          title="No Computers Found"
          subtitle="No devices have reported a heartbeat yet."
          actionLabel="Open Settings"
          onAction={() => setView('settings')}
        />
      </div>
    );
  }

  const onlineCount = computers.list.filter((device) => {
    const lastHeartbeat = device?.lastHeartbeat || device?.heartbeatAt || device?.updatedAt || null;
    const then = lastHeartbeat ? new Date(lastHeartbeat) : null;
    const status = typeof device?.status === 'string' ? device.status.toLowerCase() : '';
    return status ? status === 'on' : then ? Date.now() - then.getTime() < 6 * 60 * 1000 : false;
  }).length;

  return (
    <div id="view-computers" className="view-content">
      <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-border-dark dark:bg-card-dark">
        <div className="text-sm font-semibold text-slate-900 dark:text-white">
          {onlineCount} of {computers.list.length} computers online
        </div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Online computers with supported local agents can receive queued remote tasks.
        </div>
      </div>
      <div id="computers-grid" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {computers.list.map((device) => {
          const tools = getTools(device);
          return (
            <ComputerCard
              key={device.id || device.name}
              device={device}
              isThisDevice={!!(localDeviceId && device.id === localDeviceId)}
              onQueueTask={() => {
                openNewTaskModal({
                  presetEnvironment: 'remote',
                  presetTargetDeviceId: device.id,
                  presetPreferredProvider: pickPreferredProvider(tools),
                });
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
