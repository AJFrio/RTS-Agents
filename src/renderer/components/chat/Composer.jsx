import React, { useEffect, useRef } from 'react';
import { IconSend, IconClose, IconPlus } from '../ui/icons.jsx';

/**
 * Cursor-style chat composer (DESIGN.md §5): a rounded-2xl card with a
 * borderless textarea, a circular + (attach) on the left, inline controls
 * as text+chevron, and a circular send on the right.
 * Reused by Agent, New Task, and task follow-ups.
 */
export default function Composer({
  value,
  onChange,
  onSubmit,
  placeholder = 'Ask the orchestrator…',
  disabled = false,
  busy = false,
  submitLabel = 'Send',
  attachments = [],
  onRemoveAttachment,
  onFiles,
  onPaste,
  children,
  textareaId,
  textareaRef,
  minRows = 1,
  maxRows = 8,
  submitOnEnter = true,
  autoFocus = false,
  className = '',
  footerNote,
  submitId,
}) {
  const internalRef = useRef(null);
  const fileInputRef = useRef(null);
  const ref = textareaRef || internalRef;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 22;
    const min = lineHeight * minRows;
    const max = lineHeight * maxRows;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, min), max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [value, ref, minRows, maxRows]);

  const canSubmit = !disabled && !busy && typeof value === 'string' && value.trim().length > 0;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && submitOnEnter && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (canSubmit) onSubmit?.();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSubmit) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <div className={className}>
      <div
        className="rounded-2xl border border-border-light bg-card-light transition-colors duration-150 focus-within:border-border-strong-light dark:border-neutral-700 dark:bg-card-dark dark:focus-within:border-neutral-500"
        onPaste={onPaste}
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="group relative h-12 w-12 overflow-hidden rounded-md border border-border-light dark:border-border-dark"
              >
                <img
                  src={att.dataUrl}
                  alt={att.name || 'Attachment'}
                  className="h-full w-full object-cover"
                />
                {onRemoveAttachment && (
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(att.id)}
                    aria-label="Remove attachment"
                    className="absolute inset-0 hidden items-center justify-center bg-black/60 group-hover:flex"
                  >
                    <IconClose size={12} className="text-white" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <textarea
          id={textareaId}
          ref={ref}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={minRows}
          className="block w-full resize-none border-0 bg-transparent px-4 pt-3.5 font-sans text-[14px] leading-[22px] text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-0 dark:text-neutral-100 dark:placeholder-neutral-500"
        />

        <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-2">
          <div className="flex min-w-0 flex-wrap items-center gap-0.5">
            {onFiles && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    onFiles(Array.from(e.target.files || []));
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach images"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-light text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                >
                  <IconPlus size={14} />
                </button>
              </>
            )}
            {!onFiles && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-light text-neutral-400 dark:border-neutral-600 dark:text-neutral-500" aria-hidden="true">
                <IconPlus size={14} />
              </span>
            )}
            <div className="flex min-w-0 flex-wrap items-center gap-0.5">{children}</div>
          </div>
          <button
            type="button"
            id={submitId}
            onClick={() => canSubmit && onSubmit?.()}
            disabled={!canSubmit}
            aria-label={submitLabel}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-opacity ${
              canSubmit
                ? 'bg-neutral-900 text-white hover:opacity-90 active:scale-95 dark:bg-white dark:text-neutral-900'
                : 'bg-neutral-200 text-neutral-400 dark:bg-neutral-700 dark:text-neutral-500'
            }`}
          >
            {busy ? (
              <IconSend size={14} className="animate-pulse" />
            ) : (
              <IconSend size={14} />
            )}
          </button>
        </div>
      </div>

      {footerNote && (
        <div className="px-1 pt-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
          {footerNote}
        </div>
      )}
    </div>
  );
}
