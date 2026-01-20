/**
 * Computers List Component
 * 
 * Read-only view of registered computers from Cloudflare KV
 */

import { useEffect } from 'react';
import { useApp } from '../store/AppContext';
import type { Computer } from '../store/types';

function formatTimeAgo(dateStr: string | undefined): string {
  if (!dateStr) return 'Unknown';
  
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

function getPlatformIcon(platform: string): string {
  switch (platform) {
    case 'darwin':
      return 'laptop_mac';
    case 'win32':
      return 'laptop_windows';
    case 'linux':
      return 'computer';
    default:
      return 'devices';
  }
}

function getPlatformLabel(platform: string): string {
  switch (platform) {
    case 'darwin':
      return 'macOS';
    case 'win32':
      return 'Windows';
    case 'linux':
      return 'Linux';
    default:
      return platform;
  }
}

interface ComputerCardProps {
  computer: Computer;
  onDispatchTask: () => void;
}

function ComputerCard({ computer, onDispatchTask }: ComputerCardProps) {
  const isOnline = computer.status === 'on';
  const isHeadless = String(computer.deviceType || '').toLowerCase() === 'headless';

  return (
    <div className={`bg-card-dark border ${isOnline ? 'border-emerald-500/50' : 'border-border-dark'} p-4`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-400 text-lg">
            {getPlatformIcon(computer.platform)}
          </span>
          <div>
            <h3 className="font-bold text-sm text-white">{computer.name}</h3>
            <p className="font-display text-[10px] text-slate-500">{getPlatformLabel(computer.platform)}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-600'}`} />
          <span className={`font-display text-[10px] font-bold uppercase ${isOnline ? 'text-emerald-500' : 'text-slate-500'}`}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Headless notification */}
      {isHeadless && (
        <div className="mb-3 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 font-display text-[10px] uppercase tracking-wider">
          Headless device (no UI): compute-only
        </div>
      )}

      {/* Tools */}
      {computer.tools && (
        <div className="mb-3">
          <p className="font-display text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Available Tools</p>
          <div className="flex flex-wrap gap-1.5">
            {computer.tools.gemini && (
              <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 font-display text-[9px] uppercase">
                Gemini CLI
              </span>
            )}
            {computer.tools['claude-cli'] && (
              <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/30 text-orange-500 font-display text-[9px] uppercase">
                Claude CLI
              </span>
            )}
            {computer.tools.codex && (
              <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-500 font-display text-[9px] uppercase">
                Codex
              </span>
            )}
            {computer.tools.cursor && (
              <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-500 font-display text-[9px] uppercase">
                Cursor
              </span>
            )}
            {computer.tools.jules && (
              <span className="px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 font-display text-[9px] uppercase">
                Jules
              </span>
            )}
            {computer.tools['claude-cloud'] && (
              <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-500 font-display text-[9px] uppercase">
                Claude Cloud
              </span>
            )}
            {!computer.tools.gemini && !computer.tools['claude-cli'] && !computer.tools.codex && !computer.tools.cursor && !computer.tools.jules && !computer.tools['claude-cloud'] && (
              <span className="text-[10px] text-slate-600">No tools detected</span>
            )}
          </div>
        </div>
      )}

      {/* Repositories */}
      {computer.repos && computer.repos.length > 0 && (
        <div className="mb-3">
          <p className="font-display text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">
            Repositories ({computer.repos.length})
          </p>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {computer.repos.slice(0, 5).map((repo, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span className="material-symbols-outlined text-xs">folder</span>
                <span className="truncate">{repo.name}</span>
              </div>
            ))}
            {computer.repos.length > 5 && (
              <p className="text-[10px] text-slate-600">+{computer.repos.length - 5} more</p>
            )}
          </div>
        </div>
      )}

      {/* Last heartbeat */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-border-dark">
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined text-xs">schedule</span>
          Last seen: {formatTimeAgo(computer.lastHeartbeat)}
        </span>

        {isOnline && (computer.tools?.gemini || computer.tools?.['claude-cli']) && (
          <button
            onClick={onDispatchTask}
            className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">send</span>
            <span className="font-bold uppercase">Send Task</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default function ComputersList() {
  const { state, dispatch, loadComputers } = useApp();
  const { computers, loadingComputers, configuredServices } = state;

  useEffect(() => {
    if (configuredServices.cloudflare) {
      loadComputers();
    }
  }, [configuredServices.cloudflare, loadComputers]);

  const handleRefresh = () => {
    loadComputers();
  };

  const handleDispatchTask = (_computer: Computer) => {
    // Pre-select this device in the new task modal
    dispatch({ type: 'SET_SHOW_NEW_TASK_MODAL', payload: true });
  };

  // Not configured state
  if (!configuredServices.cloudflare) {
    return (
      <div className="flex flex-col items-center justify-center h-64 px-6 text-center">
        <span className="material-symbols-outlined text-slate-600 text-6xl">computer</span>
        <h3 className="mt-4 text-lg font-bold uppercase tracking-tight">Cloudflare Not Configured</h3>
        <p className="mt-2 text-slate-500 text-sm max-w-sm">
          Configure Cloudflare KV in Settings to view registered computers.
        </p>
        <button
          onClick={() => dispatch({ type: 'SET_VIEW', payload: 'settings' })}
          className="mt-4 bg-primary text-black px-6 py-2 font-display text-xs font-bold uppercase tracking-wider"
        >
          Open Settings
        </button>
      </div>
    );
  }

  // Loading state
  if (loadingComputers && computers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <span className="material-symbols-outlined text-primary text-4xl animate-spin">sync</span>
        <p className="mt-4 font-display text-xs text-slate-500 uppercase tracking-wider">Loading computers...</p>
      </div>
    );
  }

  // Empty state
  if (computers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 px-6 text-center">
        <span className="material-symbols-outlined text-slate-600 text-6xl">devices</span>
        <h3 className="mt-4 text-lg font-bold uppercase tracking-tight">No Computers Found</h3>
        <p className="mt-2 text-slate-500 text-sm max-w-sm">
          No computers are registered in your Cloudflare KV store. Run the Electron app on a computer to register it.
        </p>
        <button
          onClick={handleRefresh}
          className="mt-4 border border-border-dark text-slate-400 px-6 py-2 font-display text-xs font-bold uppercase tracking-wider hover:border-slate-600 transition-colors"
        >
          Refresh
        </button>
      </div>
    );
  }

  // Separate online and offline computers
  const onlineComputers = computers.filter(c => c.status === 'on');
  const offlineComputers = computers.filter(c => c.status !== 'on');

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="font-display text-xs text-slate-500">
            {computers.length} Computer{computers.length !== 1 ? 's' : ''}
          </span>
          <span className="text-slate-600">|</span>
          <span className="font-display text-xs text-emerald-500">
            {onlineComputers.length} Online
          </span>
        </div>

        <button
          onClick={handleRefresh}
          disabled={loadingComputers}
          className="p-2 text-slate-500 hover:text-primary transition-colors"
        >
          <span className={`material-symbols-outlined text-xl ${loadingComputers ? 'animate-spin' : ''}`}>
            sync
          </span>
        </button>
      </div>

      {/* Online Computers */}
      {onlineComputers.length > 0 && (
        <div className="mb-6">
          <h3 className="font-display text-[10px] text-slate-500 uppercase tracking-wider mb-3">Online</h3>
          <div className="space-y-3">
            {onlineComputers.map(computer => (
              <ComputerCard
                key={computer.id}
                computer={computer}
                onDispatchTask={() => handleDispatchTask(computer)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Offline Computers */}
      {offlineComputers.length > 0 && (
        <div>
          <h3 className="font-display text-[10px] text-slate-500 uppercase tracking-wider mb-3">Offline</h3>
          <div className="space-y-3">
            {offlineComputers.map(computer => (
              <ComputerCard
                key={computer.id}
                computer={computer}
                onDispatchTask={() => {}}
              />
            ))}
          </div>
        </div>
      )}

      {/* Note about mobile */}
      <div className="mt-6 p-3 bg-slate-800/50 border border-border-dark">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-slate-500 text-sm">info</span>
          <p className="text-[10px] text-slate-500">
            This mobile app does not register itself as a computer. It can only view and dispatch tasks to other registered devices.
          </p>
        </div>
      </div>
    </div>
  );
}
