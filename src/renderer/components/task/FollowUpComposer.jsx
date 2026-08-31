import React, { useEffect, useRef, useState } from 'react';

/**
 * Composer for sending a follow-up turn into an existing agent session.
 *
 * Rendered only when the main process reports the task can accept one. For
 * local CLI providers that depends on a live adapter process, which is lost
 * on app restart, adapter crash, or idle reaping - so availability is asked
 * per task rather than inferred from the provider.
 */
export default function FollowUpComposer({ agent, api, onSent }) {
  const [canSend, setCanSend] = useState(false);
  const [checking, setChecking] = useState(true);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const textareaRef = useRef(null);

  const provider = agent?.provider;
  const rawId = agent?.rawId || agent?.id;
  // Sessions discovered on disk are identified by their transcript path;
  // the main process derives the resumable ACP session id from it.
  const filePath = agent?.filePath || null;

  useEffect(() => {
    let cancelled = false;
    if (!api?.canSendMessage || !provider || !rawId) {
      setCanSend(false);
      setChecking(false);
      return undefined;
    }

    setChecking(true);
    api
      .canSendMessage(provider, rawId, filePath)
      .then((result) => {
        if (!cancelled) setCanSend(Boolean(result?.canSend));
      })
      .catch(() => {
        if (!cancelled) setCanSend(false);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api, provider, rawId, filePath]);

  const handleSend = async () => {
    const text = value.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);
    try {
      const result = await api.sendMessage(provider, rawId, text, filePath);
      if (result && result.success === false) {
        throw new Error(result.error || 'Failed to send message');
      }
      setValue('');
      onSent?.();
    } catch (err) {
      setError(err?.message || 'Failed to send message');
      // The session may have died with the failure; re-check availability so
      // the composer disappears instead of offering a send that cannot work.
      if (api?.canSendMessage) {
        api
          .canSendMessage(provider, rawId, filePath)
          .then((result) => setCanSend(Boolean(result?.canSend)))
          .catch(() => setCanSend(false));
      }
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  if (checking || !canSend) return null;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2 dark:border-border-dark dark:bg-card-dark">
      <label htmlFor="follow-up-input" className="sr-only">
        Send a follow-up message to this agent
      </label>
      <textarea
        id="follow-up-input"
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
        disabled={sending}
        placeholder={sending ? 'Sending...' : 'Reply to this agent'}
        className="w-full resize-none border-0 bg-transparent px-2 py-1 text-sm text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-0 disabled:opacity-50 dark:text-slate-200"
      />
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-[10px] text-slate-500 dark:text-slate-400">
          Enter to send, Shift+Enter for a new line
        </span>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !value.trim()}
          className="flex items-center gap-1 rounded-md bg-primary/15 px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-200"
        >
          <span className="material-symbols-outlined text-sm">
            {sending ? 'progress_activity' : 'send'}
          </span>
          {sending ? 'Sending' : 'Send'}
        </button>
      </div>
      {error && (
        <p role="alert" className="px-2 pb-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
