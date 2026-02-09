import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';

const Jira: React.FC = () => {
  const { jira, setJiraState, loadJiraBoards, loadJiraIssues, configuredServices, setView, openModal } = useApp();

  useEffect(() => {
    if (configuredServices.jira) {
      loadJiraBoards();
    }
  }, [configuredServices.jira]);

  const handleBoardChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const boardId = e.target.value;
    setJiraState({ selectedBoardId: boardId, issues: [] });
    if (boardId) {
      loadJiraIssues(boardId);
    }
  };

  if (!configuredServices.jira) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <span className="material-symbols-outlined text-slate-600 text-6xl">assignment</span>
        <h3 className="mt-4 text-lg font-bold dark:text-white uppercase tracking-tight">Jira Not Configured</h3>
        <p className="mt-2 text-slate-500 text-center max-w-md text-sm">
          Configure Jira Base URL and API Token in Settings to view boards and issues.
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
         <div className="flex items-center gap-4">
            <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">Jira Board</h3>
            <select
              value={jira.selectedBoardId || ''}
              onChange={handleBoardChange}
              className="bg-black border border-border-dark text-slate-300 technical-font text-xs py-1 px-3 focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer hover:border-slate-600 rounded-lg"
            >
               <option value="">Select Board...</option>
               {jira.boards.map(board => (
                 <option key={board.id} value={board.id}>
                   {board.name} ({board.type})
                 </option>
               ))}
            </select>
         </div>
         <div className="flex items-center gap-3">
            <button
              onClick={() => jira.selectedBoardId ? loadJiraIssues(jira.selectedBoardId) : loadJiraBoards()}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-border-dark hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-[0.98] transition-all duration-200 text-slate-600 dark:text-slate-400"
            >
               <span className={`material-symbols-outlined text-sm ${jira.loading ? 'animate-spin' : ''}`}>refresh</span>
               REFRESH
            </button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
         {jira.loading ? (
           <div className="flex flex-col items-center justify-center h-64">
              <span className="material-symbols-outlined text-primary text-4xl animate-spin">sync</span>
              <p className="mt-4 technical-font text-slate-400">Loading Jira...</p>
           </div>
         ) : jira.issues.length === 0 && jira.selectedBoardId ? (
           <div className="flex flex-col items-center justify-center h-64 text-slate-500">
              <span className="material-symbols-outlined text-4xl mb-2 opacity-50">assignment_turned_in</span>
              <span className="text-sm font-medium">No issues found</span>
           </div>
         ) : (
           <div className="space-y-4">
             {jira.issues.map(issue => (
               <div
                 key={issue.key}
                 onClick={() => openModal('jiraIssue', { issueKey: issue.key })}
                 className="jira-card bg-white dark:bg-sidebar-dark border border-slate-200 dark:border-border-dark rounded-xl shadow-sm hover:shadow-md hover:border-primary transition-all duration-200 cursor-pointer group flex flex-col gap-2 p-4"
               >
                  <div className="flex justify-between items-start">
                     <div className="flex items-center gap-2">
                        <span className="text-primary technical-font text-xs font-bold">{issue.key}</span>
                        <h3 className="font-medium text-slate-200 text-sm group-hover:text-primary transition-colors line-clamp-1">{issue.fields?.summary}</h3>
                     </div>
                     <span className="px-2 py-0.5 text-[9px] technical-font border border-slate-600 text-slate-400">
                       {issue.fields?.status?.name?.toUpperCase()}
                     </span>
                  </div>

                  <div className="flex items-center gap-4 text-[10px] technical-font text-slate-500">
                     <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">person</span>
                        {issue.fields?.assignee?.displayName || 'Unassigned'}
                     </span>
                     {issue.fields?.priority?.name && (
                       <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">priority_high</span>
                          {issue.fields.priority.name}
                       </span>
                     )}
                  </div>
               </div>
             ))}
           </div>
         )}
      </div>
    </div>
  );
};

export default Jira;
