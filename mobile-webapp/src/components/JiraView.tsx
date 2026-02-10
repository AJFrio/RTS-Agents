/**
 * Jira View
 *
 * Shows tickets in a flat list.
 */

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { jiraService } from '../services/jira-service';
import type { JiraBoard, JiraIssue } from '../services/jira-service';
import JiraIssueModal from './JiraIssueModal';
import JiraFilterModal from './JiraFilterModal';

function getAssignee(issue: JiraIssue): string {
  return issue.fields?.assignee?.displayName || 'Unassigned';
}

export default function JiraView() {
  const { state, dispatch } = useApp();
  const { configuredServices, settings } = state;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boards, setBoards] = useState<JiraBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(() => {
    const saved = localStorage.getItem('jira_selected_board');
    return saved ? parseInt(saved, 10) : null;
  });
  const [allTickets, setAllTickets] = useState<JiraIssue[]>([]);
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const isReady = configuredServices.jira && !!(settings.jiraBaseUrl && settings.jiraBaseUrl.trim());

  useEffect(() => {
    // Keep jira service base URL in sync with settings
    jiraService.setBaseUrl(settings.jiraBaseUrl || null);
  }, [settings.jiraBaseUrl]);

  const loadJira = async () => {
    if (!configuredServices.jira) return;
    if (!settings.jiraBaseUrl?.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const boardsList = await jiraService.listBoards();
      setBoards(boardsList);

      const firstBoard = boardsList[0];
      const boardId = selectedBoardId || firstBoard?.id || null;

      // Update state and persistence if we fell back to default
      if (selectedBoardId !== boardId) {
        setSelectedBoardId(boardId);
      }

      if (!boardId) {
        setAllTickets([]);
        return;
      }

      // Fetch all issues for the board directly
      const issues = await jiraService.getBoardIssues(boardId);
      setAllTickets(issues);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Jira');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJira();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuredServices.jira, settings.jiraBaseUrl]);

  useEffect(() => {
    if (selectedBoardId) {
      localStorage.setItem('jira_selected_board', selectedBoardId.toString());
      loadJira();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBoardId]);

  useEffect(() => {
    console.log('Modal state changed:', { showIssueModal, selectedIssueKey });
  }, [showIssueModal, selectedIssueKey]);

  // Extract unique assignees and statuses for filter dropdowns
  const availableAssignees = useMemo(() => {
    const assignees = new Set<string>();
    allTickets.forEach(ticket => {
      const assignee = getAssignee(ticket);
      assignees.add(assignee);
    });
    return Array.from(assignees).sort();
  }, [allTickets]);

  const availableStatuses = useMemo(() => {
    const statuses = new Set<string>();
    allTickets.forEach(ticket => {
      const status = ticket.fields?.status?.name;
      if (status) statuses.add(status);
    });
    return Array.from(statuses).sort();
  }, [allTickets]);

  // Filter tickets based on selected filters
  const filteredTickets = useMemo(() => {
    return allTickets.filter(ticket => {
      if (filterAssignee) {
        const assignee = getAssignee(ticket);
        if (assignee !== filterAssignee) return false;
      }
      if (filterStatus) {
        const status = ticket.fields?.status?.name;
        if (status !== filterStatus) return false;
      }
      return true;
    });
  }, [allTickets, filterAssignee, filterStatus]);

  const handleOpenSettings = () => {
    dispatch({ type: 'SET_VIEW', payload: 'settings' });
  };

  const openIssue = (issue: JiraIssue) => {
    console.log('openIssue called with:', issue.key);
    setSelectedIssueKey(issue.key);
    setShowIssueModal(true);
    console.log('Modal state set - showIssueModal should be true');
  };

  const handleFilterChange = (assignee: string | null, status: string | null) => {
    setFilterAssignee(assignee);
    setFilterStatus(status);
  };

  const clearFilters = () => {
    setFilterAssignee(null);
    setFilterStatus(null);
  };

  return (
    <div className="p-4 space-y-4">
      {!isReady && (
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-primary text-lg">assignment</span>
            <h3 className="text-base font-semibold">Jira</h3>
          </div>
          <p className="text-xs text-slate-500">
            Add your Jira Base URL and API token in Settings to load tickets.
          </p>
          <button
            onClick={handleOpenSettings}
            className="mt-3 bg-primary text-black px-4 py-2 text-sm font-semibold rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
          >
            Open Settings
          </button>
        </div>
      )}

      {isReady && (
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">assignment</span>
              <h3 className="text-base font-semibold">Tickets</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilterModal(true)}
                className="border border-slate-200 dark:border-border-dark text-slate-500 dark:text-slate-400 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600 transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">filter_list</span>
                Filter
                {(filterAssignee || filterStatus) && (
                  <span className="bg-primary text-black rounded-full w-4 h-4 flex items-center justify-center text-[8px]">
                    {(filterAssignee ? 1 : 0) + (filterStatus ? 1 : 0)}
                  </span>
                )}
              </button>
              <button
                onClick={loadJira}
                disabled={loading}
                className="border border-slate-200 dark:border-border-dark text-slate-500 dark:text-slate-400 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          {boards.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Board</span>
              <select
                value={selectedBoardId ?? boards[0]?.id ?? ''}
                onChange={(e) => setSelectedBoardId(parseInt(e.target.value, 10))}
                className="flex-1 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-border-dark text-sm py-2 px-3 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/50 p-3 rounded-lg shadow-sm">
              <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>
      )}

      {isReady && !error && (
        <div className="space-y-4">
          <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-border-dark flex items-center justify-between bg-slate-50 dark:bg-black/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-sm">
                  list
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  All Tickets
                </span>
              </div>
              <span className="text-xs text-slate-500">
                {filteredTickets.length} {filteredTickets.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-border-dark">
              {filteredTickets.length === 0 ? (
                <div className="p-4 text-xs text-slate-500">No tickets found</div>
              ) : (
                filteredTickets.map((issue) => (
                  <div
                    key={issue.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openIssue(issue)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openIssue(issue);
                      }
                    }}
                    className="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-black/20 active:scale-[0.99] transition cursor-pointer"
                    style={{ pointerEvents: 'auto', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-[10px] text-slate-500 uppercase tracking-wider">
                          {issue.key}
                        </div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">
                          {issue.fields?.summary || '(no summary)'}
                        </div>
                              <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                                <span>Assignee: {getAssignee(issue)}</span>
                                {issue.fields?.status?.name && (
                                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md text-xs">
                                    {issue.fields.status.name}
                                  </span>
                                )}
                              </div>
                      </div>
                      <span className="material-symbols-outlined text-slate-500 text-sm mt-1">
                        chevron_right
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      <JiraIssueModal
        isOpen={showIssueModal}
        issueKey={selectedIssueKey}
        onClose={() => {
          setShowIssueModal(false);
          setSelectedIssueKey(null);
        }}
      />

      <JiraFilterModal
        isOpen={showFilterModal}
        availableAssignees={availableAssignees}
        availableStatuses={availableStatuses}
        selectedAssignee={filterAssignee}
        selectedStatus={filterStatus}
        showAllTickets={false} // No longer relevant for sprint filtering
        onFilterChange={(assignee, status, _) => handleFilterChange(assignee, status)}
        onClearFilters={clearFilters}
        onClose={() => setShowFilterModal(false)}
      />
    </div>
  );
}
