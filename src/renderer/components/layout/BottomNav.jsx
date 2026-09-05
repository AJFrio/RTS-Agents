import React, { useEffect, useState } from 'react';
import { useAppActions, useAppState } from '../../context/AppContext.jsx';
import { useBelowMd } from '../../hooks/use-media-query.js';
import { isMoreNavView, MORE_NAV_ITEMS, PRIMARY_NAV_ITEMS } from '../../utils/mobile-nav.js';
import {
  IconAgent,
  IconChevronRight,
  IconDevices,
  IconMore,
  IconNewTask,
  IconPlugins,
  IconPullRequests,
  IconRepositories,
  IconSettings,
  IconTasks,
} from '../ui/icons.jsx';

const ICONS = {
  agent: IconAgent,
  'new-task': IconNewTask,
  dashboard: IconTasks,
  branches: IconRepositories,
  plugins: IconPlugins,
  'pull-requests': IconPullRequests,
  devices: IconDevices,
  settings: IconSettings,
};

function NavButton({ view, label, Icon, active, onClick, ...rest }) {
  return (
    <button
      type="button"
      data-view={view}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
        active
          ? 'text-neutral-900 dark:text-neutral-100'
          : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
      }`}
      {...rest}
    >
      <Icon size={20} className={active ? 'scale-110 transition-transform' : ''} />
      <span className={`max-w-full truncate px-0.5 text-[10px] leading-tight ${active ? 'font-semibold' : 'font-medium'}`}>
        {label}
      </span>
      {active && (
        <div className="absolute bottom-0 h-1 w-8 rounded-t-full bg-neutral-900 dark:bg-neutral-100" />
      )}
    </button>
  );
}

export default function BottomNav() {
  const { currentView } = useAppState();
  const { setView } = useAppActions();
  const belowMd = useBelowMd();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = isMoreNavView(currentView);

  useEffect(() => {
    if (!belowMd) setMoreOpen(false);
  }, [belowMd]);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [moreOpen]);

  if (!belowMd) return null;

  const openView = (view) => {
    setMoreOpen(false);
    setView(view);
  };

  return (
    <>
      {moreOpen && (
        <button
          type="button"
          aria-label="Close more navigation"
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMoreOpen(false)}
        />
      )}
      <nav
        id="bottom-nav"
        className="bottom-nav safe-left safe-right fixed bottom-0 left-0 right-0 z-40 border-t border-border-light bg-card-light md:hidden dark:border-border-dark dark:bg-card-dark"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        {moreOpen && (
          <div
            id="bottom-nav-more"
            role="menu"
            aria-label="More destinations"
            className="absolute bottom-full left-0 right-0 border-t border-border-light bg-card-light dark:border-border-dark dark:bg-card-dark"
          >
            {MORE_NAV_ITEMS.map(({ view, label }) => {
              const Icon = ICONS[view];
              const isActive = currentView === view;
              return (
                <button
                  key={view}
                  type="button"
                  role="menuitem"
                  data-view={view}
                  onClick={() => openView(view)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-h-[44px] w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] transition-colors ${
                    isActive
                      ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                      : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/60'
                  }`}
                >
                  <Icon size={16} className="shrink-0 opacity-80" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <IconChevronRight size={14} className="shrink-0 text-neutral-400" />
                </button>
              );
            })}
          </div>
        )}
        <div className="mx-auto flex h-16 max-w-xl items-stretch justify-around">
          {PRIMARY_NAV_ITEMS.map(({ view, label }) => (
            <NavButton
              key={view}
              view={view}
              label={label}
              Icon={ICONS[view]}
              active={currentView === view}
              onClick={() => openView(view)}
            />
          ))}
          <NavButton
            view="more"
            label="More"
            Icon={IconMore}
            active={moreActive || moreOpen}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            aria-controls="bottom-nav-more"
            data-more-toggle=""
            onClick={() => setMoreOpen((open) => !open)}
          />
        </div>
      </nav>
    </>
  );
}
