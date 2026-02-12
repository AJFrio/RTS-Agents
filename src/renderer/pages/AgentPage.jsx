import React, { useState, useRef, useEffect } from 'react';

const MOCK_MESSAGES = [
  { id: 1, sender: 'agent', text: 'Hello! How can I assist you today?' },
  { id: 2, sender: 'user', text: 'I need help with a new project.' },
  { id: 3, sender: 'agent', text: 'Sure, tell me more about it.' },
];

export default function AgentPage() {
  const [messages, setMessages] = useState(MOCK_MESSAGES);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const newMessage = {
      id: Date.now(),
      sender: 'user',
      text: inputValue,
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputValue('');
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
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] text-sm ${
                msg.sender === 'user'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl rounded-br-none px-4 py-3 shadow-sm'
                  : 'text-slate-800 dark:text-slate-200 pl-2'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4">
        <div className="w-full max-w-4xl mx-auto">
          <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-[2rem] p-2 flex flex-col gap-1 shadow-sm transition-colors duration-200">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Agent"
              rows={1}
              className="w-full bg-transparent !border-0 !ring-0 !shadow-none resize-none text-slate-800 dark:text-slate-200 placeholder-slate-500 text-sm min-h-[24px] px-0 focus:!ring-0 focus:outline-none"
            />
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-2">
                <button
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"
                  title="Add attachment"
                >
                  <span className="material-symbols-outlined text-xl">add</span>
                </button>
                <button className="flex items-center gap-1 px-3 py-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-sm font-medium">
                  <span className="material-symbols-outlined text-lg">construction</span>
                  <span>Tools</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1 px-3 py-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-sm font-medium">
                  <span>Thinking</span>
                  <span className="material-symbols-outlined text-lg">expand_more</span>
                </button>
                <button
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"
                  title={inputValue.trim() ? 'Send' : 'Start voice input'}
                  onClick={() => {
                    if (inputValue.trim()) handleSendMessage();
                  }}
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
