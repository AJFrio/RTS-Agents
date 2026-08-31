import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import Composer from '../components/chat/Composer.jsx';
import RecentTasksList from '../components/chat/RecentTasksList.jsx';
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

  const isEmpty = messages.length === 0 && !busy;

  return (
    <div id="view-agent" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border-light px-4 py-2 dark:border-border-dark">
        <ModelSelector value={selectedModel} onChange={handleModelChange} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div
            className={`mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 ${
              isEmpty ? 'justify-center' : 'justify-start'
            }`}
          >
            {isEmpty ? (
              <div className="flex flex-col items-center gap-6 py-8 text-center">
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

        <RecentTasksList />
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
