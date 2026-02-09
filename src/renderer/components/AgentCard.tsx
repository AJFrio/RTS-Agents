import React from 'react';
import { Agent } from '../context/AppContext';

interface AgentCardProps {
  agent: Agent;
  onClick: (agent: Agent) => void;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onClick }) => {
  const timeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'NOW';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}M_AGO`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}H_AGO`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}D_AGO`;
    return date.toLocaleDateString();
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'running': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500';
      case 'completed': return 'bg-primary text-black border-primary';
      case 'pending': return 'bg-slate-700 text-slate-400 border-slate-600';
      case 'failed': return 'bg-red-500/20 text-red-500 border-red-500';
      case 'stopped': return 'bg-slate-700 text-slate-400 border-slate-600';
      default: return 'bg-slate-700 text-slate-400 border-slate-600';
    }
  };

  const getProviderStyle = (provider: string) => {
    switch (provider) {
      case 'gemini': return { text: 'text-emerald-500', dot: 'bg-emerald-500' };
      case 'jules': return { text: 'text-primary', dot: 'bg-primary' };
      case 'cursor': return { text: 'text-blue-500', dot: 'bg-blue-500' };
      case 'codex': return { text: 'text-cyan-500', dot: 'bg-cyan-500' };
      case 'claude-cli': return { text: 'text-orange-500', dot: 'bg-orange-500' };
      case 'claude-cloud': return { text: 'text-amber-500', dot: 'bg-amber-500' };
      default: return { text: 'text-slate-500', dot: 'bg-slate-500' };
    }
  };

  const providerStyle = getProviderStyle(agent.provider);
  const statusStyle = getStatusStyle(agent.status);

  return (
    <div
      onClick={() => onClick(agent)}
      className="w-full text-left agent-card rounded-xl shadow-sm hover:shadow-md active:scale-[0.98] p-4 transition-all duration-200 cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${providerStyle.dot}`}></span>
          <span className={`text-xs font-medium ${providerStyle.text}`}>
            {agent.provider === 'claude-cloud' ? 'Claude' : agent.provider.toUpperCase()}
          </span>
        </div>
        <span className={`px-2.5 py-1 text-xs font-medium rounded-md border ${statusStyle}`}>
          {agent.status.toUpperCase()}
        </span>
      </div>

      <h3 className="font-bold text-sm mb-2 line-clamp-2 text-slate-800 dark:text-white">
        {agent.name}
      </h3>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        {agent.repository && (
          <div className="flex items-center gap-1 truncate max-w-[140px]">
            <span className="material-symbols-outlined text-xs">folder</span>
            <span className="truncate">{agent.repository.split('/').slice(-2).join('/')}</span>
          </div>
        )}
        {agent.branch && (
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">fork_right</span>
            <span>{agent.branch}</span>
          </div>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <span className="material-symbols-outlined text-xs">schedule</span>
          <span>{timeAgo(agent.updatedAt || agent.createdAt)}</span>
        </div>
      </div>

      {agent.prUrl && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-border-dark">
          <div className="flex items-center gap-1.5 text-xs text-emerald-500">
            <span className="material-symbols-outlined text-sm">merge</span>
            <span>PR Available</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentCard;
