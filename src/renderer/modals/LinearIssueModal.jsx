import React, { useState, useEffect } from 'react';
import Modal from '../components/ui/Modal.jsx';
import { IconClose } from '../components/ui/icons.jsx';
import { relativeTime } from '../utils/format.js';

export default function LinearIssueModal({ issue, onClose, api }) {
  const [fullIssue, setFullIssue] = useState(issue);
  const [error, setError] = useState(null);

  useEffect(() => {
    setFullIssue(issue);
    setError(null);
    if (!issue?.id || !api?.linear?.getIssue) return;
    api.linear
      .getIssue(issue.id)
      .then((res) => {
        if (res?.success && res.issue) setFullIssue(res.issue);
        else if (res && !res.success) setError(res.error || 'Failed to load issue');
      })
      .catch(console.error);
  }, [issue?.id, api]);

  if (!issue) return null;

  const f = fullIssue || issue;
  const title = f.title ?? 'Loading...';
  const state = f.state ?? '—';
  const assignee = f.assignee ?? 'Unassigned';
  const priority = f.priority != null ? String(f.priority) : '—';
  const updated = f.updatedAt ? relativeTime(f.updatedAt) : '—';
  const description = f.description ?? '';

  return (
    <Modal open={!!issue} onClose={onClose} size="lg">
      <div className="flex max-h-[90vh] w-full flex-col">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-light px-4 py-3 dark:border-border-dark">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span
                id="linear-issue-modal-key"
                className="technical-font text-[11px] font-semibold text-neutral-700 dark:text-neutral-300"
              >
                {issue.key}
              </span>
              <span className="technical-font rounded-full bg-neutral-400/10 px-2 py-0.5 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400">
                {state}
              </span>
            </div>
            <h2
              id="linear-issue-modal-title"
              className="text-[15px] font-semibold leading-snug text-neutral-900 dark:text-neutral-100"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close issue details"
            className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <IconClose size={16} />
          </button>
        </div>
        <div id="linear-issue-modal-content" className="flex-1 overflow-y-auto p-4">
          {error ? (
            <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">
              {error}
            </div>
          ) : (
            <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">
              {description || 'No description.'}
            </div>
          )}
        </div>
        <div className="technical-font flex shrink-0 items-center justify-between border-t border-border-light px-4 py-2.5 text-[10px] dark:border-border-dark">
          <div className="flex gap-4 text-neutral-500 dark:text-neutral-400">
            <span id="linear-issue-modal-assignee">Assignee: {assignee}</span>
            <span id="linear-issue-modal-priority">Priority: {priority}</span>
          </div>
          <div className="flex gap-4 text-neutral-500 dark:text-neutral-400">
            <span id="linear-issue-modal-updated">Updated: {updated}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
