import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.jsx';

const NAV_ITEMS = [
  { view: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { view: 'agent', icon: 'smart_toy', label: 'Agent Chat' },
  { view: 'branches', icon: 'source', label: 'Repositories' },
  { view: 'pull-requests', icon: 'merge_type', label: 'Pull Requests' },
  { view: 'computers', icon: 'computer', label: 'Computers' },
  { view: 'jira', icon: 'assignment', label: 'Jira' },
  { view: 'settings', icon: 'settings', label: 'Settings' },
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
  const { state, setView, openNewTaskModal } = useApp();
  const { currentView } = state;
  const belowMd = useBelowMd();

  if (!belowMd) return null;

  return (
    <>
      {/* Compact floating New Task button (mobile only) */}
      <button
        type="button"
        id="new-task-btn-mobile"
        aria-label="New Task"
        className="md:hidden fixed bottom-20 right-4 z-40 w-12 h-12 bg-primary text-black flex items-center justify-center rounded-full shadow-lg hover:shadow-md hover:brightness-110 active:scale-[0.98] transition-all duration-200"
        onClick={openNewTaskModal}
      >
        <span className="material-symbols-outlined text-base">add</span>
      </button>

      {/* Bottom navigation (mobile only) */}
      <nav
        id="bottom-nav"
        className="bottom-nav md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-sidebar-dark border-t border-slate-200 dark:border-border-dark z-30 safe-bottom shadow-lg"
      >
        <div className="flex items-center justify-around h-full max-w-xl mx-auto overflow-x-auto">
          {NAV_ITEMS.map(({ view, icon, label }) => {
            const isActive = currentView === view;

            return (
              <button
                key={view}
                type="button"
                data-view={view}
                onClick={() => setView(view)}
                className={`flex flex-col items-center justify-center flex-1 h-full transition-all duration-200 relative ${
                  isActive
                    ? 'text-primary'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <span
                  className={`material-symbols-outlined text-2xl transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}
                >
                  {icon}
                </span>
                <span
                  className={`text-[9px] font-medium mt-0.5 transition-all duration-200 ${
                    isActive ? 'font-semibold' : ''
                  }`}
                >
                  {label}
                </span>

                {/* Active indicator */}
                {isActive && <div className="absolute bottom-0 w-8 h-1 bg-primary rounded-t-full" />}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
