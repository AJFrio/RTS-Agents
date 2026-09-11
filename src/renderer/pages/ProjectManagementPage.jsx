import React, { useEffect, useMemo } from 'react';
import { useAppState, useAppActions } from '../context/AppContext.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { IconSync } from '../components/ui/icons.jsx';
import { statusMeta, StatusDot } from '../components/ui/status.jsx';
import { jiraStatusKey } from '../utils/issue-status.js';

const LINEAR_TEAM_STORAGE_KEY = 'rts_linear_team_id';

function jiraDescription(issue) {
  const description = issue.fields?.description;
  if (description == null) return '';
  return typeof description === 'object' ? JSON.stringify(description) : String(description);
}

function buildPrompt(source, key, title, description) {
  return `[${source}] ${key}: ${title}\n\n${description || ''}`.trim();
}

function ProjectIssueRow({ source, issue, onOpen, onDispatch }) {
  const isLinear = source === 'Linear';
  const key = issue.key || '';
  const title = isLinear ? (issue.title ?? 'No title') : (issue.fields?.summary ?? 'No summary');
  const statusName = isLinear ? issue.state : issue.fields?.status?.name;
  const statusKey = jiraStatusKey(statusName);
  const meta = statusMeta(statusKey);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(issue)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(issue)}
      className="cursor-pointer rounded-md border border-border-light bg-card-light p-3 transition-colors hover:border-border-strong-light dark:border-border-dark dark:bg-card-dark dark:hover:border-border-strong-dark"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="technical-font rounded-full bg-neutral-400/10 px-2 py-0.5 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400">
          {source}
        </span>
        <span className="font-mono text-[11px] font-semibold text-neutral-900 dark:text-neutral-100">
          {key}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.bg} ${meta.text}`}
        >
          <StatusDot status={statusKey} size={5} />
          {statusName ?? '—'}
        </span>
        <span className="ml-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDispatch(issue);
            }}
            className="inline-flex shrink-0 items-center rounded-sm border border-border-light bg-card-light px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:border-border-strong-light hover:bg-neutral-100 dark:border-border-dark dark:bg-card-dark dark:text-neutral-400 dark:hover:border-border-strong-dark dark:hover:bg-neutral-800/60"
          >
            Dispatch
          </button>
        </span>
      </div>
      <div className="line-clamp-2 text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
        {title}
      </div>
    </div>
  );
}

function SectionIssues({ loading, error, issues, emptyLabel, renderRow }) {
  return (
    <div className="flex-1 space-y-1.5 overflow-y-auto">
      {loading && (issues || []).length === 0 && (
        <div className="flex flex-col items-center justify-center py-10">
          <IconSync size={18} className="animate-spin text-neutral-400" />
          <span className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Loading issues...
          </span>
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-center text-xs text-red-700 dark:text-red-400">
          {error}
        </div>
      )}
      {!loading && !error && (issues || []).length === 0 && (
        <div className="py-10 text-center text-[13px] text-neutral-500 dark:text-neutral-400">
          {emptyLabel}
        </div>
      )}
      {!loading && (issues || []).map(renderRow)}
    </div>
  );
}

export default function ProjectManagementPage() {
  const { state } = useAppState();
  const { dispatch, api, setView, openLinearIssueModal, openJiraIssueModal, openNewTaskModal } =
    useAppActions();
  const { linear, jira, configuredServices, currentView } = state;

  const loadLinearTeams = async () => {
    if (!api?.linear?.getTeams || !configuredServices.linear) return;
    dispatch({ type: 'SET_LINEAR', payload: { loading: true, error: null } });
    try {
      const result = await api.linear.getTeams();
      if (result?.success) {
        const teams = result.teams || [];
        const savedId =
          typeof localStorage !== 'undefined'
            ? localStorage.getItem(LINEAR_TEAM_STORAGE_KEY)
            : null;
        const selectedTeamId =
          savedId && teams.some((t) => String(t.id) === String(savedId))
            ? savedId
            : (teams[0]?.id ?? null);
        dispatch({ type: 'SET_LINEAR', payload: { teams, selectedTeamId, loading: false } });
        if (selectedTeamId) loadLinearIssues(selectedTeamId);
      } else throw new Error(result?.error);
    } catch (err) {
      dispatch({ type: 'SET_LINEAR', payload: { error: err.message, loading: false } });
    }
  };

  const loadLinearIssues = async (teamId) => {
    if (!api?.linear?.getIssues || !teamId) return;
    dispatch({ type: 'SET_LINEAR', payload: { loading: true } });
    try {
      const result = await api.linear.getIssues(teamId);
      if (result?.success) {
        dispatch({ type: 'SET_LINEAR', payload: { issues: result.issues || [], loading: false } });
      } else throw new Error(result?.error);
    } catch (err) {
      dispatch({ type: 'SET_LINEAR', payload: { issues: [], loading: false, error: err.message } });
    }
  };

  const loadJiraBoards = async () => {
    if (!api?.jira?.getBoards || !configuredServices.jira) return;
    dispatch({ type: 'SET_JIRA', payload: { loading: true, error: null } });
    try {
      const result = await api.jira.getBoards();
      if (result?.success) {
        const boards = result.boards || [];
        const savedId =
          typeof localStorage !== 'undefined' ? localStorage.getItem('rts_jira_board_id') : null;
        const selectedBoardId =
          savedId && boards.some((b) => String(b.id) === String(savedId))
            ? savedId
            : (boards[0]?.id ?? null);
        dispatch({ type: 'SET_JIRA', payload: { boards, selectedBoardId, loading: false } });
        if (selectedBoardId) loadJiraIssues(selectedBoardId);
      } else throw new Error(result?.error);
    } catch (err) {
      dispatch({ type: 'SET_JIRA', payload: { error: err.message, loading: false } });
    }
  };

  const loadJiraIssues = async (boardId) => {
    if (!api?.jira?.getBacklogIssues || !boardId) return;
    dispatch({ type: 'SET_JIRA', payload: { loading: true } });
    try {
      const result = await api.jira.getBacklogIssues(boardId);
      if (result?.success) {
        dispatch({ type: 'SET_JIRA', payload: { issues: result.issues || [], loading: false } });
      } else throw new Error(result?.error);
    } catch (err) {
      dispatch({ type: 'SET_JIRA', payload: { issues: [], loading: false, error: err.message } });
    }
  };

  useEffect(() => {
    if (currentView !== 'project-management') return;
    if (configuredServices.linear && (linear.teams || []).length === 0) loadLinearTeams();
    if (configuredServices.jira && (jira.boards || []).length === 0) loadJiraBoards();
  }, [currentView, configuredServices.linear, configuredServices.jira]);

  const onLinearTeamChange = (e) => {
    const id = e.target.value;
    if (!id) return;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LINEAR_TEAM_STORAGE_KEY, id);
    }
    dispatch({ type: 'SET_LINEAR', payload: { selectedTeamId: id } });
    loadLinearIssues(id);
  };

  const onJiraBoardChange = (e) => {
    const id = e.target.value;
    if (!id) return;
    if (typeof localStorage !== 'undefined') localStorage.setItem('rts_jira_board_id', id);
    dispatch({ type: 'SET_JIRA', payload: { selectedBoardId: id } });
    loadJiraIssues(id);
  };

  const dispatchIssue = (source, issue) => {
    const isLinear = source === 'Linear';
    const key = issue.key;
    const title = isLinear ? (issue.title ?? '') : (issue.fields?.summary ?? '');
    const description = isLinear ? (issue.description ?? '') : jiraDescription(issue);
    openNewTaskModal({
      initialPrompt: buildPrompt(source, key, title, description),
      presetEnvironment: 'cloud',
      presetTargetDeviceId: null,
      presetPreferredProvider: null,
    });
  };

  const refreshButtonClass =
    'inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-border-light bg-card-light px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:border-border-strong-light hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-border-dark dark:bg-card-dark dark:text-neutral-400 dark:hover:border-border-strong-dark dark:hover:bg-neutral-800/60';

  const linearRows = useMemo(() => linear.issues || [], [linear.issues]);
  const jiraRows = useMemo(() => jira.issues || [], [jira.issues]);

  if (!configuredServices.linear && !configuredServices.jira) {
    return (
      <div id="view-project-management" className="view-content">
        <EmptyState
          icon="assignment"
          title="Project Management Not Configured"
          subtitle="Configure Linear API Key or Jira Base URL and API Token in Settings to view issues."
          actionLabel="Open Settings"
          onAction={() => setView('settings')}
        />
      </div>
    );
  }

  return (
    <div id="view-project-management" className="view-content space-y-6">
      {configuredServices.linear && (
        <section id="linear-section" className="flex min-h-0 flex-1 flex-col">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
                Linear
              </h3>
              <select
                id="linear-team-select"
                value={linear.selectedTeamId || ''}
                onChange={onLinearTeamChange}
                className="max-w-[220px] cursor-pointer"
              >
                <option value="">Select Team...</option>
                {(linear.teams || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.key ? ` (${t.key})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              id="refresh-linear-btn"
              onClick={() => linear.selectedTeamId && loadLinearIssues(linear.selectedTeamId)}
              disabled={linear.loading}
              className={refreshButtonClass}
            >
              <IconSync size={12} className={linear.loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
          <SectionIssues
            loading={linear.loading}
            error={linear.error}
            issues={linearRows}
            emptyLabel={linear.selectedTeamId ? 'No issues' : 'Select a team to load issues'}
            renderRow={(issue) => (
              <ProjectIssueRow
                key={issue.id}
                source="Linear"
                issue={issue}
                onOpen={openLinearIssueModal}
                onDispatch={(i) => dispatchIssue('Linear', i)}
              />
            )}
          />
        </section>
      )}

      {configuredServices.jira && (
        <section id="jira-section" className="flex min-h-0 flex-1 flex-col">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
                Jira
              </h3>
              <select
                id="jira-board-select"
                value={jira.selectedBoardId || ''}
                onChange={onJiraBoardChange}
                className="max-w-[220px] cursor-pointer"
              >
                <option value="">Select Board...</option>
                {(jira.boards || []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.type})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              id="refresh-jira-btn"
              onClick={() => jira.selectedBoardId && loadJiraIssues(jira.selectedBoardId)}
              disabled={jira.loading}
              className={refreshButtonClass}
            >
              <IconSync size={12} className={jira.loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
          <SectionIssues
            loading={jira.loading}
            error={jira.error}
            issues={jiraRows}
            emptyLabel={jira.selectedBoardId ? 'No issues' : 'Select a board to load issues'}
            renderRow={(issue) => (
              <ProjectIssueRow
                key={issue.id}
                source="Jira"
                issue={issue}
                onOpen={openJiraIssueModal}
                onDispatch={(i) => dispatchIssue('Jira', i)}
              />
            )}
          />
        </section>
      )}
    </div>
  );
}
