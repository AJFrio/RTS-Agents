import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';

export default function AgentPage() {
  const { api, state } = useApp();
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const selectedModel = state.settings?.selectedModel || 'openrouter/openai/gpt-4o';
  const [thinking, setThinking] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinking]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || thinking) return;

    const newMessage = {
      id: Date.now(),
      sender: 'user', // UI uses 'sender' instead of 'role'
      role: 'user', // Backend expects 'role'
      text: inputValue,
      content: inputValue, // Backend expects 'content'
    };

    const newMessages = [...messages, newMessage];
    setMessages(newMessages);
    setInputValue('');
    setThinking(true);

    try {
      // Convert UI messages to backend format
      const history = newMessages.map((m) => ({
        role: m.role || (m.sender === 'user' ? 'user' : 'assistant'),
        content: m.content || m.text,
      }));

      const response = await api.orchestratorChat(history, selectedModel);

      if (response) {
        const assistantMsg = {
          id: Date.now() + 1,
          sender: 'assistant',
          role: 'assistant',
          text: response.content,
          content: response.content,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'assistant',
          text: `Error: ${err.message}`,
          isError: true,
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div id="view-agent" className="view-content h-full flex flex-col relative">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !thinking && (
          <div className="mx-auto flex h-full max-w-3xl flex-col justify-center">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-border-dark dark:bg-card-dark">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Ask the orchestrator
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Use this for cross-provider status checks, task planning, and next-action
                    summaries.
                  </p>
                </div>
                <span className="rounded-lg bg-primary/15 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200">
                  {selectedModel}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {['Summarize active work', 'Find stuck tasks', 'Draft a new agent task'].map(
                  (suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setInputValue(suggestion)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:border-primary hover:bg-primary/5 dark:border-border-dark dark:text-slate-200 dark:hover:bg-primary/10"
                    >
                      {suggestion}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] text-sm ${
                msg.sender === 'user'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl rounded-br-none px-4 py-3 shadow-sm'
                  : 'text-slate-800 dark:text-slate-200 pl-2 whitespace-pre-wrap'
              } ${msg.isError ? 'text-red-500' : ''}`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="text-slate-400 text-sm pl-2 italic flex items-center gap-2">
              <span className="material-symbols-outlined text-sm animate-spin">
                progress_activity
              </span>
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4">
        <div className="w-full max-w-4xl mx-auto">
          <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-[2rem] p-2 flex flex-col gap-1 shadow-sm transition-colors duration-200">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={thinking ? 'Agent is working...' : 'Ask Agent'}
              disabled={thinking}
              rows={1}
              className="w-full !bg-transparent !border-0 !ring-0 !shadow-none resize-none text-slate-800 dark:text-slate-200 placeholder-slate-500 text-sm min-h-[24px] px-0 focus:!ring-0 focus:outline-none disabled:opacity-50"
            />
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-2">
                <button
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"
                  title="Add attachment"
                  disabled
                >
                  <span className="material-symbols-outlined text-xl">add</span>
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">{selectedModel}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"
                  title="Send"
                  onClick={() => {
                    if (inputValue.trim()) handleSendMessage();
                  }}
                  disabled={thinking || !inputValue.trim()}
                >
                  <span className="material-symbols-outlined text-xl">send</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
