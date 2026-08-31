import React, { useEffect, useRef } from 'react';
import { IconAttach, IconSend, IconClose } from '../ui/icons.jsx';

/**
 * Cursor-style chat composer (DESIGN.md §5): a borderless textarea inside a
 * hairline card shell, with a bottom control row for inline pickers
 * (harness / model / repo / device / branch) and attach + submit actions.
 * Image attachments render as inline thumbnails.
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
    <div
      className={`rounded-lg border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark focus-within:border-border-strong-light dark:focus-within:border-border-strong-dark transition-colors duration-150 ${className}`}
      onPaste={onPaste}
    >
      {attachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="group relative h-12 w-12 overflow-hidden rounded-sm border border-border-light dark:border-border-dark"
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
        className="block w-full resize-none border-0 bg-transparent px-4 pt-3 font-sans text-sm leading-[22px] text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-0 dark:text-neutral-100 dark:placeholder-neutral-500"
      />

      <div className="flex items-end justify-between gap-2 px-2 pb-2 pt-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1">{children}</div>
        <div className="flex shrink-0 items-center gap-1">
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
                className="rounded-sm p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <IconAttach size={15} />
              </button>
            </>
          )}
          <button
            type="button"
            id={submitId}
            onClick={() => canSubmit && onSubmit?.()}
            disabled={!canSubmit}
            aria-label={submitLabel}
            className="rounded-sm p-1.5 transition-all disabled:text-neutral-300 dark:disabled:text-neutral-600 enabled:bg-neutral-900 enabled:text-white enabled:hover:opacity-90 enabled:active:scale-95 dark:enabled:bg-neutral-100 dark:enabled:text-neutral-900"
          >
            {busy ? (
              <IconSend size={15} className="animate-pulse" />
            ) : (
              <IconSend size={15} />
            )}
          </button>
        </div>
      </div>

      {footerNote && (
        <div className="border-t border-border-light px-4 py-1.5 text-[11px] text-neutral-400 dark:border-border-dark dark:text-neutral-500">
          {footerNote}
        </div>
      )}
    </div>
  );
}
