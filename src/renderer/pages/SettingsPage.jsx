import React, { useCallback } from 'react';
import { useApp } from '../context/AppContext.jsx';

function ChoiceTile({ id, active, onClick, label, children }) {
  return (
    <button
      key={label}
      type="button"
      id={id}
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-center gap-2 rounded-md border p-4 transition-colors ${
        active
          ? 'border-neutral-900 bg-neutral-900/5 dark:border-neutral-100 dark:bg-neutral-100/5'
          : 'border-border-light hover:bg-neutral-100 dark:border-border-dark dark:hover:bg-neutral-800/50'
      }`}
    >
      {children}
      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
        {label}
      </span>
    </button>
  );
}

/**
 * Settings tab: display, polling, and system controls. Service connections
 * live in the Plugins tab and the orchestrator model lives in the Agent tab
 * (DESIGN.md §2.1); everything here is neutral-themed only.
 */
export default function SettingsPage() {
  const { state, dispatch, api } = useApp();

  const setTheme = useCallback(
    (theme) => {
      api?.setTheme?.(theme);
      dispatch({ type: 'SET_SETTINGS', payload: { theme } });
    },
    [api, dispatch]
  );

  const setDisplayMode = useCallback(
    (mode) => {
      api?.setDisplayMode?.(mode);
      dispatch({ type: 'SET_SETTINGS', payload: { displayMode: mode } });
    },
    [api, dispatch]
  );

  const updatePolling = useCallback(
    (autoPolling, intervalMs) => {
      api?.setPolling?.(autoPolling, intervalMs);
      dispatch({ type: 'SET_SETTINGS', payload: { autoPolling, pollingInterval: intervalMs } });
    },
    [api, dispatch]
  );

  const updateApp = useCallback(() => {
    api?.updateApp?.();
  }, [api]);

  return (
    <div id="view-settings" className="view-content mx-auto w-full max-w-3xl space-y-5">
      <SettingSection icon={<MonitorIcon />} title="Display">
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          App theme
        </label>
        <div className="grid grid-cols-3 gap-2">
          {['system', 'light', 'dark'].map((theme) => (
            <ChoiceTile
              key={theme}
              id={`theme-${theme}`}
              active={state.settings.theme === theme}
              onClick={() => setTheme(theme)}
              label={theme}
            >
              <ThemeIcon theme={theme} />
            </ChoiceTile>
          ))}
        </div>

        <label className="mb-2 mt-6 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Window mode
        </label>
        <div className="grid grid-cols-2 gap-2">
          {['windowed', 'fullscreen'].map((mode) => (
            <ChoiceTile
              key={mode}
              active={state.settings.displayMode === mode}
              onClick={() => setDisplayMode(mode)}
              label={mode === 'windowed' ? 'Windowed' : 'Full screen'}
            >
              <WindowIcon mode={mode} />
            </ChoiceTile>
          ))}
        </div>
      </SettingSection>

      <SettingSection icon={<RefreshIcon />} title="Data polling">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={state.settings.autoPolling !== false}
            onChange={(e) => updatePolling(e.target.checked, state.settings.pollingInterval)}
            aria-label="Enable auto refresh"
          />
          <span className="text-[13px] text-neutral-700 dark:text-neutral-300">
            Enable auto refresh
          </span>
        </label>
        <div className="mt-4 flex items-end justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Refresh interval
          </label>
          <span className="font-mono text-[12px] font-semibold text-neutral-800 dark:text-neutral-200">
            {Math.round((state.settings.pollingInterval || 30000) / 1000)}s
          </span>
        </div>
        <input
          type="range"
          min="5"
          max="300"
          step="5"
          value={Math.round((state.settings.pollingInterval || 30000) / 1000)}
          onChange={(e) =>
            updatePolling(
              state.settings.autoPolling !== false,
              parseInt(e.target.value, 10) * 1000
            )
          }
          className="mt-2 w-full"
          aria-label="Refresh interval in seconds"
        />
      </SettingSection>

      <SettingSection icon={<SystemIcon />} title="System">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h4 className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">
              Update application
            </h4>
            <p className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400">
              Pull latest changes from GitHub and restart.
            </p>
          </div>
          <button
            type="button"
            id="update-app-btn"
            onClick={updateApp}
            className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:opacity-90 dark:bg-neutral-100 dark:text-neutral-900"
          >
            Update & restart
          </button>
        </div>
      </SettingSection>
    </div>
  );
}

function SettingSection({ icon, title, children }) {
  return (
    <section className="rounded-lg border border-border-light bg-card-light p-6 dark:border-border-dark dark:bg-card-dark">
      <div className="mb-5 flex items-center gap-2.5">
        <span className="text-neutral-400 dark:text-neutral-500">{icon}</span>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function MonitorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4h-4" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ThemeIcon({ theme }) {
  if (theme === 'light') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
      </svg>
    );
  }
  if (theme === 'dark') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M12 4v14" />
      <path d="M2 8h4M18 16h4" />
    </svg>
  );
}

function WindowIcon({ mode }) {
  if (mode === 'windowed') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 9h16" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3" />
    </svg>
  );
}
