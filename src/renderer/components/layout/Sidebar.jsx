import React from 'react';
import { useAppActions, useAppState } from '../../context/AppContext.jsx';
import { SIDEBAR_NAV_ITEMS } from '../../utils/mobile-nav.js';
import {
  IconAgent,
  IconClose,
  IconNewTask,
  IconPlugins,
  IconDevices,
  IconRepositories,
  IconSettings,
  IconTasks,
  IconLogo,
} from '../ui/icons.jsx';
import ReposAgentsSection from '../sidebar/ReposAgentsSection.jsx';

const NAV_ICONS = {
  agent: IconAgent,
  'new-task': IconNewTask,
  plugins: IconPlugins,
  devices: IconDevices,
  branches: IconRepositories,
  'project-management': IconTasks,
  settings: IconSettings,
};

/**
 * Sidebar (DESIGN.md §6): brand, the seven nav rows, a hairline divider,
 * then the Repos/Agents toggle with expandable sections. Running sessions
 * stay visible even when their section is collapsed.
 *
 * `variant="drawer"` is the mobile overlay: larger tap targets and a close
 * control so every destination is reachable without a bottom bar.
 */
export default function Sidebar({ variant = 'fixed' }) {
  const { currentView, sidebarMode } = useAppState();
  const { setView, setSidebarMode, openNewTaskModal, setMobileSidebarOpen } = useAppActions();
  const isDrawer = variant === 'drawer';

  const go = (view) => {
    if (view === 'new-task') openNewTaskModal();
    else setView(view);
  };

  return (
    <aside
      id="sidebar"
      className={`flex h-full w-full flex-col border-r border-border-light bg-sidebar-light dark:border-border-dark dark:bg-sidebar-dark ${
        isDrawer ? 'safe-left safe-top safe-bottom' : ''
      }`}
    >
      <div className="flex h-12 shrink-0 items-center border-b border-border-light dark:border-border-dark">
        <button
          type="button"
          data-view="dashboard"
          onClick={() => setView('dashboard')}
          aria-label="Go to task dashboard"
          className="flex min-w-0 flex-1 items-center gap-2 px-3 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
        >
          <IconLogo size={16} className="text-neutral-900 dark:text-neutral-100" />
          <span className="truncate text-[13px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            RTS Agents
          </span>
        </button>
        {isDrawer && (
          <button
            type="button"
            id="mobile-nav-close"
            aria-label="Close navigation"
            onClick={() => setMobileSidebarOpen(false)}
            className="mr-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <IconClose size={18} />
          </button>
        )}
      </div>

      <nav aria-label="Primary" className="shrink-0 p-2">
        <ul className="space-y-0.5">
          {SIDEBAR_NAV_ITEMS.map(({ view, label }) => {
            const Icon = NAV_ICONS[view];
            const isActive = currentView === view;
            return (
              <li key={view}>
                <button
                  type="button"
                  id={view === 'new-task' ? 'new-task-btn' : undefined}
                  data-view={view}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => go(view)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] transition-colors ${
                    isDrawer ? 'min-h-11' : 'py-1.5'
                  } ${
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

      <div
        className="mx-3 border-t border-border-light dark:border-border-dark"
        aria-hidden="true"
      />

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
                className={`rounded-sm px-2 text-[12px] font-medium capitalize transition-colors ${
                  isDrawer ? 'min-h-11' : 'py-1'
                } ${
                  isActive
                    ? 'bg-card-light text-neutral-900 dark:bg-card-dark dark:text-neutral-100'
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
