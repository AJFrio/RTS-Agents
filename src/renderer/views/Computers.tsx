import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';

const Computers: React.FC = () => {
  const { computers, loadComputers, setView } = useApp();

  useEffect(() => {
    loadComputers();
  }, []);

  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'NOW';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}M_AGO`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}H_AGO`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}D_AGO`;
    return date.toLocaleDateString();
  };

  if (computers.loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <span className="material-symbols-outlined text-primary text-4xl animate-spin">sync</span>
        <p className="mt-4 technical-font text-slate-400">Fetching Computers...</p>
      </div>
    );
  }

  if (!computers.configured) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <span className="material-symbols-outlined text-slate-600 text-6xl">computer</span>
        <h3 className="mt-4 text-lg font-bold dark:text-white uppercase tracking-tight">No Computers Found</h3>
        <p className="mt-2 text-slate-500 text-center max-w-md text-sm">
          Configure Cloudflare KV in Settings to see available computers.
        </p>
        <button
          onClick={() => setView('settings')}
          className="mt-4 bg-primary text-black px-6 py-2 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md hover:brightness-110 active:scale-[0.98] transition-all duration-200"
        >
          Open Settings
        </button>
      </div>
    );
  }

  if (computers.list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <span className="material-symbols-outlined text-slate-600 text-6xl">computer</span>
        <h3 className="mt-4 text-lg font-bold dark:text-white uppercase tracking-tight">No Computers Found</h3>
        <p className="mt-2 text-slate-500 text-center max-w-md text-sm">
          No devices have reported a heartbeat yet.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {computers.list.map(device => {
        const name = device?.name || device?.id || 'UNKNOWN';
        const id = device?.id || '--';
        const lastHeartbeat = device?.lastHeartbeat || device?.heartbeatAt || device?.updatedAt || null;
        const then = lastHeartbeat ? new Date(lastHeartbeat) : null;
        const status = typeof device?.status === 'string' ? device.status.toLowerCase() : '';
        const online = status ? status === 'on' : (then ? (Date.now() - then.getTime()) < 6 * 60 * 1000 : false);
        const statusLabel = online ? 'ONLINE' : 'OFFLINE';
        const statusClass = online ? 'text-emerald-500 bg-emerald-500/20' : 'text-slate-400 bg-slate-700';
        const isHeadless = String(device?.deviceType || '').toLowerCase() === 'headless';

        let toolBadges = [];
        const cliTools = (Array.isArray(device.tools) && device.tools.length > 0 && device.tools[0]['CLI tools'])
          ? device.tools[0]['CLI tools']
          : [];

        if (cliTools.includes('Gemini CLI')) toolBadges.push({ label: 'GEMINI_CLI', color: 'border-emerald-500 text-emerald-500' });
        if (cliTools.includes('claude CLI')) toolBadges.push({ label: 'CLAUDE_CLI', color: 'border-orange-500 text-orange-500' });
        if (cliTools.includes('Codex CLI')) toolBadges.push({ label: 'CODEX_CLI', color: 'border-cyan-500 text-cyan-500' });
        if (cliTools.includes('cursor CLI')) toolBadges.push({ label: 'CURSOR_CLI', color: 'border-blue-500 text-blue-500' });

        return (
          <div key={id} className="agent-card rounded-xl shadow-sm hover:shadow-md p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] technical-font text-slate-500">COMPUTER</div>
                <div className="mt-1 text-lg font-display font-bold text-slate-800 dark:text-white uppercase tracking-tight line-clamp-1">{name}</div>
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
                  {lastHeartbeat ? `${formatTimeAgo(lastHeartbeat)}` : '—'}
                </div>
              </div>

              <div>
                <div className="text-[9px] technical-font text-slate-500 mb-2">LOCAL_CLI_TOOLS</div>
                <div className="flex flex-wrap gap-2">
                  {toolBadges.length > 0 ? (
                    toolBadges.map((badge, idx) => (
                      <span key={idx} className={`px-2 py-0.5 text-[10px] technical-font border ${badge.color}`}>
                        {badge.label}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] technical-font text-slate-500">NONE_DETECTED</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Computers;
