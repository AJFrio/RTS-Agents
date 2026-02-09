import React from 'react';
import { useApp } from '../context/AppContext';
import AgentCard from '../components/AgentCard';

const Dashboard: React.FC = () => {
  const { filteredAgents, loading, pagination, setPage, openModal } = useApp();

  // Pagination Logic
  const pageSize = pagination.pageSize;
  const currentPage = pagination.currentPage;
  const totalPages = pagination.totalPages;

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredAgents.length);
  const pageItems = filteredAgents.slice(startIndex, endIndex);

  if (loading && filteredAgents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <span className="material-symbols-outlined text-primary text-4xl animate-spin">sync</span>
        <p className="mt-4 technical-font text-slate-400">Loading...</p>
      </div>
    );
  }

  if (filteredAgents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <span className="material-symbols-outlined text-slate-600 text-6xl">filter_alt_off</span>
        <h3 className="mt-4 text-lg font-bold dark:text-white uppercase tracking-tight">No Tasks Found</h3>
        <p className="mt-2 text-slate-500 text-center max-w-md text-sm">
          Try adjusting your filters or search query.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pageItems.map(agent => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onClick={(agent) => {
              openModal('agentDetail', {
                agentId: agent.rawId || agent.id,
                provider: agent.provider,
                filePath: agent.filePath
              });
            }}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200 dark:border-border-dark">
          <span className="technical-font text-xs text-slate-500">
            SHOWING {startIndex + 1}-{endIndex} OF {filteredAgents.length} TASKS
          </span>
          <div className="flex items-center gap-4">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-border-dark hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-[0.98] transition-all duration-200 text-slate-600 dark:text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-sm">chevron_left</span>
              PREV
            </button>
            <span className="technical-font text-xs text-primary font-bold">
              PAGE {String(currentPage).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-border-dark hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-[0.98] transition-all duration-200 text-slate-600 dark:text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              NEXT
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
