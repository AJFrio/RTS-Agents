import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import { Card } from '../components/ui/Card.jsx';
import { formatTimeAgo } from '../utils/format.js';

function ComputerCard({ device }) {
  const name = device?.name || device?.id || 'UNKNOWN';
  const id = device?.id || '--';
  const lastHeartbeat = device?.lastHeartbeat || device?.heartbeatAt || device?.updatedAt || null;
  const then = lastHeartbeat ? new Date(lastHeartbeat) : null;
  const status = typeof device?.status === 'string' ? device.status.toLowerCase() : '';
  const online = status ? status === 'on' : (then ? Date.now() - then.getTime() < 6 * 60 * 1000 : false);
  const statusLabel = online ? 'ONLINE' : 'OFFLINE';
  const statusClass = online ? 'text-emerald-500 bg-emerald-500/20' : 'text-slate-400 bg-slate-700';
  const isHeadless = String(device?.deviceType || '').toLowerCase() === 'headless';

  let tools = [];
  if (Array.isArray(device?.tools) && device.tools.length > 0 && device.tools[0]?.['CLI tools']) {
    tools = device.tools[0]['CLI tools'];
  }

  return (
    <Card className="rounded-xl shadow-sm hover:shadow-md p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] technical-font text-slate-500">COMPUTER</div>
          <div className="mt-1 text-lg font-display font-bold text-slate-800 dark:text-white uppercase tracking-tight line-clamp-1">
            {name}
          </div>
          <div className="mt-1 text-[10px] technical-font text-slate-500">ID: {id}</div>
        </div>
        <span className={`px-2.5 py-1 text-xs font-medium rounded-md ${statusClass}`}>{statusLabel}</span>
      </div>
      {isHeadless && (
        <div className="mt-3 p-2 border border-yellow-500/30 bg-yellow-500/10 text-yellow-200 text-[10px] technical-font">
          HEADLESS_DEVICE: no local UI, compute-only
        </div>
      )}
      <div className="mt-4 space-y-3">
        <div>
          <div className="text-[9px] technical-font text-slate-500 mb-1">LAST_HEARTBEAT</div>
          <div className="text-xs font-mono text-slate-300">
            {lastHeartbeat ? formatTimeAgo(lastHeartbeat) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[9px] technical-font text-slate-500 mb-2">LOCAL_CLI_TOOLS</div>
          <div className="flex flex-wrap gap-2">
            {tools.includes?.('Gemini CLI') && (
              <span className="px-2 py-0.5 text-[10px] technical-font border border-emerald-500 text-emerald-500">
                GEMINI_CLI
              </span>
            )}
            {tools.includes?.('claude CLI') && (
              <span className="px-2 py-0.5 text-[10px] technical-font border border-orange-500 text-orange-500">
                CLAUDE_CLI
              </span>
            )}
            {tools.includes?.('Codex CLI') && (
              <span className="px-2 py-0.5 text-[10px] technical-font border border-cyan-500 text-cyan-500">
                CODEX_CLI
              </span>
            )}
            {tools.length === 0 && (
              <span className="text-[10px] technical-font text-slate-500">NONE_DETECTED</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function ComputersPage() {
  const { state, setView, api, fetchComputers } = useApp();
  const { computers, currentView } = state;

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

  return (
    <div id="view-computers" className="view-content">
      <div id="computers-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {computers.list.map((device) => (
          <ComputerCard key={device.id || device.name} device={device} />
        ))}
      </div>
    </div>
  );
}
