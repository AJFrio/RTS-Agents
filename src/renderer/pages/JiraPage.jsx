import React, { useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import Button from '../components/ui/Button.jsx';

export default function JiraPage() {
  const { state, dispatch, setView, api, openJiraIssueModal } = useApp();
  const { jira, configuredServices, currentView } = state;

  const loadBoards = async () => {
    if (!api?.jira?.getBoards || !configuredServices.jira) return;
    dispatch({ type: 'SET_JIRA', payload: { loading: true, error: null } });
    try {
      const result = await api.jira.getBoards();
      if (result?.success) {
        const boards = result.boards || [];
        const savedId = typeof localStorage !== 'undefined' ? localStorage.getItem('rts_jira_board_id') : null;
        const selectedBoardId = savedId && boards.some((b) => String(b.id) === String(savedId))
          ? savedId
          : boards[0]?.id ?? null;
        dispatch({ type: 'SET_JIRA', payload: { boards, selectedBoardId, loading: false } });
        if (selectedBoardId) loadIssues(selectedBoardId);
      } else throw new Error(result?.error);
    } catch (err) {
      dispatch({ type: 'SET_JIRA', payload: { error: err.message, loading: false } });
    }
  };

  const loadIssues = async (boardId) => {
    if (!api?.jira?.getBacklogIssues || !boardId) return;
    dispatch({ type: 'SET_JIRA', payload: { loading: true } });
    try {
      const result = await api.jira.getBacklogIssues(boardId);
      if (result?.success) {
        const issues = (result.issues || []).map((i) => ({
          ...i,
          _group: { id: 'board', name: 'ISSUES', type: 'board', order: 1 },
        }));
        dispatch({ type: 'SET_JIRA', payload: { issues, loading: false } });
      } else throw new Error(result?.error);
    } catch (err) {
      dispatch({ type: 'SET_JIRA', payload: { issues: [], loading: false, error: err.message } });
    }
  };

  useEffect(() => {
    if (currentView === 'jira' && configuredServices.jira) loadBoards();
  }, [currentView, configuredServices.jira]);

  const onBoardChange = (e) => {
    const id = e.target.value;
    if (!id) return;
    if (typeof localStorage !== 'undefined') localStorage.setItem('rts_jira_board_id', id);
    dispatch({ type: 'SET_JIRA', payload: { selectedBoardId: id, selectedAssignee: null } });
    loadIssues(id);
  };

  const assignees = useMemo(() => {
    const set = new Set();
    (jira.issues || []).forEach((issue) => {
      set.add(issue.fields?.assignee?.displayName || 'Unassigned');
    });
    return Array.from(set).sort();
  }, [jira.issues]);

  const filteredIssues = useMemo(() => {
    if (!jira.selectedAssignee) return jira.issues || [];
    return (jira.issues || []).filter(
      (i) => (i.fields?.assignee?.displayName || 'Unassigned') === jira.selectedAssignee
    );
  }, [jira.issues, jira.selectedAssignee]);

  if (!configuredServices.jira) {
    return (
      <div id="view-jira" className="view-content">
        <EmptyState
          icon="assignment"
          title="Jira Not Configured"
          subtitle="Configure Jira Base URL and API Token in Settings to view boards and issues."
          actionLabel="Open Settings"
          onAction={() => setView('settings')}
        />
      </div>
    );
  }

  if (jira.loading && (jira.boards || []).length === 0) {
    return (
      <div id="view-jira" className="view-content">
        <LoadingSpinner label="Fetching Jira..." />
      </div>
    );
  }

  return (
    <div id="view-jira" className="view-content">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">Jira Board</h3>
          <select
            id="jira-board-select"
            value={jira.selectedBoardId || ''}
            onChange={onBoardChange}
            className="bg-black dark:bg-card-dark border border-border-dark text-slate-300 technical-font text-xs py-1 px-3 focus:ring-1 focus:ring-primary focus:border-primary rounded-lg cursor-pointer"
          >
            <option value="">Select Board...</option>
            {(jira.boards || []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.type})
              </option>
            ))}
          </select>
          <select
            id="jira-assignee-filter"
            value={jira.selectedAssignee || ''}
            onChange={(e) => dispatch({ type: 'SET_JIRA', payload: { selectedAssignee: e.target.value || null } })}
            className="bg-black dark:bg-card-dark border border-border-dark text-slate-300 technical-font text-xs py-1 px-3 focus:ring-1 focus:ring-primary focus:border-primary rounded-lg cursor-pointer"
          >
            <option value="">All Users</option>
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="secondary"
          id="refresh-jira-btn"
          onClick={() => jira.selectedBoardId && loadIssues(jira.selectedBoardId)}
          disabled={jira.loading}
        >
          <span className={`material-symbols-outlined text-sm ${jira.loading ? 'animate-spin' : ''}`}>refresh</span>
          REFRESH
        </Button>
      </div>

      {jira.selectedBoardId && (
        <div id="jira-issues-list" className="flex-1 overflow-y-auto space-y-2">
          {jira.loading && (jira.issues || []).length === 0 && (
            <div className="flex flex-col items-center justify-center h-32">
              <span className="material-symbols-outlined text-primary text-3xl animate-spin">sync</span>
              <span className="text-xs technical-font text-slate-500 mt-2">LOADING ISSUES...</span>
            </div>
          )}
          {jira.error && (
            <div className="p-4 border border-red-900/50 bg-red-900/10 text-red-400 text-xs technical-font text-center rounded-lg">
              {jira.error}
            </div>
          )}
          {!jira.loading && !jira.error && filteredIssues.length === 0 && (
            <div className="text-center py-12 text-slate-500 text-sm">No issues</div>
          )}
          {!jira.loading &&
            filteredIssues.map((issue) => (
              <div
                key={issue.id}
                role="button"
                tabIndex={0}
                onClick={() => openJiraIssueModal(issue)}
                onKeyDown={(e) => e.key === 'Enter' && openJiraIssueModal(issue)}
                className="p-4 border border-slate-200 dark:border-border-dark rounded-xl hover:border-primary/50 cursor-pointer transition-all bg-white dark:bg-[#1A1A1A]"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-primary font-bold text-xs">{issue.key}</span>
                  <span className="px-2 py-0.5 text-[10px] technical-font bg-slate-700 text-slate-200 rounded">
                    {issue.fields?.status?.name ?? '—'}
                  </span>
                </div>
                <div className="font-semibold text-slate-800 dark:text-white line-clamp-2">
                  {issue.fields?.summary ?? 'No summary'}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {issue.fields?.assignee?.displayName ?? 'Unassigned'}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
