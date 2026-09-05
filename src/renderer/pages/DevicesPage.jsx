import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useBelowLg } from '../hooks/use-media-query.js';
import { providerMeta, IconDevices, IconArrowRight, IconClose, IconTerminal, IconChevronLeft } from '../components/ui/icons.jsx';
import { StatusDot } from '../components/ui/status.jsx';

function isOnline(device) {
  if (device?.status === 'on') return true;
  const heartbeat = new Date(device?.lastHeartbeat || 0).getTime();
  return heartbeat > 0 && Date.now() - heartbeat < 6 * 60 * 1000;
}

function getTools(device) {
  const tools = device?.tools?.[0]?.['CLI tools'];
  return Array.isArray(tools) ? tools : [];
}

function pickPreferredProvider(tools) {
  const joined = tools.join(' ').toLowerCase();
  if (joined.includes('opencode')) return 'opencode';
  if (joined.includes('codex')) return 'codex';
  if (joined.includes('claude')) return 'claude-cli';
  if (joined.includes('antigravity')) return 'antigravity';
  return null;
}

function shortRepo(path) {
  const text = String(path || '').trim();
  if (!text) return '';
  return text.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || text;
}

function formatWhen(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function DeviceCard({ device, isLocal, queue, onSelect, selected }) {
  const online = isOnline(device);
  const tools = getTools(device);
  const queueLength = queue?.queueLength ?? 0;

  return (
    <button
      type="button"
      data-device-id={device.id}
      onClick={() => onSelect(device)}
      aria-pressed={selected}
      className={`w-full rounded-lg border p-4 text-left transition-colors ${
        selected
          ? 'border-neutral-900 bg-card-light dark:border-neutral-100 dark:bg-card-dark'
          : 'border-border-light bg-card-light hover:border-border-strong-light dark:border-border-dark dark:bg-card-dark dark:hover:border-border-strong-dark'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border ${
            online
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'border-border-light bg-inset-light text-neutral-400 dark:border-border-dark dark:bg-inset-dark'
          }`}
        >
          <IconDevices size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
              {device.name || device.id}
            </span>
            {isLocal && (
              <span className="shrink-0 rounded-full bg-neutral-200/70 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                This device
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
            <StatusDot status={online ? 'running' : 'idle'} className={online ? 'status-pulse' : ''} />
            {online ? 'Online' : 'Offline'} · {device.platform || 'desktop'}
            {queueLength > 0 && ` · ${queueLength} queued`}
          </p>
          {tools.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tools.slice(0, 4).map((tool) => (
                <span
                  key={tool}
                  className="rounded-full border border-border-light px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:border-border-dark dark:text-neutral-400"
                >
                  {tool}
                </span>
              ))}
              {tools.length > 4 && (
                <span className="rounded-full border border-border-light px-2 py-0.5 text-[10px] text-neutral-400 dark:border-border-dark">
                  +{tools.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function DeviceDetail({ device, isLocal, queue, onBack }) {
  const { state, openNewTaskModal, openTask } = useApp();
  const tools = getTools(device);
  const repos = Array.isArray(device.repos) ? device.repos : [];
  const online = isOnline(device);
  const preferred = pickPreferredProvider(tools);

  const runningTasks = useMemo(() => {
    if (!isLocal) return [];
    return (state.agents || []).filter(
      (agent) => String(agent.status).toLowerCase() === 'running'
    );
  }, [isLocal, state.agents]);

  const handleStartTask = () => {
    if (isLocal) {
      openNewTaskModal({ presetEnvironment: 'local' });
      return;
    }
    openNewTaskModal({
      presetEnvironment: 'remote',
      presetTargetDeviceId: device.id,
      ...(preferred ? { presetPreferredProvider: preferred } : {}),
    });
  };

  return (
    <div className="rounded-lg border border-border-light bg-card-light dark:border-border-dark dark:bg-card-dark">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-light px-3 py-3 sm:px-4 dark:border-border-dark">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to devices"
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <IconChevronLeft size={16} />
          </button>
          <h3 className="truncate text-[14px] font-semibold text-neutral-900 dark:text-neutral-100">
            {device.name || device.id}
          </h3>
          {isLocal && (
            <span className="shrink-0 rounded-full bg-neutral-200/70 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              This device
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleStartTask}
          disabled={!isLocal && (!online || tools.length === 0)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
        >
          Start task
          <IconArrowRight size={12} />
        </button>
      </div>

      <div className="space-y-5 p-4">
        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Services
          </h4>
          {tools.length === 0 ? (
            <p className="text-[12px] text-neutral-400 dark:text-neutral-500">
              No CLI services detected on this device.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tools.map((tool) => (
                <span
                  key={tool}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border-light px-2.5 py-1 text-[11px] font-medium text-neutral-600 dark:border-border-dark dark:text-neutral-400"
                >
                  <IconTerminal size={11} />
                  {tool}
                </span>
              ))}
            </div>
          )}
        </section>

        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Repositories ({repos.length})
          </h4>
          {repos.length === 0 ? (
            <p className="text-[12px] text-neutral-400 dark:text-neutral-500">
              No repositories reported. Add repository roots in Plugins.
            </p>
          ) : (
            <div className="grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2">
              {repos.map((repo) => (
                <span
                  key={repo.path || repo.name}
                  title={repo.path || repo.name}
                  className="truncate rounded-md border border-border-light px-2.5 py-1 font-mono text-[11px] text-neutral-600 dark:border-border-dark dark:text-neutral-400"
                >
                  {shortRepo(repo.path || repo.name)}
                </span>
              ))}
            </div>
          )}
        </section>

        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {isLocal ? 'Running tasks' : 'Remote queue'}
          </h4>
          {isLocal ? (
            runningTasks.length === 0 ? (
              <p className="text-[12px] text-neutral-400 dark:text-neutral-500">
                Nothing running right now.
              </p>
            ) : (
              <ul className="space-y-1">
                {runningTasks.map((task) => {
                  const meta = providerMeta(task.provider);
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => openTask(task)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
                      >
                        <StatusDot status="running" className="status-pulse" />
                        <span className="min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-300">
                          {task.name || 'Task'}
                        </span>
                        <span className="shrink-0 text-[10px] text-neutral-400">{meta.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            <div className="text-[12px] text-neutral-600 dark:text-neutral-400">
              <p>
                {queue?.queueLength ?? 0} task{(queue?.queueLength ?? 0) === 1 ? '' : 's'} queued
              </p>
              {queue?.lastTask && (
                <p className="mt-1 text-neutral-500 dark:text-neutral-500">
                  Last: {queue.lastTask.tool || 'task'} —{' '}
                  <span
                    className={
                      queue.lastTask.status === 'completed'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : queue.lastTask.status === 'failed'
                          ? 'text-red-600 dark:text-red-400'
                          : ''
                    }
                  >
                    {queue.lastTask.status || 'unknown'}
                  </span>{' '}
                  {queue.lastTask.updatedAt ? `· ${formatWhen(queue.lastTask.updatedAt)}` : ''}
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Devices tab (replaces the old Computers page): linked devices as cards;
 * clicking one shows its services, repositories, and running/queued tasks
 * with a start-task button (DESIGN.md §2.1 creative latitude).
 */
export default function DevicesPage() {
  const { state, fetchComputers, loadRemoteQueueActivity } = useApp();
  const [selectedId, setSelectedId] = useState(state.focusedDeviceId || null);
  const belowLg = useBelowLg();

  useEffect(() => {
    fetchComputers?.();
    loadRemoteQueueActivity?.();
  }, [fetchComputers, loadRemoteQueueActivity]);

  useEffect(() => {
    if (state.focusedDeviceId) setSelectedId(state.focusedDeviceId);
  }, [state.focusedDeviceId]);

  const computers = state.computers?.list ?? [];
  const queueByDevice = useMemo(() => {
    const map = new Map();
    for (const device of state.remoteQueue?.devices || []) {
      map.set(device.deviceId, device);
    }
    return map;
  }, [state.remoteQueue?.devices]);

  const selected = computers.find((c) => c.id === selectedId) || null;

  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selectedId, selected]);

  if (!state.computers?.configured && computers.length === 0) {
    return (
      <div id="view-devices" className="view-content mx-auto max-w-lg py-16 text-center">
        <IconDevices size={22} className="mx-auto text-neutral-400" />
        <h2 className="mt-3 text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
          Device sync isn't configured
        </h2>
        <p className="mt-1.5 text-[13px] text-neutral-500 dark:text-neutral-400">
          Connect Cloudflare KV in the Plugins tab to see and dispatch to your other machines.
        </p>
      </div>
    );
  }

  return (
    <div id="view-devices" className="view-content mx-auto w-full max-w-5xl">
      {computers.length === 0 ? (
        <div className="py-16 text-center">
          <IconDevices size={22} className="mx-auto text-neutral-400" />
          <p className="mt-3 text-[13px] text-neutral-500 dark:text-neutral-400">
            No linked devices yet. Devices appear once their heartbeat lands in Cloudflare KV.
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className={`grid gap-3 sm:grid-cols-2 ${selected && belowLg ? 'hidden lg:grid' : ''}`}>
            {computers.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                isLocal={device.id === state.localDeviceId}
                queue={queueByDevice.get(device.id)}
                selected={selectedId === device.id}
                onSelect={(d) => setSelectedId(d.id)}
              />
            ))}
          </div>
          {selected && (
            <DeviceDetail
              device={selected}
              isLocal={selected.id === state.localDeviceId}
              queue={queueByDevice.get(selected.id)}
              onBack={() => setSelectedId(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
