import React from 'react';
import Collapsible from '../ui/Collapsible.jsx';

export function hasTaskContext(details) {
  if (!details) return false;
  const hasRepository = details.repository && String(details.repository).trim();
  const hasBranch = details.branch && String(details.branch).trim();
  const hasPrUrl = details.prUrl && String(details.prUrl).trim();
  const hasRuns = details.runs?.length > 0;
  const hasLatestRun = details.latestRunId && String(details.latestRunId).trim();
  const hasOpenCodeSession =
    details.opencodeSessionId && String(details.opencodeSessionId).trim();
  const hasTrackingId = details.trackingId && String(details.trackingId).trim();
  return !!(
    hasRepository ||
    hasBranch ||
    hasPrUrl ||
    hasRuns ||
    hasLatestRun ||
    hasOpenCodeSession ||
    hasTrackingId
  );
}

function shortRepoName(repository) {
  if (!repository) return null;
  const parts = String(repository).split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

export default function TaskContextSection({ details, onOpenExternal, onOpenOpenCodeSession }) {
  if (!hasTaskContext(details)) return null;

  const latestRun = details.runs?.find((run) => run.id === details.latestRunId) || details.runs?.[0];
  const projectPath = details.projectPath || details.repository;
  const repoName = shortRepoName(details.repository);

  return (
    <Collapsible
      variant="plain"
      label="Context"
      icon="data_object"
      meta={repoName ? <span className="text-[10px] technical-font text-slate-500">{repoName}</span> : null}
    >
      <dl className="space-y-2 text-sm text-slate-800 dark:text-slate-200">
        {details.repository && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Repository</dt>
            <dd className="min-w-0 break-all">{details.repository}</dd>
          </div>
        )}
        {details.branch && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Branch</dt>
            <dd className="min-w-0 break-all">{details.branch}</dd>
          </div>
        )}
        {details.prUrl && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pull request</dt>
            <dd className="min-w-0 break-all">
              <button
                type="button"
                onClick={() => onOpenExternal(details.prUrl)}
                className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 break-all text-left"
              >
                {details.prUrl}
              </button>
            </dd>
          </div>
        )}
        {details.latestRunId && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Latest run</dt>
            <dd className="technical-font text-xs min-w-0 break-all">
              {details.latestRunId}
              {latestRun?.status ? ` (${latestRun.status})` : ''}
            </dd>
          </div>
        )}
        {details.opencodeSessionId && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              OpenCode session
            </dt>
            <dd className="min-w-0 break-all">
              {onOpenOpenCodeSession && projectPath ? (
                <button
                  type="button"
                  onClick={() => onOpenOpenCodeSession(details.opencodeSessionId, projectPath)}
                  className="technical-font text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 break-all text-left"
                  title="Open this session in a terminal (OpenCode TUI)"
                >
                  {details.opencodeSessionId}
                </button>
              ) : (
                <span className="technical-font text-xs break-all">{details.opencodeSessionId}</span>
              )}
            </dd>
          </div>
        )}
        {details.trackingId && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Tracking ID
            </dt>
            <dd className="technical-font text-xs min-w-0 break-all">{details.trackingId}</dd>
          </div>
        )}
      </dl>
    </Collapsible>
  );
}
