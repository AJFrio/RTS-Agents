import React from 'react';

export default function ConversationList({ conversation, renderMessage }) {
  if (!conversation?.length) return null;

  return (
    <div className="space-y-3">
      {conversation.map((msg, i) => (
        <div
          key={msg.id ?? i}
          className={`p-3 rounded-lg ${msg.isUser ? 'bg-primary/10 dark:bg-primary/20 border-l-2 border-primary' : 'bg-slate-100 dark:bg-slate-800'}`}
        >
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
            {msg.isUser ? 'You' : 'Agent'}
          </span>
          {renderMessage ? renderMessage(msg.text) : msg.text}
        </div>
      ))}
    </div>
  );
}
