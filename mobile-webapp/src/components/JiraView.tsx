/**
 * Jira View
 *
 * Shows tickets in a backlog style broken up into sprints.
 */

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { jiraService } from '../services/jira-service';
import type { JiraBoard, JiraIssue, JiraSprint } from '../services/jira-service';
import JiraIssueModal from './JiraIssueModal';
import JiraFilterModal from './JiraFilterModal';

interface TicketWithSprint extends JiraIssue {
  sprintId: number | null;
  sprintName: string;
  sprintState?: string;
}

function getAssignee(issue: JiraIssue): string {
  return issue.fields?.assignee?.displayName || 'Unassigned';
}

export default function JiraView() {
  const { state, dispatch } = useApp();
  const { configuredServices, settings } = state;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boards, setBoards] = useState<JiraBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [allTickets, setAllTickets] = useState<TicketWithSprint[]>([]);
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [showAllTickets, setShowAllTickets] = useState(false);

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
      setSelectedBoardId(boardId);

      if (!boardId) {
        setAllTickets([]);
        return;
      }

      // Fetch sprints - filter out closed sprints by default unless showAllTickets is true
      const allSprints = await jiraService.listSprints(boardId);
      const sprintsToFetch = showAllTickets 
        ? allSprints 
        : allSprints.filter(s => s.state !== 'closed');

      // Fetch issues from selected sprints in parallel
      const allSprintIssues = await Promise.all(
        sprintsToFetch.map(async (sprint) => ({
          sprintId: sprint.id,
          sprintName: sprint.name,
          sprintState: sprint.state,
          issues: await jiraService.getSprintIssues(sprint.id)
        }))
      );

      // Fetch backlog
      const backlog = await jiraService.getBacklogIssues(boardId);

      // Combine and tag with sprint info
      const tickets: TicketWithSprint[] = [
        ...allSprintIssues.flatMap(s => 
          s.issues.map(i => ({ 
            ...i, 
            sprintId: s.sprintId, 
            sprintName: s.sprintName,
            sprintState: s.sprintState
          }))
        ),
        ...backlog.map(i => ({ 
          ...i, 
          sprintId: null, 
          sprintName: 'Backlog',
          sprintState: undefined
        }))
      ];

      setAllTickets(tickets);
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
      loadJira();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBoardId, showAllTickets]);

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

  // Group filtered tickets by sprint
  const groupedTickets = useMemo(() => {
    const groups: Array<{
      sprintId: number | null;
      sprintName: string;
      sprintState?: string;
      tickets: TicketWithSprint[];
    }> = [];

    const sprintMap = new Map<number | null, TicketWithSprint[]>();
    
    filteredTickets.forEach(ticket => {
      if (!sprintMap.has(ticket.sprintId)) {
        sprintMap.set(ticket.sprintId, []);
      }
      sprintMap.get(ticket.sprintId)!.push(ticket);
    });

    // Sort sprints: active → future → closed → backlog
    const sprintRank = (sprintId: number | null, sprintState?: string) => {
      if (sprintId === null) return 999; // Backlog last
      if (sprintState === 'active') return 0;
      if (sprintState === 'future') return 1;
      if (sprintState === 'closed') return 2;
      return 3;
    };

    sprintMap.forEach((tickets, sprintId) => {
      const firstTicket = tickets[0];
      groups.push({
        sprintId,
        sprintName: firstTicket.sprintName,
        sprintState: firstTicket.sprintState,
        tickets
      });
    });

    return groups.sort((a, b) => 
      sprintRank(a.sprintId, a.sprintState) - sprintRank(b.sprintId, b.sprintState)
    );
  }, [filteredTickets]);

  const handleOpenSettings = () => {
    dispatch({ type: 'SET_VIEW', payload: 'settings' });
  };

  const openIssue = (issue: JiraIssue | TicketWithSprint) => {
    console.log('openIssue called with:', issue.key);
    setSelectedIssueKey(issue.key);
    setShowIssueModal(true);
    console.log('Modal state set - showIssueModal should be true');
  };

  const handleFilterChange = (assignee: string | null, status: string | null, showAll: boolean) => {
    setFilterAssignee(assignee);
    setFilterStatus(status);
    setShowAllTickets(showAll);
  };

  const clearFilters = () => {
    setFilterAssignee(null);
    setFilterStatus(null);
    setShowAllTickets(false);
  };

  return (
    <div className="p-4 space-y-4">
      {!isReady && (
        <div className="bg-card-dark border border-border-dark p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-primary text-lg">assignment</span>
            <h3 className="font-display text-sm font-bold uppercase tracking-tight">Jira</h3>
          </div>
          <p className="text-xs text-slate-500">
            Add your Jira Base URL and API token in Settings to load tickets.
          </p>
          <button
            onClick={handleOpenSettings}
            className="mt-3 bg-primary text-black px-4 py-2 font-display text-[10px] font-bold uppercase tracking-wider"
          >
            Open Settings
          </button>
        </div>
      )}

      {isReady && (
        <div className="bg-card-dark border border-border-dark p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">assignment</span>
              <h3 className="font-display text-sm font-bold uppercase tracking-tight">Tickets</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilterModal(true)}
                className="border border-border-dark text-slate-400 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider hover:text-white hover:border-slate-600 transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">filter_list</span>
                Filter
                {(filterAssignee || filterStatus || showAllTickets) && (
                  <span className="bg-primary text-black rounded-full w-4 h-4 flex items-center justify-center text-[8px]">
                    {(filterAssignee ? 1 : 0) + (filterStatus ? 1 : 0) + (showAllTickets ? 1 : 0)}
                  </span>
                )}
              </button>
              <button
                onClick={loadJira}
                disabled={loading}
                className="border border-border-dark text-slate-400 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:text-white hover:border-slate-600 transition-colors"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          {boards.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-display text-[10px] text-slate-500 uppercase tracking-wider">Board</span>
              <select
                value={selectedBoardId ?? boards[0]?.id ?? ''}
                onChange={(e) => setSelectedBoardId(parseInt(e.target.value, 10))}
                className="flex-1 bg-black/40 border border-border-dark text-sm py-2 px-3 text-white"
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
            <div className="bg-red-900/20 border border-red-500/50 p-3">
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}
        </div>
      )}

      {isReady && !error && (
        <div className="space-y-4">
          {/* Unified ticket list with sprint dividers */}
          {groupedTickets.length === 0 ? (
            <div className="bg-card-dark border border-border-dark p-4">
              <p className="text-xs text-slate-500 text-center">No tickets found</p>
            </div>
          ) : (
            <section className="bg-card-dark border border-border-dark">
              {groupedTickets.map((group, groupIndex) => (
                <div key={group.sprintId ?? 'backlog'}>
                  {/* Sprint divider */}
                  <div className="px-4 py-3 border-b border-border-dark flex items-center justify-between bg-black/20">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-slate-400 text-sm">
                        {group.sprintId === null ? 'list' : 'sprint'}
                      </span>
                      <span className="font-display text-xs font-bold uppercase tracking-tight text-white">
                        {group.sprintName}
                      </span>
                      {group.sprintState && (
                        <span className="font-display text-[10px] text-slate-500 uppercase">
                          {group.sprintState}
                        </span>
                      )}
                    </div>
                    <span className="font-display text-[10px] text-slate-500">
                      {group.tickets.length} {group.tickets.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  {/* Tickets in this sprint */}
                  <div className="divide-y divide-border-dark">
                    {group.tickets.length === 0 ? (
                      <div className="p-4 text-xs text-slate-500">No tickets</div>
                    ) : (
                      group.tickets.map((issue) => (
                        <div
                          key={issue.id}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('Click on issue:', issue.key);
                            openIssue(issue);
                          }}
                          onMouseDown={(e) => {
                            console.log('MouseDown on issue:', issue.key);
                          }}
                          onTouchStart={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('TouchStart on issue:', issue.key);
                            openIssue(issue);
                          }}
                          onPointerDown={(e) => {
                            console.log('PointerDown on issue:', issue.key);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              console.log('KeyDown on issue:', issue.key);
                              openIssue(issue);
                            }
                          }}
                          className="w-full text-left p-4 hover:bg-black/20 active:scale-[0.99] transition cursor-pointer"
                          style={{ pointerEvents: 'auto', WebkitTapHighlightColor: 'transparent' }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="font-display text-[10px] text-slate-500 uppercase tracking-wider">
                                {issue.key}
                              </div>
                              <div className="text-sm font-semibold text-white line-clamp-2">
                                {issue.fields?.summary || '(no summary)'}
                              </div>
                              <div className="mt-1 flex items-center gap-3 text-[10px] font-display text-slate-500">
                                <span>Assignee: {getAssignee(issue)}</span>
                                {issue.fields?.status?.name && (
                                  <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded">
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
                </div>
              ))}
            </section>
          )}
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
        showAllTickets={showAllTickets}
        onFilterChange={handleFilterChange}
        onClearFilters={clearFilters}
        onClose={() => setShowFilterModal(false)}
      />
    </div>
  );
}

