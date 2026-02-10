/**
 * Agent Card Component
 * 
 * Displays a single agent task card
 */

import type { AgentTask } from '../store/types';

interface AgentCardProps {
  agent: AgentTask;
  onClick: () => void;
}

const providerStyles: Record<string, { border: string; text: string; dot: string }> = {
  jules: { border: 'border-primary', text: 'text-primary', dot: 'bg-primary' },
  cursor: { border: 'border-blue-500', text: 'text-blue-500', dot: 'bg-blue-500' },
  codex: { border: 'border-cyan-500', text: 'text-cyan-500', dot: 'bg-cyan-500' },
  'claude-cloud': { border: 'border-amber-500', text: 'text-amber-500', dot: 'bg-amber-500' },
};

const statusStyles: Record<string, { bg: string; text: string }> = {
  running: { bg: 'bg-yellow-500/20', text: 'text-yellow-500' },
  completed: { bg: 'bg-primary', text: 'text-black' },
  pending: { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-500 dark:text-slate-400' },
  failed: { bg: 'bg-red-500/20', text: 'text-red-500' },
  stopped: { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-500 dark:text-slate-400' },
};

const statusLabels: Record<string, string> = {
  running: 'RUNNING',
  completed: 'COMPLETE',
  pending: 'PENDING',
  failed: 'FAILED',
  stopped: 'STOPPED',
};

function formatTimeAgo(date: Date | null): string {
  if (!date) return '--';
  
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

function extractRepoName(url: string | null): string {
  if (!url) return '--';
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return match ? match[1] : url;
}

export default function AgentCard({ agent, onClick }: AgentCardProps) {
  const provider = providerStyles[agent.provider] || providerStyles.cursor;
  const status = statusStyles[agent.status] || statusStyles.pending;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white dark:bg-card-dark border ${provider.border} p-4 rounded-xl shadow-sm transition-all duration-200 active:scale-[0.98] hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:shadow-md`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${provider.dot}`} />
          <span className={`text-xs font-medium ${provider.text}`}>
            {agent.provider === 'claude-cloud' ? 'Claude' : agent.provider.charAt(0).toUpperCase() + agent.provider.slice(1)}
          </span>
        </div>
        <span className={`px-2.5 py-1 text-xs font-medium rounded-md ${status.bg} ${status.text}`}>
          {statusLabels[agent.status] || agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
        </span>
      </div>

      {/* Title */}
      <h3 className="font-bold text-sm mb-2 line-clamp-2 text-slate-900 dark:text-white">
        {agent.name}
      </h3>

      {/* Metadata */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        {/* Repository */}
        {agent.repository && (
          <div className="flex items-center gap-1 truncate max-w-[140px]">
            <span className="material-symbols-outlined text-xs">folder</span>
            <span className="truncate">{extractRepoName(agent.repository)}</span>
          </div>
        )}
        
        {/* Branch */}
        {agent.branch && (
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">fork_right</span>
            <span>{agent.branch}</span>
          </div>
        )}

        {/* Time */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="material-symbols-outlined text-xs">schedule</span>
          <span>{formatTimeAgo(agent.updatedAt || agent.createdAt)}</span>
        </div>
      </div>

      {/* PR Link */}
      {agent.prUrl && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-border-dark">
          <div className="flex items-center gap-1.5 text-xs text-emerald-500">
            <span className="material-symbols-outlined text-sm">merge</span>
            <span>PR Available</span>
          </div>
        </div>
      )}
    </button>
  );
}
