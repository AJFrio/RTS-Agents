import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import Composer from '../components/chat/Composer.jsx';
import TaskCard from '../components/chat/TaskCard.jsx';
import ModelSelector from '../components/settings/ModelSelector.jsx';
import MarkdownText from '../components/ui/Markdown.jsx';
import ChatTranscript from '../components/ui/ChatTranscript.jsx';
import { StatusDot } from '../components/ui/status.jsx';

let nextMessageId = 1;

function buildHistory(messages) {
  return messages
    .filter((msg) => msg.sender === 'user' || (msg.sender === 'assistant' && msg.text))
    .map((msg) => ({ role: msg.sender === 'user' ? 'user' : 'assistant', content: msg.text }));
}

function TaskBrowserPanel({ onClose }) {
  const { state, openTask } = useApp();
  const [repoFilter, setRepoFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');

  const repoOptions = useMemo(() => {
    const set = new Set();
    for (const agent of state.agents || []) {
      if (agent.repository) {
        set.add(String(agent.repository).replace(/[\\/]+$/, '').split(/[\\/]/).pop());
      }
    }
    return [...set].sort();
  }, [state.agents]);

  const providerOptions = useMemo(() => {
    const set = new Set((state.agents || []).map((agent) => agent.provider));
    return [...set].sort();
  }, [state.agents]);

  const filtered = useMemo(() => {
    return (state.agents || [])
      .filter((agent) =>
        providerFilter === 'all' ? true : agent.provider === providerFilter
      )
      .filter((agent) => {
        if (repoFilter === 'all') return true;
        const base = String(agent.repository || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop();
        return base === repoFilter;
      })
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 50);
  }, [state.agents, repoFilter, providerFilter]);

  return (
    <div className="mb-4 rounded-lg border border-border-light dark:border-border-dark">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-light px-3 py-2 dark:border-border-dark">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Previous tasks
        </span>
        <div className="flex items-center gap-2">
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            aria-label="Filter by harness"
            className="w-auto py-1 text-[12px]"
          >
            <option value="all">All harnesses</option>
            {providerOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={repoFilter}
            onChange={(e) => setRepoFilter(e.target.value)}
            aria-label="Filter by repo"
            className="w-auto py-1 text-[12px]"
          >
            <option value="all">All repos</option>
            {repoOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task browser"
            className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-4 text-center text-[12px] text-neutral-400">No tasks match.</p>
        ) : (
          <div className="grid gap-1 md:grid-cols-2">
            {filtered.map((task) => (
              <TaskCard key={task.id} task={task} compact onClick={openTask} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  'What tasks are currently running?',
  'Start a task in the RTS-Agents repo using Jules',
  'Summarize recent work across my repos',
  'Show me my available devices and their repos',
];

/**
 * Agent tab (the orchestrator, DESIGN.md §2.1): a minimal Cursor-style chat.
 * The orchestrator's tool calls render as expandable rows and every task it
 * starts or references surfaces as a clickable card that opens the task
 * transcript.
 */
export default function AgentPage() {
  const { state, api, dispatch } = useApp();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const scrollRef = useRef(null);
  const selectedModel = state.settings?.selectedModel || 'openrouter/openai/gpt-4o';

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const handleModelChange = (model) => {
    dispatch({ type: 'SET_SETTINGS', payload: { selectedModel: model } });
    if (api?.setModel) api.setModel(model);
  };

  const send = async (text) => {
    const prompt = (text ?? input).trim();
    if (!prompt || busy) return;

    const userMessage = {
      id: `m-${nextMessageId++}`,
      sender: 'user',
      text: prompt,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setBusy(true);

    try {
      const history = buildHistory([...messages, userMessage]);
      const result = await api.orchestratorChat(history, selectedModel);
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${nextMessageId++}`,
          sender: 'assistant',
          text: result?.content || '',
          toolCalls: result?.toolCalls || [],
          taskCards: result?.taskCards || [],
          isError: /error/i.test(result?.content || '') && !result?.toolCalls?.length,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${nextMessageId++}`,
          sender: 'assistant',
          text: err?.message || 'The orchestrator request failed.',
          isError: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const transcriptMessages = useMemo(
    () =>
      messages.map((msg) => ({
        id: msg.id,
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text,
        toolCalls:
          msg.sender === 'assistant' && msg.toolCalls?.length
            ? msg.toolCalls.map((call, i) => ({
                id: `${msg.id}-tool-${i}`,
                name: call.tool,
                target: JSON.stringify(call.args || {}).slice(0, 72),
                input: call.args,
                result: call.result,
                status: 'completed',
              }))
            : undefined,
      })),
    [messages]
  );

  const lastAssistant = [...messages].reverse().find((m) => m.sender === 'assistant');
  const lastCards = lastAssistant?.taskCards || [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-light px-4 py-2 dark:border-border-dark">
        <span className="truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
          {selectedModel.replace(/^openrouter\//, '')}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setBrowserOpen((v) => !v)}
            aria-expanded={browserOpen}
            className="rounded-md border border-border-light px-2.5 py-1 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-border-dark dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            Tasks
          </button>
          <ModelSelector value={selectedModel} onChange={handleModelChange} />
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {browserOpen && <TaskBrowserPanel onClose={() => setBrowserOpen(false)} />}

          {messages.length === 0 && !busy ? (
            <div className="flex flex-col items-center gap-6 py-16 text-center">
              <div>
                <h2 className="text-[22px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                  What should we work on?
                </h2>
                <p className="mt-1.5 text-[13px] text-neutral-500 dark:text-neutral-400">
                  The orchestrator can start tasks on any harness, browse repos and
                  devices, and pull up previous work.
                </p>
              </div>
              <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => send(suggestion)}
                    className="rounded-lg border border-border-light px-3 py-2.5 text-left text-[13px] text-neutral-600 transition-colors hover:border-border-strong-light hover:bg-neutral-50 dark:border-border-dark dark:text-neutral-400 dark:hover:border-border-strong-dark dark:hover:bg-neutral-800/40"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <ChatTranscript
                messages={transcriptMessages}
                assistantLabel="Orchestrator"
                renderContent={(content) => <MarkdownText text={content} />}
              />

              {busy && (
                <div className="mt-4 flex items-center gap-2 pl-10 text-[13px] text-neutral-400">
                  <StatusDot status="running" className="status-pulse" />
                  Working…
                </div>
              )}

              {lastCards.length > 0 && !busy && (
                <div className="mt-4 space-y-2 pl-10">
                  {lastCards.map((card) => (
                    <TaskCard key={card.id} task={card} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border-light bg-background-light px-4 py-3 dark:border-border-dark dark:bg-background-dark">
        <div className="mx-auto w-full max-w-3xl">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => send()}
            busy={busy}
            disabled={busy}
            placeholder="Ask the orchestrator to start, find, or summarize work…"
            textareaId="agent-input"
            submitLabel="Send message"
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}
