import React, { useMemo, useState } from 'react';
import { groupMessages, shortenTarget } from '../../utils/transcript.js';
import {
  IconTerminal,
  IconEdit,
  IconWrite,
  IconRead,
  IconSearch,
  IconGlob,
  IconGlobe,
  IconExtension,
  IconWrench,
  IconChevronRight,
  IconChevronDown,
  IconThinking,
  IconAgent,
  IconDevices,
  IconRepositories,
  IconPullRequests,
  IconGitBranch,
  IconTasks,
} from './icons.jsx';

const TOOL_ICONS = {
  Bash: IconTerminal,
  Edit: IconEdit,
  Write: IconWrite,
  Read: IconRead,
  Grep: IconSearch,
  Glob: IconGlob,
  Agent: IconAgent,
  WebFetch: IconGlobe,
  WebSearch: IconGlobe,
  list_computers: IconDevices,
  show_device: IconDevices,
  list_repos: IconRepositories,
  show_repo: IconRepositories,
  list_github_repos: IconRepositories,
  create_local_repo: IconRepositories,
  create_github_repo: IconRepositories,
  pull_repo: IconGitBranch,
  list_pull_requests: IconPullRequests,
  show_pull_request: IconPullRequests,
  merge_pull_request: IconPullRequests,
  close_pull_request: IconPullRequests,
  mark_pr_ready: IconPullRequests,
  list_tasks: IconTasks,
  show_task: IconTasks,
  start_task: IconTasks,
};

const MAX_RESULT_CHARS = 4000;

function ToolIconFor({ name }) {
  const Icon = TOOL_ICONS[name] || (name?.startsWith?.('mcp__') ? IconExtension : null) || IconWrench;
  return <Icon size={13} />;
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
    <div className="rounded-md border border-border-light bg-inset-light/60 dark:border-border-dark dark:bg-inset-dark/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800/70"
      >
        {open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
        <span className="text-neutral-500 dark:text-neutral-400">
          <ToolIconFor name={call.name} />
        </span>
        <span className="font-medium">{call.name}</span>
        {call.status && (
          <span
            className={`text-[10px] uppercase tracking-wide ${
              call.status === 'completed'
                ? 'text-emerald-700 dark:text-emerald-400'
                : call.status === 'pending' || call.status === 'in_progress'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-neutral-400'
            }`}
          >
            {call.status}
          </span>
        )}
        {call.target && (
          <span
            title={call.target}
            className="truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400"
          >
            {shortenTarget(call.target)}
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t border-border-light px-2.5 py-2 dark:border-border-dark">
          {call.input !== undefined && call.input !== null && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                Input
              </span>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-inset-light p-2 font-mono text-[11px] text-neutral-700 dark:bg-inset-dark dark:text-neutral-300">
                {JSON.stringify(call.input, null, 2)}
              </pre>
            </div>
          )}
          {result && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                Result
              </span>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-inset-light p-2 font-mono text-[11px] text-neutral-700 dark:bg-inset-dark dark:text-neutral-300">
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

/**
 * Consecutive tool calls collapse into one bar. Expanding reveals
 * each call, which can then be opened on its own.
 */
function ToolCallsGroup({ calls }) {
  const [open, setOpen] = useState(false);
  if (!calls?.length) return null;
  if (calls.length === 1) return <ToolChip call={calls[0]} />;

  const label = `Tool Calls (${calls.length})`;

  return (
    <div className="rounded-md border border-border-light bg-inset-light/60 dark:border-border-dark dark:bg-inset-dark/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800/70"
      >
        {open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
        <span className="text-neutral-500 dark:text-neutral-400">
          <IconWrench size={14} />
        </span>
        <span className="font-medium">Tool Calls</span>
        <span className="text-[10px] text-neutral-400">{calls.length}</span>
      </button>
      {open && (
        <div className="space-y-1 border-t border-border-light p-1.5 dark:border-border-dark">
          {calls.map((call, index) => (
            <ToolChip key={call.id ?? index} call={call} />
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBody({ items, isUser, renderContent, renderCards }) {
  const nodes = [];
  let toolBuffer = [];
  let flushKey = 0;

  const flushTools = () => {
    if (!toolBuffer.length) return;
    const calls = toolBuffer;
    toolBuffer = [];
    nodes.push(<ToolCallsGroup key={`tools-${flushKey}`} calls={calls} />);
    flushKey += 1;
  };

  items.forEach((message, itemIndex) => {
    if (message.thinking) {
      flushTools();
      nodes.push(<ThinkingBlock key={`${message.id ?? itemIndex}-think`} text={message.thinking} />);
    }
    if (message.content) {
      flushTools();
      nodes.push(
        <div
          key={`${message.id ?? itemIndex}-text`}
          className={isUser ? 'text-[14px] text-neutral-900 dark:text-neutral-100' : ''}
        >
          {renderContent(message.content)}
        </div>
      );
    }
    if (message.toolCalls?.length) {
      toolBuffer = toolBuffer.concat(message.toolCalls);
    }
    if (message.cards?.length && renderCards) {
      flushTools();
      nodes.push(
        <div key={`${message.id ?? itemIndex}-cards`}>{renderCards(message.cards)}</div>
      );
    }
  });
  flushTools();
  return nodes;
}

/** Extended reasoning, collapsed by default. */
function ThinkingBlock({ text }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-dashed border-border-strong-light dark:border-border-strong-dark">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs italic text-neutral-500 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800/70"
      >
        {open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
        <IconThinking size={13} />
        Thought for a moment
      </button>
      {open && (
        <p className="whitespace-pre-wrap border-t border-dashed border-border-strong-light px-2.5 py-2 text-xs italic leading-relaxed text-neutral-500 dark:border-border-strong-dark dark:text-neutral-400">
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
export default function ChatTranscript({
  messages,
  renderContent,
  renderCards,
  assistantLabel = 'Assistant',
}) {
  const groups = useMemo(() => groupMessages(messages), [messages]);

  if (!groups.length) return null;

  let lastDay = '';

  return (
    <div className="space-y-4" data-selectable="true">
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
                <div className="h-px flex-1 bg-border-light dark:bg-border-dark" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  {day}
                </span>
                <div className="h-px flex-1 bg-border-light dark:bg-border-dark" />
              </div>
            )}

            <div className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div
                  aria-hidden="true"
                  className="mt-6 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-light bg-card-light text-neutral-500 dark:border-border-dark dark:bg-card-dark dark:text-neutral-400"
                >
                  <IconAgent size={14} />
                </div>
              )}

              <div className={`flex max-w-[90%] flex-col gap-1 sm:max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
                <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  {isUser ? 'You' : assistantLabel}
                </span>

                <div
                  className={`w-full space-y-2 ${
                    isUser ? 'rounded-lg rounded-br-sm bg-inset-light px-3.5 py-2 dark:bg-inset-dark' : ''
                  }`}
                >
                  <MessageBody
                    items={group.items}
                    isUser={isUser}
                    renderContent={renderContent}
                    renderCards={renderCards}
                  />
                </div>

                {time && <span className="px-1 text-[10px] text-neutral-400">{time}</span>}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
