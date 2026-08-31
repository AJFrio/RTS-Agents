import React, { useState, useEffect } from 'react';
import Modal from '../components/ui/Modal.jsx';
import { IconClose } from '../components/ui/icons.jsx';
import { useApp } from '../context/AppContext.jsx';

export default function JiraIssueModal({ issue, onClose, api }) {
  const [fullIssue, setFullIssue] = useState(issue);
  const [comments, setComments] = useState([]);

  useEffect(() => {
    if (!issue?.key || !api?.jira?.getIssue) return;
    api.jira
      .getIssue(issue.key)
      .then((res) => res?.issue && setFullIssue(res.issue))
      .catch(console.error);
  }, [issue?.key, api]);

  useEffect(() => {
    if (!issue?.key || !api?.jira?.getIssueComments) return;
    api.jira
      .getIssueComments(issue.key)
      .then((res) => setComments(res?.comments || []))
      .catch(console.error);
  }, [issue?.key, api]);

  if (!issue) return null;

  const f = fullIssue?.fields || issue?.fields || {};
  const summary = f.summary ?? 'Loading...';
  const status = f.status?.name ?? '—';
  const issueType = f.issuetype?.name ?? 'Issue';
  const assignee = f.assignee?.displayName ?? 'Unassigned';
  const priority = f.priority?.name ?? '—';
  const created = f.created ? new Date(f.created).toLocaleString() : '—';
  const updated = f.updated ? new Date(f.updated).toLocaleString() : '—';
  const description = f.description ?? '';

  return (
    <Modal open={!!issue} onClose={onClose} size="lg">
      <div className="flex max-h-[90vh] w-full flex-col">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-light px-4 py-3 dark:border-border-dark">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span id="jira-issue-modal-key" className="technical-font text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">{issue.key}</span>
              <span className="technical-font rounded-full border border-border-light px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:border-border-dark dark:text-neutral-300">{issueType}</span>
              <span className="technical-font rounded-full bg-neutral-400/10 px-2 py-0.5 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400">{status}</span>
            </div>
            <h2 id="jira-issue-modal-title" className="text-[15px] font-semibold leading-snug text-neutral-900 dark:text-neutral-100">
              {summary}
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
        <div id="jira-issue-modal-content" className="flex-1 overflow-y-auto p-4">
          <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">{description || 'No description.'}</div>
          {comments.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2.5 text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">Comments</h3>
              <div className="space-y-2">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-md border border-border-light bg-inset-light p-3 dark:border-border-dark dark:bg-inset-dark">
                    <div className="mb-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">{c.author?.displayName} · {c.updated ? new Date(c.updated).toLocaleString() : ''}</div>
                    <div className="whitespace-pre-wrap text-[13px] text-neutral-700 dark:text-neutral-300">{c.body}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="technical-font flex shrink-0 items-center justify-between border-t border-border-light px-4 py-2.5 text-[10px] dark:border-border-dark">
          <div className="flex gap-4 text-neutral-500 dark:text-neutral-400">
            <span id="jira-issue-modal-assignee">Assignee: {assignee}</span>
            <span id="jira-issue-modal-priority">Priority: {priority}</span>
          </div>
          <div className="flex gap-4 text-neutral-500 dark:text-neutral-400">
            <span id="jira-issue-modal-created">Created: {created}</span>
            <span id="jira-issue-modal-updated">Updated: {updated}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
