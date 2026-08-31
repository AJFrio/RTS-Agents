import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import {
  IconAgent,
  IconNewTask,
  IconPlugins,
  IconDevices,
  IconPullRequests,
  IconRepositories,
  IconSettings,
  IconLogo,
} from '../ui/icons.jsx';
import ReposAgentsSection from '../sidebar/ReposAgentsSection.jsx';

const NAV_ITEMS = [
  { view: 'agent', Icon: IconAgent, label: 'Agent', id: null },
  { view: 'new-task', Icon: IconNewTask, label: 'New Task', id: 'new-task-btn' },
  { view: 'plugins', Icon: IconPlugins, label: 'Plugins', id: null },
  { view: 'devices', Icon: IconDevices, label: 'Devices', id: null },
  { view: 'pull-requests', Icon: IconPullRequests, label: 'Pull Requests', id: null },
  { view: 'branches', Icon: IconRepositories, label: 'Repositories', id: null },
  { view: 'settings', Icon: IconSettings, label: 'Settings', id: null },
];

/**
 * Sidebar (DESIGN.md §6): brand, the seven nav rows, a hairline divider,
 * then the Repos/Agents toggle with expandable sections. Running sessions
 * stay visible even when their section is collapsed.
 */
export default function Sidebar() {
  const { state, setView, setSidebarMode } = useApp();
  const { currentView, sidebarMode } = state;

  return (
    <aside
      id="sidebar"
      className="flex h-full w-full flex-col border-r border-border-light bg-sidebar-light dark:border-border-dark dark:bg-sidebar-dark"
    >
      <button
        type="button"
        data-view="dashboard"
        onClick={() => setView('dashboard')}
        aria-label="Go to task dashboard"
        className="flex h-12 shrink-0 items-center gap-2 border-b border-border-light px-3 text-left transition-colors hover:bg-neutral-100 dark:border-border-dark dark:hover:bg-neutral-800/50"
      >
        <IconLogo size={16} className="text-neutral-900 dark:text-neutral-100" />
        <span className="text-[13px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          RTS Agents
        </span>
      </button>

      <nav aria-label="Primary" className="shrink-0 p-2">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ view, Icon, label, id }) => {
            const isActive = currentView === view;
            return (
              <li key={view}>
                <button
                  type="button"
                  id={id ?? undefined}
                  data-view={view}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setView(view)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                    isActive
                      ? 'bg-neutral-200/70 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                      : 'text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200'
                  }`}
                >
                  <Icon size={15} className="shrink-0 opacity-80" />
                  <span className="truncate">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mx-3 border-t border-border-light dark:border-border-dark" aria-hidden="true" />

      <div className="shrink-0 p-2 pb-1">
        <div
          role="group"
          aria-label="Sidebar sections"
          className="grid grid-cols-2 gap-0.5 rounded-md bg-inset-light p-0.5 dark:bg-inset-dark"
        >
          {['repos', 'agents'].map((mode) => {
            const isActive = sidebarMode === mode;
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={isActive}
                onClick={() => setSidebarMode(mode)}
                className={`rounded-sm px-2 py-1 text-[12px] font-medium capitalize transition-colors ${
                  isActive
                    ? 'bg-card-light text-neutral-900 shadow-sm dark:bg-card-dark dark:text-neutral-100'
                    : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
              >
                {mode}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-1">
        <ReposAgentsSection mode={sidebarMode} />
      </div>
    </aside>
  );
}
