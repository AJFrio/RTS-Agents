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
  const [sprints, setSprints] = useState<JiraSprint[]>([]);
  const [backlogIssues, setBacklogIssues] = useState<JiraIssue[]>([]);
  const [sprintIssues, setSprintIssues] = useState<Record<number, JiraIssue[]>>({});
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null);
  const [showIssueModal, setShowIssueModal] = useState(false);

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
        setSprints([]);
        setBacklogIssues([]);
        setSprintIssues({});
        return;
      }

      const sprintList = await jiraService.listSprints(boardId);
      setSprints(sprintList);

      const backlog = await jiraService.getBacklogIssues(boardId);
      setBacklogIssues(backlog);

      // Fetch issues per sprint in parallel
      const activeAndFuture = sprintList.filter(s => s.state === 'active' || s.state === 'future');
      const perSprint = await Promise.all(
        activeAndFuture.map(async (s) => ({ sprintId: s.id, issues: await jiraService.getSprintIssues(s.id) }))
      );
      const map: Record<number, JiraIssue[]> = {};
      for (const entry of perSprint) map[entry.sprintId] = entry.issues;
      setSprintIssues(map);
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

  const sortedSprints = useMemo(() => {
    const rank = (s: JiraSprint) => (s.state === 'active' ? 0 : s.state === 'future' ? 1 : 2);
    return [...sprints].sort((a, b) => rank(a) - rank(b));
  }, [sprints]);

  const handleOpenSettings = () => {
    dispatch({ type: 'SET_VIEW', payload: 'settings' });
  };

  const openIssue = (issue: JiraIssue) => {
    setSelectedIssueKey(issue.key);
    setShowIssueModal(true);
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
              <h3 className="font-display text-sm font-bold uppercase tracking-tight">Backlog</h3>
            </div>
            <button
              onClick={loadJira}
              disabled={loading}
              className="border border-border-dark text-slate-400 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:text-white hover:border-slate-600 transition-colors"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
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
          {/* Sprints */}
          {sortedSprints
            .filter(s => s.state === 'active' || s.state === 'future')
            .map((sprint) => {
              const issues = sprintIssues[sprint.id] || [];
              return (
                <section key={sprint.id} className="bg-card-dark border border-border-dark">
                  <div className="px-4 py-3 border-b border-border-dark flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-slate-400 text-sm">sprint</span>
                      <span className="font-display text-xs font-bold uppercase tracking-tight text-white">
                        {sprint.name}
                      </span>
                      <span className="font-display text-[10px] text-slate-500 uppercase">
                        {sprint.state}
                      </span>
                    </div>
                    <span className="font-display text-[10px] text-slate-500">
                      {issues.length} items
                    </span>
                  </div>

                  <div className="divide-y divide-border-dark">
                    {issues.length === 0 ? (
                      <div className="p-4 text-xs text-slate-500">No tickets</div>
                    ) : (
                      issues.map((issue) => (
                        <button
                          key={issue.id}
                          onClick={() => openIssue(issue)}
                          className="w-full text-left p-4 hover:bg-black/20 active:scale-[0.99] transition"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-display text-[10px] text-slate-500 uppercase tracking-wider">
                                {issue.key}
                              </div>
                              <div className="text-sm font-semibold text-white line-clamp-2">
                                {issue.fields?.summary || '(no summary)'}
                              </div>
                              <div className="mt-1 text-[10px] font-display text-slate-500">
                                Assignee: {getAssignee(issue)}
                              </div>
                            </div>
                            <span className="material-symbols-outlined text-slate-500 text-sm mt-1">
                              chevron_right
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </section>
              );
            })}

          {/* Backlog */}
          <section className="bg-card-dark border border-border-dark">
            <div className="px-4 py-3 border-b border-border-dark flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-slate-400 text-sm">list</span>
                <span className="font-display text-xs font-bold uppercase tracking-tight text-white">
                  Backlog
                </span>
              </div>
              <span className="font-display text-[10px] text-slate-500">
                {backlogIssues.length} items
              </span>
            </div>
            <div className="divide-y divide-border-dark">
              {backlogIssues.length === 0 ? (
                <div className="p-4 text-xs text-slate-500">No tickets</div>
              ) : (
                backlogIssues.map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() => openIssue(issue)}
                    className="w-full text-left p-4 hover:bg-black/20 active:scale-[0.99] transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-display text-[10px] text-slate-500 uppercase tracking-wider">
                          {issue.key}
                        </div>
                        <div className="text-sm font-semibold text-white line-clamp-2">
                          {issue.fields?.summary || '(no summary)'}
                        </div>
                        <div className="mt-1 text-[10px] font-display text-slate-500">
                          Assignee: {getAssignee(issue)}
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-slate-500 text-sm mt-1">
                        chevron_right
                      </span>
                    </div>
                  </button>
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
    </div>
  );
}

