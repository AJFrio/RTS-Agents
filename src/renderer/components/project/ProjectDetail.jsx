import React, { useMemo, useState } from 'react';
import { StatusBadge } from '../ui/Badge.jsx';
import { sortAgentsByRecency } from '../../utils/group-agents.js';
import { formatTimeAgo, getProviderDot, getStatusLabel } from '../../utils/format.js';
import AgentConversation from '../../modals/AgentModal.jsx';

/**
 * One chat in the project's sidebar. Kept lightweight: a project can hold
 * dozens of sessions and they all mount at once.
 */
const ChatRow = React.memo(function ChatRow({ agent, isActive, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(agent)}
      className={`w-full border-l-2 px-3 py-2.5 text-left transition-colors ${
        isActive
          ? 'border-primary bg-primary/10'
          : 'border-transparent hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${getProviderDot(agent.provider)}`} />
        <span className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">
          {agent.name || 'Untitled'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 pl-3.5">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          {getStatusLabel(agent.status)}
        </span>
        <span className="text-[10px] text-slate-400">
          {formatTimeAgo(agent.updatedAt || agent.createdAt)}
        </span>
      </div>
    </button>
  );
});

/**
 * A project's chats: a searchable sidebar list that opens each chat in the
 * existing task modal, so follow-up messaging and transcript rendering are
 * shared rather than reimplemented here.
 */
export default function ProjectDetail({ group, onBack, onOpenChat, activeAgent, api }) {
  const [query, setQuery] = useState('');

  const chats = useMemo(() => {
    const sorted = sortAgentsByRecency(group.agents);
    const needle = query.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((agent) =>
      `${agent.name || ''} ${agent.prompt || ''}`.toLowerCase().includes(needle)
    );
  }, [group.agents, query]);

  const running = group.counts.running || 0;

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[420px] flex-col">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mb-1 flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-primary"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            All projects
          </button>
          <h2 className="truncate text-xl font-bold text-slate-900 dark:text-white">
            {group.label}
          </h2>
          {group.path && (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400" title={group.path}>
              {group.path}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {running > 0 && <StatusBadge status="running">{running} running</StatusBadge>}
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {group.counts.total} chats
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(240px,300px)_1fr]">
        <aside className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white dark:border-border-dark dark:bg-card-dark">
          <div className="border-b border-slate-200 p-2 dark:border-border-dark">
            <label htmlFor="project-chat-search" className="sr-only">
              Search chats in this project
            </label>
            <input
              id="project-chat-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats"
              className="w-full rounded-md border border-slate-200 bg-transparent px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-primary focus:outline-none dark:border-slate-700 dark:text-slate-200"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {chats.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-500">No chats match.</p>
            ) : (
              chats.map((agent) => (
                <ChatRow
                  key={agent.id || agent.rawId}
                  agent={agent}
                  isActive={
                    (activeAgent?.id || activeAgent?.rawId) === (agent.id || agent.rawId)
                  }
                  onOpen={onOpenChat}
                />
              ))
            )}
          </div>
        </aside>

        {activeAgent ? (
          <AgentConversation
            key={activeAgent.id || activeAgent.rawId}
            agent={activeAgent}
            api={api}
            embedded
          />
        ) : (
          <div className="hidden items-center justify-center rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-border-dark lg:flex">
            <div>
              <span className="material-symbols-outlined mb-3 text-4xl text-slate-400">forum</span>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Select a chat to open it
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {group.counts.total} {group.counts.total === 1 ? 'chat' : 'chats'} in {group.label}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
