import React, { useState, useEffect } from 'react';
import Modal from '../components/ui/Modal.jsx';
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
    <Modal open={!!issue} onClose={onClose}>
      <div className="bg-sidebar-dark border border-border-dark w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="p-6 border-b border-border-dark flex justify-between items-start bg-black/40">
          <div className="flex-1 mr-8">
            <div className="flex items-center gap-3 mb-2">
              <span id="jira-issue-modal-key" className="text-primary technical-font text-sm font-bold">{issue.key}</span>
              <span className="px-2 py-0.5 text-[10px] technical-font font-bold bg-primary/10 text-primary border border-primary/30">{issueType}</span>
              <span className="px-2 py-0.5 text-[10px] technical-font font-bold bg-slate-700 text-slate-200">{status}</span>
            </div>
            <h2 id="jira-issue-modal-title" className="text-xl font-display font-bold text-white tracking-tight leading-tight">
              {summary}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-primary transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div id="jira-issue-modal-content" className="flex-1 overflow-y-auto p-8 bg-background-dark">
          <div className="prose prose-invert prose-sm max-w-none text-slate-300 whitespace-pre-wrap">{description || 'No description.'}</div>
          {comments.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-bold text-white mb-4">Comments</h3>
              <div className="space-y-4">
                {comments.map((c) => (
                  <div key={c.id} className="p-4 bg-[#1A1A1A] border border-border-dark rounded-lg">
                    <div className="text-xs text-slate-500 mb-2">{c.author?.displayName} · {c.updated ? new Date(c.updated).toLocaleString() : ''}</div>
                    <div className="text-sm text-slate-300 whitespace-pre-wrap">{c.body}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="p-4 bg-black border-t border-border-dark flex justify-between items-center text-[10px] technical-font">
          <div className="flex gap-4 text-slate-600">
            <span id="jira-issue-modal-assignee">Assignee: {assignee}</span>
            <span id="jira-issue-modal-priority">Priority: {priority}</span>
          </div>
          <div className="flex gap-4 text-slate-600">
            <span id="jira-issue-modal-created">Created: {created}</span>
            <span id="jira-issue-modal-updated">Updated: {updated}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
