import React, { useMemo, useState } from 'react';
import { groupMessages, shortenTarget, stripHarnessNoise } from '../../utils/transcript.js';

const TOOL_ICONS = {
  Bash: 'terminal',
  Edit: 'edit',
  Write: 'note_add',
  Read: 'description',
  Grep: 'search',
  Glob: 'folder_open',
  Agent: 'smart_toy',
  WebFetch: 'language',
  WebSearch: 'travel_explore',
};

const TOOL_ICON_FALLBACK = 'build';
const MAX_RESULT_CHARS = 4000;

function toolIcon(name) {
  if (TOOL_ICONS[name]) return TOOL_ICONS[name];
  if (name?.startsWith('mcp__')) return 'extension';
  return TOOL_ICON_FALLBACK;
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDay(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * One tool call, collapsed to a chip. Expands to show the input and,
 * when the transcript captured it, the result.
 */
function ToolChip({ call }) {
  const [open, setOpen] = useState(false);
  const result = call.result ? String(call.result) : '';
  const truncated = result.length > MAX_RESULT_CHARS;

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70"
      >
        <span className="material-symbols-outlined text-[14px] text-slate-400">
          {open ? 'expand_more' : 'chevron_right'}
        </span>
        <span className="material-symbols-outlined text-[14px] text-slate-500">
          {toolIcon(call.name)}
        </span>
        <span className="font-semibold">{call.name}</span>
        {call.target && (
          <span
            title={call.target}
            className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400"
          >
            {shortenTarget(call.target)}
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-200 px-2.5 py-2 dark:border-slate-700">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Input
            </span>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-100 p-2 text-[11px] text-slate-700 dark:bg-slate-950 dark:text-slate-300">
              {JSON.stringify(call.input, null, 2)}
            </pre>
          </div>
          {result && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Result
              </span>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-100 p-2 text-[11px] text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                {result.slice(0, MAX_RESULT_CHARS)}
                {truncated ? '\n… truncated' : ''}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Extended reasoning, collapsed by default. */
function ThinkingBlock({ text }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-dashed border-slate-300 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs italic text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/70"
      >
        <span className="material-symbols-outlined text-[14px]">
          {open ? 'expand_more' : 'chevron_right'}
        </span>
        <span className="material-symbols-outlined text-[14px]">psychology</span>
        Thought for a moment
      </button>
      {open && (
        <p className="whitespace-pre-wrap border-t border-dashed border-slate-300 px-2.5 py-2 text-xs italic leading-relaxed text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {text}
        </p>
      )}
    </div>
  );
}

/**
 * Chat-style transcript: user turns right-aligned, assistant left,
 * consecutive turns grouped, tool calls and reasoning collapsed.
 */
/**
 * Placeholder shown while a follow-up turn is in flight.
 *
 * Resuming a session spawns a fresh adapter before the agent even starts, so
 * the wait has two distinct phases. Naming the current one is the difference
 * between "the app froze" and "it is working".
 */
function PendingTurn({ label, assistantLabel }) {
  return (
    <div className="flex justify-start gap-2" role="status" aria-live="polite">
      <div
        aria-hidden="true"
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
      >
        <span className="material-symbols-outlined text-[16px]">smart_toy</span>
      </div>
      <div className="flex max-w-[78%] flex-col gap-1 items-start">
        <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {assistantLabel}
        </span>
        <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2.5 dark:bg-slate-800">
          <span className="flex items-center gap-2 text-sm italic text-slate-500 dark:text-slate-400">
            <span className="material-symbols-outlined animate-spin text-[16px]">
              progress_activity
            </span>
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ChatTranscript({
  messages,
  renderContent,
  assistantLabel = 'Assistant',
  pending = null,
}) {
  // Transcripts interleave real user input with harness bookkeeping; strip it
  // before grouping so a dropped block cannot split one speaker's run in two.
  const groups = useMemo(() => groupMessages(stripHarnessNoise(messages)), [messages]);

  if (!groups.length && !pending) return null;

  let lastDay = '';

  return (
    <div className="space-y-4">
      {groups.map((group, groupIndex) => {
        const isUser = group.role === 'user';
        const last = group.items[group.items.length - 1];
        const time = formatTime(last.timestamp);
        const day = formatDay(group.items[0].timestamp);
        const showDay = day && day !== lastDay;
        if (showDay) lastDay = day;

        return (
          <React.Fragment key={group.items[0].id ?? groupIndex}>
            {showDay && (
              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {day}
                </span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              </div>
            )}

            <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div
                  aria-hidden="true"
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                >
                  <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                </div>
              )}

              <div className={`flex max-w-[78%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
                <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {isUser ? 'You' : assistantLabel}
                </span>

                <div
                  className={`w-full space-y-2 rounded-2xl px-3.5 py-2.5 ${
                    isUser
                      ? 'rounded-br-sm bg-primary/10 dark:bg-primary/20'
                      : 'rounded-bl-sm bg-slate-100 dark:bg-slate-800'
                  }`}
                >
                  {group.items.map((message, itemIndex) => (
                    <div key={message.id ?? itemIndex} className="space-y-2">
                      {message.thinking && <ThinkingBlock text={message.thinking} />}
                      {message.content ? renderContent(message.content) : null}
                      {message.toolCalls?.length > 0 && (
                        <div className="space-y-1">
                          {message.toolCalls.map((call, callIndex) => (
                            <ToolChip key={call.id ?? callIndex} call={call} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {time && <span className="px-1 text-[10px] text-slate-400">{time}</span>}
              </div>
            </div>
          </React.Fragment>
        );
      })}

      {pending && <PendingTurn label={pending} assistantLabel={assistantLabel} />}
    </div>
  );
}
