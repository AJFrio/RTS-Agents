import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { AgentCard } from '../components/ui/Card.jsx';
import { StatusBadge } from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import ErrorBanner from '../components/ui/ErrorBanner.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import {
  getProviderDisplayName,
  getProviderDot,
  getStatusStyle,
  getStatusLabel,
  formatTimeAgo,
  extractRepoName,
} from '../utils/format.js';

function AgentCardItem({ agent, onClick }) {
  const style = getStatusStyle(agent.status);
  const timeAgo = formatTimeAgo(agent.updatedAt || agent.createdAt);
  const statusLabel = getStatusLabel(agent.status);
  const providerName = getProviderDisplayName(agent.provider);
  const dot = getProviderDot(agent.provider);

  return (
    <AgentCard onClick={onClick}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          <span className={`text-xs font-medium ${style.text}`}>{providerName}</span>
        </div>
        <StatusBadge status={agent.status}>{statusLabel}</StatusBadge>
      </div>
      <h3 className="font-bold text-sm mb-2 line-clamp-2 text-slate-800 dark:text-white">{agent.name || 'Untitled'}</h3>
      <div className="flex items-center gap-4 text-xs text-slate-500">
        {agent.repository && (
          <div className="flex items-center gap-1 truncate max-w-[140px]">
            <span className="material-symbols-outlined text-xs">folder</span>
            <span className="truncate">{extractRepoName(agent.repository)}</span>
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
          <span>{timeAgo}</span>
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
    </AgentCard>
  );
}

export default function DashboardPage() {
  const { state, dispatch, setView, openAgentModal } = useApp();
  const { filteredAgents, loading, errors, pagination } = state;
  const { currentPage, pageSize } = pagination;

  const totalItems = filteredAgents.length;
  const totalPagesComputed = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pageItems = useMemo(
    () => filteredAgents.slice(startIndex, endIndex),
    [filteredAgents, startIndex, endIndex]
  );

  const goPrev = () => dispatch({ type: 'SET_PAGINATION', payload: { currentPage: Math.max(1, currentPage - 1) } });
  const goNext = () =>
    dispatch({ type: 'SET_PAGINATION', payload: { currentPage: Math.min(totalPagesComputed, currentPage + 1) } });

  if (loading && state.agents.length === 0) {
    return (
      <div id="view-dashboard" className="view-content">
        <LoadingSpinner />
      </div>
    );
  }

  if (state.agents.length === 0) {
    return (
      <div id="view-dashboard" className="view-content">
        <EmptyState
          icon="computer"
          title="No Agents Detected"
          subtitle="Configure API command keys in Settings to establish connection with Jules and Cursor Cloud, or verify Gemini CLI installation for local operations."
          actionLabel="Open Settings"
          onAction={() => setView('settings')}
        />
      </div>
    );
  }

  return (
    <div id="view-dashboard" className="view-content">
      <ErrorBanner errors={errors} />

      {pageItems.length === 0 ? (
        <div className="col-span-full text-center py-12">
          <span className="material-symbols-outlined text-slate-600 text-4xl mb-4">filter_alt_off</span>
          <p className="technical-font text-slate-500">No tasks match current filters</p>
        </div>
      ) : (
        <>
          <div id="agents-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pageItems.map((agent) => (
              <AgentCardItem
                key={`${agent.provider}-${agent.rawId || agent.id || Math.random()}`}
                agent={agent}
                onClick={() => openAgentModal(agent)}
              />
            ))}
          </div>
          <Pagination
            start={totalItems === 0 ? 0 : startIndex + 1}
            end={endIndex}
            total={totalItems}
            currentPage={currentPage}
            totalPages={totalPagesComputed}
            onPrev={goPrev}
            onNext={goNext}
          />
        </>
      )}
    </div>
  );
}
