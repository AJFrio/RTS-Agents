import React, { useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import { IconSync } from '../components/ui/icons.jsx';
import { statusMeta, StatusDot } from '../components/ui/status.jsx';

function jiraStatusKey(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('done') || s.includes('closed') || s.includes('resolved')) return 'completed';
  if (s.includes('progress') || s.includes('review') || s.includes('testing')) return 'running';
  if (s.includes('todo') || s.includes('backlog') || s.includes('open') || s.includes('new')) {
    return 'queued';
  }
  return 'idle';
}

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
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
            Jira Board
          </h3>
          <select
            id="jira-board-select"
            value={jira.selectedBoardId || ''}
            onChange={onBoardChange}
            className="max-w-[220px] cursor-pointer"
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
            className="max-w-[180px] cursor-pointer"
          >
            <option value="">All Users</option>
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          id="refresh-jira-btn"
          onClick={() => jira.selectedBoardId && loadIssues(jira.selectedBoardId)}
          disabled={jira.loading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-border-light bg-card-light px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:border-border-strong-light hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-border-dark dark:bg-card-dark dark:text-neutral-400 dark:hover:border-border-strong-dark dark:hover:bg-neutral-800/60"
        >
          <IconSync size={12} className={jira.loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {jira.selectedBoardId && (
        <div id="jira-issues-list" className="flex-1 space-y-1.5 overflow-y-auto">
          {jira.loading && (jira.issues || []).length === 0 && (
            <div className="flex flex-col items-center justify-center py-10">
              <IconSync size={18} className="animate-spin text-neutral-400" />
              <span className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                Loading issues...
              </span>
            </div>
          )}
          {jira.error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-center text-xs text-red-700 dark:text-red-400">
              {jira.error}
            </div>
          )}
          {!jira.loading && !jira.error && filteredIssues.length === 0 && (
            <div className="py-10 text-center text-[13px] text-neutral-500 dark:text-neutral-400">
              No issues
            </div>
          )}
          {!jira.loading &&
            filteredIssues.map((issue) => {
              const statusKey = jiraStatusKey(issue.fields?.status?.name);
              const meta = statusMeta(statusKey);
              return (
                <div
                  key={issue.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openJiraIssueModal(issue)}
                  onKeyDown={(e) => e.key === 'Enter' && openJiraIssueModal(issue)}
                  className="cursor-pointer rounded-md border border-border-light bg-card-light p-3 transition-colors hover:border-border-strong-light dark:border-border-dark dark:bg-card-dark dark:hover:border-border-strong-dark"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-neutral-900 dark:text-neutral-100">
                      {issue.key}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.bg} ${meta.text}`}
                    >
                      <StatusDot status={statusKey} size={5} />
                      {issue.fields?.status?.name ?? '—'}
                    </span>
                  </div>
                  <div className="line-clamp-2 text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                    {issue.fields?.summary ?? 'No summary'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {issue.fields?.assignee?.displayName ?? 'Unassigned'}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
