import React, { useState } from 'react';
import JulesActivityMedia from './JulesActivityMedia.jsx';

const ACTIVITY_ICONS = {
  build: 'construction',
  plan: 'checklist',
  review: 'rate_review',
  verification: 'fact_check',
  progress: 'timeline',
  finalization: 'flag',
  error: 'error',
  command: 'terminal',
  file_change: 'edit_note',
};

const ACTIVITY_ICON_FALLBACK = 'timeline';

function activityIcon(type) {
  if (type && ACTIVITY_ICONS[type]) return ACTIVITY_ICONS[type];
  return ACTIVITY_ICON_FALLBACK;
}

function getActivityTypeLabel(type) {
  if (!type) return 'Activity';
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function formatFeedTime(ms) {
  if (ms == null) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

function formatMessageTime(ms) {
  if (ms == null) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * One activity row on the feed's timeline rail. Collapsed to an
 * icon + type chip + title line; expands to description, message markdown,
 * plan steps, and (for Jules) verification media.
 */
function ActivityRow({ item, renderMessage, expandedIds, onToggleRow, showMedia, mediaApi, mediaSessionId, scrollRootRef }) {
  const raw = item.raw ?? {};
  const time = formatFeedTime(item.timestamp);
  const counts = [];
  if (raw.commands?.length > 0) counts.push(`${raw.commands.length} cmd(s)`);
  if (raw.fileChanges?.length > 0) counts.push(`${raw.fileChanges.length} file(s)`);
  const controlled = expandedIds instanceof Set;
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = controlled ? expandedIds.has(item.id) : localOpen;

  const handleToggle = () => {
    const next = !isOpen;
    if (!controlled) setLocalOpen(next);
    if (onToggleRow) onToggleRow(item.id, next);
  };

  return (
    <div className="relative ml-1 border-l-2 border-slate-200 py-1 pl-4 dark:border-border-dark">
      <span
        aria-hidden="true"
        className="absolute -left-[5px] top-2.5 h-2 w-2 rounded-full bg-primary"
      />
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={handleToggle}
        className="flex w-full items-center gap-2 rounded-md py-0.5 pr-1 text-left transition-colors hover:bg-slate-100/70 dark:hover:bg-slate-800/50"
      >
        <span
          aria-hidden="true"
          className="material-symbols-outlined text-[14px] text-slate-400"
        >
          {isOpen ? 'expand_more' : 'chevron_right'}
        </span>
        <span
          aria-hidden="true"
          className="material-symbols-outlined text-[16px] text-primary"
        >
          {activityIcon(raw.type)}
        </span>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary dark:bg-primary/20">
          {getActivityTypeLabel(raw.type)}
        </span>
        <span
          title={item.title || getActivityTypeLabel(raw.type)}
          className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200"
        >
          {item.title || getActivityTypeLabel(raw.type)}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[10px] technical-font text-slate-500">
          {counts.length > 0 && <span>{counts.join(' · ')}</span>}
          {raw.originator && raw.originator !== 'system' && (
            <span className="font-sans">({raw.originator})</span>
          )}
          {time && <span>{time}</span>}
        </span>
      </button>
      {isOpen && (
        <div className="ml-6 mt-1 space-y-2 pb-1">
          {item.text && (
            <p className="text-xs text-slate-600 dark:text-slate-400">{item.text}</p>
          )}
          {raw.message && renderMessage(raw.message)}
          {raw.planSteps?.length > 0 && (
            <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
              {raw.planSteps.map((step, i) => (
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
              activity={raw}
              api={mediaApi}
              scrollRootRef={scrollRootRef}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One chat turn: user turns right-aligned with the primary accent,
 * assistant/system turns left with an agent avatar.
 */
function MessageRow({ item, renderMessage, assistantLabel }) {
  const time = formatMessageTime(item.timestamp);
  return (
    <div className={`flex gap-2 py-1 ${item.isUser ? 'justify-end' : 'justify-start'}`}>
      {!item.isUser && (
        <div
          aria-hidden="true"
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
        >
          <span className="material-symbols-outlined text-[16px]">smart_toy</span>
        </div>
      )}
      <div className={`flex max-w-[90%] flex-col gap-1 sm:max-w-[78%] ${item.isUser ? 'items-end' : 'items-start'}`}>
        <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {item.isUser ? 'You' : assistantLabel}
        </span>
        <div
          className={`w-full rounded-2xl px-3.5 py-2.5 ${
            item.isUser
              ? 'rounded-br-sm bg-primary/10 dark:bg-primary/20'
              : 'rounded-bl-sm bg-slate-100 dark:bg-slate-800'
          }`}
        >
          {renderMessage(item.text)}
        </div>
        {time && <span className="px-1 text-[10px] text-slate-400">{time}</span>}
      </div>
    </div>
  );
}

/**
 * Unified chronological activity feed: chat bubbles for message/conversation
 * turns, timeline rows for provider activities — one merged stream, no
 * section accordions.
 */
export default function UnifiedActivityFeed({
  feed,
  renderMessage,
  assistantLabel = 'Agent',
  showMedia = false,
  mediaApi,
  mediaSessionId,
  scrollRootRef,
  expandedIds,
  onToggleRow,
}) {
  if (!feed?.length) return null;

  return (
    <div className="space-y-2">
      {feed.map((item) =>
        item.kind === 'activity' ? (
          <ActivityRow
            key={item.id}
            item={item}
            renderMessage={renderMessage}
            expandedIds={expandedIds}
            onToggleRow={onToggleRow}
            showMedia={showMedia}
            mediaApi={mediaApi}
            mediaSessionId={mediaSessionId}
            scrollRootRef={scrollRootRef}
          />
        ) : (
          <MessageRow
            key={item.id}
            item={item}
            renderMessage={renderMessage}
            assistantLabel={assistantLabel}
          />
        )
      )}
    </div>
  );
}
