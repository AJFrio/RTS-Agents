import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import {
  IconAgent,
  IconNewTask,
  IconDevices,
  IconPullRequests,
  IconRepositories,
  IconSettings,
  IconTasks,
} from '../ui/icons.jsx';

const NAV_ITEMS = [
  { view: 'agent', Icon: IconAgent, label: 'Agent' },
  { view: 'new-task', Icon: IconNewTask, label: 'New Task' },
  { view: 'dashboard', Icon: IconTasks, label: 'Tasks' },
  { view: 'branches', Icon: IconRepositories, label: 'Repos' },
  { view: 'pull-requests', Icon: IconPullRequests, label: 'PRs' },
  { view: 'devices', Icon: IconDevices, label: 'Devices' },
  { view: 'settings', Icon: IconSettings, label: 'Settings' },
];

function useBelowMd() {
  const [belowMd, setBelowMd] = useState(() => !window.matchMedia('(min-width: 768px)').matches);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const handleChange = (event) => setBelowMd(!event.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return belowMd;
}

export default function BottomNav() {
  const { state, setView } = useApp();
  const { currentView } = state;
  const belowMd = useBelowMd();

  if (!belowMd) return null;

  return (
    <nav
      id="bottom-nav"
      className="bottom-nav safe-bottom fixed bottom-0 left-0 right-0 z-30 h-16 border-t border-border-light bg-card-light md:hidden dark:border-border-dark dark:bg-card-dark"
    >
      <div className="mx-auto flex h-full max-w-xl items-center justify-around overflow-x-auto">
        {NAV_ITEMS.map(({ view, Icon, label }) => {
          const isActive = currentView === view;
          return (
            <button
              key={view}
              type="button"
              data-view={view}
              onClick={() => setView(view)}
              className={`relative flex h-full flex-1 flex-col items-center justify-center transition-colors ${
                isActive
                  ? 'text-neutral-900 dark:text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              <Icon size={20} className={isActive ? 'scale-110 transition-transform' : ''} />
              <span
                className={`mt-0.5 text-[9px] font-medium ${isActive ? 'font-semibold' : ''}`}
              >
                {label}
              </span>
              {isActive && (
                <div className="absolute bottom-0 h-1 w-8 rounded-t-full bg-neutral-900 dark:bg-neutral-100" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
