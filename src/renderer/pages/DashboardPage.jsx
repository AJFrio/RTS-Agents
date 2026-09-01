import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import ErrorBanner from '../components/ui/ErrorBanner.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import {
  providerMeta,
  IconTasks,
  IconSync,
  IconClock,
  IconCheck,
  IconAlert,
  IconFolder,
  IconGitBranch,
  IconPullRequests,
  IconCloud,
  IconSearch,
} from '../components/ui/icons.jsx';
import { StatusPill } from '../components/ui/status.jsx';
import { formatTimeAgo, extractRepoName } from '../utils/format.js';

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
      className="mb-3 flex flex-col gap-2 rounded-lg border border-border-light bg-card-light px-3 py-2 text-[13px] dark:border-border-dark dark:bg-card-dark sm:flex-row sm:items-center sm:justify-between"
      role="region"
      aria-label="Remote device queue and last run"
    >
      <div className="flex items-center gap-2">
        <IconCloud size={14} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
        <span className="font-semibold text-neutral-900 dark:text-neutral-100">Remote activity</span>
        {queued > 0 && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            {queued} queued
          </span>
        )}
      </div>
      {lastTask && (
        <div className="min-w-0 truncate text-xs text-neutral-500 dark:text-neutral-400">
          Last run on {lastDevice.name || lastDevice.deviceId}: {lastTask.status}
          {lastTask.tool ? ` · ${formatShortTool(lastTask.tool)}` : ''}
          {lastTask.error ? ` · ${lastTask.error}` : ''}
          {lastTask.updatedAt ? ` · ${formatTimeAgo(lastTask.updatedAt)}` : ''}
        </div>
      )}
      {activity.loading && <span className="shrink-0 text-xs text-neutral-500">Updating</span>}
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
    { id: 'running', label: 'Running', Icon: IconSync },
    { id: 'pending', label: 'Pending', Icon: IconClock },
    { id: 'completed', label: 'Complete', Icon: IconCheck },
    { id: 'failed', label: 'Needs review', Icon: IconAlert },
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
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <div className="rounded-lg border border-border-light bg-card-light p-3 dark:border-border-dark dark:bg-card-dark">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          <IconTasks size={12} className="shrink-0" />
          All tasks
        </div>
        <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
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
            aria-pressed={enabled}
            className={`rounded-lg border p-3 text-left transition-colors ${
              enabled
                ? 'border-border-light bg-card-light hover:border-border-strong-light dark:border-border-dark dark:bg-card-dark dark:hover:border-border-strong-dark'
                : 'border-border-light bg-inset-light opacity-60 dark:border-border-dark dark:bg-inset-dark'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {item.label}
              </span>
              <item.Icon size={12} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
            </div>
            <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
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
  const { label: providerName, Icon: ProviderIcon } = providerMeta(agent.provider);

  return (
    <button
      type="button"
      className="agent-card flex w-full flex-col gap-2 p-3 text-left"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-border-light bg-inset-light text-neutral-500 dark:border-border-dark dark:bg-inset-dark dark:text-neutral-400">
          <ProviderIcon size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
          {agent.name || 'Untitled'}
        </span>
        <StatusPill status={agent.status} />
      </div>
      <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
        <span className="shrink-0 font-medium text-neutral-600 dark:text-neutral-300">
          {providerName}
        </span>
        {agent.repository && (
          <span className="flex min-w-0 items-center gap-1">
            <IconFolder size={11} className="shrink-0" />
            <span className="truncate font-mono">{extractRepoName(agent.repository)}</span>
          </span>
        )}
        {agent.branch && (
          <span className="flex min-w-0 items-center gap-1">
            <IconGitBranch size={11} className="shrink-0" />
            <span className="truncate font-mono">{agent.branch}</span>
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <IconClock size={11} />
          {timeAgo}
        </span>
      </div>
      {agent.prUrl && (
        <div className="flex items-center gap-1.5 border-t border-border-light pt-2 text-[11px] font-medium text-emerald-700 dark:border-border-dark dark:text-emerald-400">
          <IconPullRequests size={11} />
          PR available
        </div>
      )}
    </button>
  );
});

export default function DashboardPage() {
  const { state, dispatch, api, setView, openTask } = useApp();
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
        <div className="mb-3 rounded-md border border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
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

      {pageItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-light py-10 text-center dark:border-border-dark">
          <IconSearch size={20} className="mx-auto text-neutral-400" />
          <p className="mt-2 text-[13px] font-medium text-neutral-600 dark:text-neutral-300">
            No tasks match the current filters
          </p>
        </div>
      ) : (
        <>
          <div id="agents-grid" className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {pageItems.map((agent) => (
              <AgentCardItem
                key={`${agent.provider}-${agent.rawId || agent.id || Math.random()}`}
                agent={agent}
                onClick={() => openTask(agent)}
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
