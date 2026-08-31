import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { AgentCard } from '../components/ui/Card.jsx';
import { StatusBadge } from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import ErrorBanner from '../components/ui/ErrorBanner.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import ProjectGrid from '../components/project/ProjectGrid.jsx';
import ProjectDetail from '../components/project/ProjectDetail.jsx';
import { groupAgentsByProject } from '../utils/group-agents.js';
import {
  getProviderDisplayName,
  getProviderDot,
  getStatusLabel,
  formatTimeAgo,
  repoLabel,
  getProviderText,
} from '../utils/format.js';

function formatShortTool(tool) {
  if (!tool) return '';
  if (tool === 'antigravity') return 'Antigravity CLI';
  if (tool === 'claude-cli') return 'Claude CLI';
  if (tool === 'opencode') return 'OpenCode';
  return String(tool);
}

function RemoteActivityRow({ activity }) {
  if (!activity?.configured) return null;
  const devices = Array.isArray(activity.devices) ? activity.devices : [];
  const hasSignal = devices.some((d) => (d.queueLength || 0) > 0 || d.lastTask?.status);
  if (!hasSignal) return null;

  const queued = devices.reduce((sum, d) => sum + (d.queueLength || 0), 0);
  const lastDevice = devices.find((d) => d.lastTask?.status);
  const lastTask = lastDevice?.lastTask;

  return (
    <div
      className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm dark:border-border-dark dark:bg-card-dark sm:flex-row sm:items-center sm:justify-between"
      role="region"
      aria-label="Remote device queue and last run"
    >
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-base text-primary">dns</span>
        <span className="font-semibold text-slate-800 dark:text-white">Remote activity</span>
        {queued > 0 && (
          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            {queued} queued
          </span>
        )}
      </div>
      {lastTask && (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Last run on {lastDevice.name || lastDevice.deviceId}: {lastTask.status}
          {lastTask.tool ? ` · ${formatShortTool(lastTask.tool)}` : ''}
          {lastTask.error ? ` · ${lastTask.error}` : ''}
          {lastTask.updatedAt ? ` · ${formatTimeAgo(lastTask.updatedAt)}` : ''}
        </div>
      )}
      {activity.loading && <span className="text-xs text-slate-500">Updating</span>}
    </div>
  );
}

/** Switch between the flat agent grid and the project-grouped view. */
function ModeToggle({ mode, dispatch, filters, api }) {
  const options = [
    { id: 'grid', label: 'All tasks', icon: 'grid_view' },
    { id: 'projects', label: 'Projects', icon: 'folder' },
  ];

  return (
    <div className="mb-4 inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-border-dark">
      {options.map((option) => {
        const active = mode === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              dispatch({ type: 'SET_DASHBOARD_MODE', payload: option.id });
              api?.saveFilters?.({ ...filters, dashboardMode: option.id })?.catch(console.error);
            }}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? 'bg-primary/15 text-slate-900 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <span className="material-symbols-outlined text-sm">{option.icon}</span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SummaryStrip({ agents, counts, filters, dispatch, api }) {
  const statusCounts = agents.reduce((acc, agent) => {
    const key = agent.status === 'stopped' ? 'failed' : agent.status || 'pending';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const statuses = [
    { id: 'running', label: 'Running', icon: 'play_circle' },
    { id: 'pending', label: 'Pending', icon: 'schedule' },
    { id: 'completed', label: 'Complete', icon: 'check_circle' },
    { id: 'failed', label: 'Needs review', icon: 'error' },
  ];

  const updateStatusFilter = (id, enabled) => {
    const next = { statuses: { ...filters.statuses, [id]: !enabled } };
    dispatch({
      type: 'SET_FILTERS',
      payload: next,
    });
    api?.saveFilters?.({ ...filters, ...next })?.catch(console.error);
  };

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-border-dark dark:bg-card-dark">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">All tasks</div>
        <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
          {counts.total ?? agents.length}
        </div>
      </div>
      {statuses.map((item) => {
        const enabled = filters.statuses?.[item.id] ?? true;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => updateStatusFilter(item.id, enabled)}
            className={`rounded-lg border p-3 text-left transition-all ${
              enabled
                ? 'border-slate-200 bg-white dark:border-border-dark dark:bg-card-dark'
                : 'border-slate-300 bg-slate-100 opacity-70 dark:border-slate-700 dark:bg-slate-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {item.label}
              </span>
              <span className="material-symbols-outlined text-base text-slate-400">
                {item.icon}
              </span>
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
              {statusCounts[item.id] || 0}
            </div>
          </button>
        );
      })}
    </div>
  );
}

const AgentCardItem = React.memo(function AgentCardItem({ agent, onClick }) {
  const timeAgo = formatTimeAgo(agent.updatedAt || agent.createdAt);
  const statusLabel = getStatusLabel(agent.status);
  const providerName = getProviderDisplayName(agent.provider);
  const dot = getProviderDot(agent.provider);
  const providerText = getProviderText(agent.provider);
  // Repo for remote agents, project directory name for local ones.
  const location = repoLabel(agent.repository);

  return (
    <AgentCard className="min-h-[156px]" onClick={onClick}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          <span className={`truncate text-xs font-medium ${providerText}`}>{providerName}</span>
        </div>
        <StatusBadge status={agent.status}>{statusLabel}</StatusBadge>
      </div>
      <h3 className="mb-3 line-clamp-2 text-sm font-bold text-slate-800 dark:text-white">
        {agent.name || 'Untitled'}
      </h3>
      <div className="grid gap-2 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-center justify-between gap-3">
          {agent.branch && (
            <div className="flex min-w-0 items-center gap-1">
              <span className="material-symbols-outlined text-xs">fork_right</span>
              <span className="truncate">{agent.branch}</span>
            </div>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <span className="material-symbols-outlined text-xs">schedule</span>
            <span>{timeAgo}</span>
          </div>
        </div>
      </div>
      {(location || agent.prUrl) && (
        <div className="mt-auto pt-3">
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2 dark:border-border-dark">
            {location ? (
              <div
                className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"
                title={agent.repository}
              >
                <span className="material-symbols-outlined text-sm text-slate-400">folder</span>
                <span className="truncate">{location}</span>
              </div>
            ) : (
              <span />
            )}
            {agent.prUrl && (
              <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span className="material-symbols-outlined text-sm">merge</span>
                <span>PR available</span>
              </div>
            )}
          </div>
        </div>
      )}
    </AgentCard>
  );
});

export default function DashboardPage() {
  const { state, dispatch, api, setView, openAgentModal } = useApp();
  const { filteredAgents, loading, errors, pagination, remoteQueue } = state;
  const { currentPage, pageSize } = pagination;

  const totalItems = filteredAgents.length;
  const totalPagesComputed = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pageItems = useMemo(
    () => filteredAgents.slice(startIndex, endIndex),
    [filteredAgents, startIndex, endIndex]
  );

  const { dashboardMode, selectedProjectKey } = state;
  const [selectedChat, setSelectedChat] = useState(null);
  const projectGroups = useMemo(
    () => (dashboardMode === 'projects' ? groupAgentsByProject(filteredAgents) : []),
    [dashboardMode, filteredAgents]
  );
  const selectedProject = useMemo(
    () => projectGroups.find((group) => group.key === selectedProjectKey) || null,
    [projectGroups, selectedProjectKey]
  );

  const goPrev = () =>
    dispatch({ type: 'SET_PAGINATION', payload: { currentPage: Math.max(1, currentPage - 1) } });
  const goNext = () =>
    dispatch({
      type: 'SET_PAGINATION',
      payload: { currentPage: Math.min(totalPagesComputed, currentPage + 1) },
    });

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
          subtitle="Connect a provider in Settings or verify a local CLI install, then sync to populate this control plane."
          actionLabel="Open Settings"
          onAction={() => setView('settings')}
        />
      </div>
    );
  }

  return (
    <div id="view-dashboard" className="view-content">
      {remoteQueue?.lastError && (
        <div className="mb-4 rounded-lg border border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Remote activity could not be refreshed: {remoteQueue.lastError}
        </div>
      )}
      <SummaryStrip
        agents={state.agents}
        counts={state.counts}
        filters={state.filters}
        dispatch={dispatch}
        api={api}
      />
      <RemoteActivityRow activity={remoteQueue} />
      <ErrorBanner errors={errors} />
      <ModeToggle mode={dashboardMode} dispatch={dispatch} filters={state.filters} api={api} />

      {dashboardMode === 'projects' ? (
        selectedProject ? (
          <ProjectDetail
            group={selectedProject}
            onBack={() => {
              setSelectedChat(null);
              dispatch({ type: 'SELECT_PROJECT', payload: null });
            }}
            onOpenChat={setSelectedChat}
            activeAgent={selectedChat}
            api={api}
          />
        ) : (
          <ProjectGrid
            groups={projectGroups}
            onOpen={(key) => {
              setSelectedChat(null);
              dispatch({ type: 'SELECT_PROJECT', payload: key });
            }}
          />
        )
      ) : pageItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 py-12 text-center dark:border-border-dark">
          <span className="material-symbols-outlined mb-4 text-4xl text-slate-500">
            filter_alt_off
          </span>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            No tasks match the current filters
          </p>
        </div>
      ) : (
        <>
          <div id="agents-grid" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
