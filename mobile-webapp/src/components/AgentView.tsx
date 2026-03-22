/**
 * Agent View Component
 *
 * Chat interface for the orchestrator agent
 */

import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../store/AppContext';

interface Message {
  id: number;
  sender: 'user' | 'assistant';
  role?: string;
  text: string;
  content?: string;
  isError?: boolean;
}

export default function AgentView() {
  const { state, agentOrchestratorService } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const selectedModel = state.settings?.selectedModel || 'openrouter/openai/gpt-4o';
  const [thinking, setThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinking]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || thinking) return;

    const newMessage: Message = {
      id: Date.now(),
      sender: 'user', // UI uses 'sender' instead of 'role'
      role: 'user', // Backend expects 'role'
      text: inputValue,
      content: inputValue // Backend expects 'content'
    };

    const newMessages = [...messages, newMessage];
    setMessages(newMessages);
    setInputValue('');
    setThinking(true);

    try {
      // Convert UI messages to backend format
      const history = newMessages.map(m => ({
        role: m.role || (m.sender === 'user' ? 'user' : 'assistant'),
        content: m.content || m.text
      }));

      const response: any = await agentOrchestratorService.chat(history, selectedModel);

      if (response) {
        const assistantMsg: Message = {
          id: Date.now() + 1,
          sender: 'assistant',
          role: 'assistant',
          text: response.content,
          content: response.content
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (err: any) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'assistant',
        text: `Error: ${err.message}`,
        isError: true
      }]);
    } finally {
      setThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div id="view-agent" className="view-content h-full flex flex-col relative pb-20"> {/* pb-20 to account for bottom nav */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <span className="material-symbols-outlined text-6xl mb-4 opacity-50">smart_toy</span>
                <p className="text-lg font-medium">How can I help you today?</p>
                <p className="text-xs mt-2 opacity-70">Model: {selectedModel}</p>
            </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] text-sm rounded-2xl px-4 py-3 shadow-sm ${
                msg.sender === 'user'
                  ? 'bg-primary text-black rounded-br-none'
                  : 'bg-white dark:bg-card-dark text-slate-800 dark:text-slate-200 rounded-bl-none'
              } ${msg.isError ? 'text-red-500' : ''}`}
            >
              <div className="whitespace-pre-wrap">{msg.text}</div>
            </div>
          </div>
        ))}
        {thinking && (
           <div className="flex justify-start">
             <div className="bg-white dark:bg-card-dark text-slate-500 text-sm px-4 py-3 rounded-2xl rounded-bl-none flex items-center gap-2 shadow-sm">
               <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
               Thinking...
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-transparent">
        <div className="w-full max-w-4xl mx-auto">
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-[2rem] p-2 flex flex-col gap-1 shadow-md transition-colors duration-200">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={thinking ? "Agent is working..." : "Ask Agent"}
              disabled={thinking}
              rows={1}
              className="w-full !bg-transparent !border-0 !ring-0 !shadow-none resize-none text-slate-800 dark:text-slate-200 placeholder-slate-500 text-sm min-h-[40px] px-4 py-2 focus:!ring-0 focus:outline-none disabled:opacity-50"
            />
            <div className="flex items-center justify-between mt-1 px-2 pb-1">
              <div className="flex items-center gap-2">
                <button
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors"
                  title="Add attachment"
                >
                  <span className="material-symbols-outlined text-xl">add_circle</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={`p-2 rounded-full transition-colors ${
                      inputValue.trim()
                      ? 'bg-primary text-black hover:opacity-90 shadow-sm'
                      : 'text-slate-400 bg-slate-100 dark:bg-white/5'
                  }`}
                  title={inputValue.trim() ? 'Send' : 'Start voice input'}
                  onClick={() => {
                    if (inputValue.trim()) handleSendMessage();
                  }}
                  disabled={thinking}
                >
                  <span className="material-symbols-outlined text-xl">
                    {inputValue.trim() ? 'send' : 'mic'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
