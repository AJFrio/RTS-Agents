import React, { useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext.jsx';
import Composer from '../components/chat/Composer.jsx';
import RecentTasksList from '../components/chat/RecentTasksList.jsx';
import TaskCard from '../components/chat/TaskCard.jsx';
import ModelSelector from '../components/settings/ModelSelector.jsx';
import MarkdownText from '../components/ui/Markdown.jsx';
import ChatTranscript from '../components/ui/ChatTranscript.jsx';
import { StatusDot } from '../components/ui/status.jsx';
import { IconPlus } from '../components/ui/icons.jsx';

function nextMessageId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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
 * Agent tab (the orchestrator, DESIGN.md §2.1): heading + Cursor-style
 * composer. Sending a message animates Recent tasks closed so the chat
 * owns the canvas. Chat state lives in AppContext so it survives tab
 * switches.
 */
export default function AgentPage() {
  const { state, api, dispatch } = useApp();
  const chat = state.orchestratorChat || {
    messages: [],
    input: '',
    busy: false,
    recentTasksVisible: true,
  };
  const { messages, input, busy, recentTasksVisible } = chat;
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

  const resetChat = () => {
    dispatch({ type: 'RESET_ORCHESTRATOR_CHAT' });
  };

  const send = async (text) => {
    const prompt = (text ?? input).trim();
    if (!prompt || busy) return;

    const userMessage = {
      id: nextMessageId(),
      sender: 'user',
      text: prompt,
    };
    const nextMessages = [...messages, userMessage];
    dispatch({
      type: 'SET_ORCHESTRATOR_CHAT',
      payload: {
        messages: nextMessages,
        input: '',
        busy: true,
        recentTasksVisible: false,
      },
    });

    try {
      const history = buildHistory(nextMessages);
      const result = await api.orchestratorChat(history, selectedModel);
      dispatch({
        type: 'SET_ORCHESTRATOR_CHAT',
        payload: {
          messages: [
            ...nextMessages,
            {
              id: nextMessageId(),
              sender: 'assistant',
              text: result?.content || '',
              toolCalls: result?.toolCalls || [],
              taskCards: result?.taskCards || [],
              isError: /error/i.test(result?.content || '') && !result?.toolCalls?.length,
            },
          ],
          busy: false,
        },
      });
    } catch (err) {
      dispatch({
        type: 'SET_ORCHESTRATOR_CHAT',
        payload: {
          messages: [
            ...nextMessages,
            {
              id: nextMessageId(),
              sender: 'assistant',
              text: err?.message || 'The orchestrator request failed.',
              isError: true,
            },
          ],
          busy: false,
        },
      });
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
  const showNewChat = messages.length > 0 || !recentTasksVisible;

  return (
    <div id="view-agent" className="relative flex h-full min-h-0 flex-col">
      {showNewChat && (
        <button
          type="button"
          onClick={resetChat}
          className="absolute left-3 top-2.5 z-10 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800/70 dark:hover:text-neutral-200"
        >
          <IconPlus size={11} />
          New chat
        </button>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div
            className={`mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 ${
              isEmpty ? 'justify-center' : 'justify-start pb-4'
            }`}
          >
            {isEmpty ? (
              <div className="flex flex-col items-center gap-5 py-6 text-center">
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

        <div className="shrink-0 px-4 pb-3 pt-1">
          <div className="mx-auto w-full max-w-3xl">
            <Composer
              value={input}
              onChange={(value) =>
                dispatch({ type: 'SET_ORCHESTRATOR_CHAT', payload: { input: value } })
              }
              onSubmit={() => send()}
              busy={busy}
              disabled={busy}
              placeholder="Ask the orchestrator to start, find, or summarize work…"
              textareaId="agent-input"
              submitLabel="Send message"
              autoFocus
            >
              <ModelSelector
                variant="inline"
                value={selectedModel}
                onChange={handleModelChange}
              />
            </Composer>
          </div>
        </div>
      </div>

      <div
        className={`grid max-h-[40%] min-h-0 shrink-0 transition-[grid-template-rows,opacity] duration-200 ease-out ${
          recentTasksVisible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!recentTasksVisible}
        {...(!recentTasksVisible ? { inert: '' } : {})}
      >
        <div className="min-h-0 overflow-hidden">
          <RecentTasksList />
        </div>
      </div>
    </div>
  );
}
