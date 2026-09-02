import React from 'react';
import Collapsible from '../ui/Collapsible.jsx';
import JulesActivityMedia from './JulesActivityMedia.jsx';

function getActivityTypeLabel(type) {
  if (!type) return 'Activity';
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function formatActivityTime(timestamp) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export default function ActivityTimeline({
  activities,
  renderMessage,
  showMedia = false,
  mediaApi,
  mediaSessionId,
  scrollRootRef,
  expandedIds,
  onToggleRow,
}) {
  if (!activities?.length) return null;

  return (
    <div className="space-y-4">
      {activities.map((activity) => {
        const rowId = activity.id;
        const time = formatActivityTime(activity.timestamp);
        const counts = [];
        if (activity.commands?.length > 0) counts.push(`${activity.commands.length} cmd(s)`);
        if (activity.fileChanges?.length > 0) counts.push(`${activity.fileChanges.length} file(s)`);

        return (
          <div
            key={rowId}
            className="relative border-l-2 border-slate-200 py-1 pl-4 dark:border-border-dark"
          >
            <span
              aria-hidden="true"
              className="absolute -left-[5px] top-2.5 h-2 w-2 rounded-full bg-primary"
            />
            <Collapsible
              variant="plain"
              mountWhenClosed={false}
              open={expandedIds ? expandedIds.has(rowId) : undefined}
              onToggle={onToggleRow ? (next) => onToggleRow(rowId, next) : undefined}
              label={
                <span className="flex min-w-0 items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary dark:bg-primary/20">
                    {getActivityTypeLabel(activity.type)}
                  </span>
                  {activity.title && (
                    <span
                      title={activity.title}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200"
                    >
                      {activity.title}
                    </span>
                  )}
                </span>
              }
              meta={
                <span className="flex items-center gap-2 text-[10px] technical-font text-slate-500">
                  {counts.length > 0 && <span>{counts.join(' · ')}</span>}
                  {activity.originator && activity.originator !== 'system' && (
                    <span className="font-sans">({activity.originator})</span>
                  )}
                  {time && <span>{time}</span>}
                </span>
              }
            >
              {activity.description && (
                <p className="text-xs text-slate-600 dark:text-slate-400">{activity.description}</p>
              )}
              {activity.message && renderMessage(activity.message)}
              {activity.planSteps?.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  {activity.planSteps.map((step, i) => (
                    <li key={i}>
                      <span className="font-medium">{step.title}</span>
                      {step.description && ` — ${step.description}`}
                    </li>
                  ))}
                </ul>
              )}
              {showMedia && mediaSessionId && (
                <JulesActivityMedia
                  sessionId={mediaSessionId}
                  activity={activity}
                  api={mediaApi}
                  scrollRootRef={scrollRootRef}
                />
              )}
            </Collapsible>
          </div>
        );
      })}
    </div>
  );
}
