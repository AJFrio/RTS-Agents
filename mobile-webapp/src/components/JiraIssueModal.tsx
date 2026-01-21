/**
 * Jira Issue Modal
 *
 * Full-screen modal for viewing Jira issue details.
 */

import { useEffect, useState } from 'react';
import type { JiraIssue } from '../services/jira-service';
import { jiraService } from '../services/jira-service';

function formatDate(date: string | undefined): string {
  if (!date) return '--';
  try {
    return new Date(date).toLocaleString();
  } catch {
    return date;
  }
}

function extractAdfText(node: unknown): string {
  // Jira Cloud description uses Atlassian Document Format (ADF).
  // This extracts text nodes into a readable string.
  if (!node || typeof node !== 'object') return '';
  const anyNode = node as Record<string, unknown>;

  if (typeof anyNode.text === 'string') return anyNode.text;

  const content = anyNode.content;
  if (Array.isArray(content)) {
    return content.map(extractAdfText).filter(Boolean).join('');
  }

  return '';
}

export default function JiraIssueModal({
  issueKey,
  isOpen,
  onClose,
}: {
  issueKey: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState<JiraIssue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !issueKey) return;

    let cancelled = false;
    setLoading(true);
    setIssue(null);
    setError(null);

    jiraService
      .getIssue(issueKey)
      .then((data) => {
        if (!cancelled) setIssue(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load issue');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, issueKey]);

  if (!isOpen) return null;

  const fields = issue?.fields;
  const descriptionText = fields?.description ? extractAdfText(fields.description) : '';
  const assignee = fields?.assignee?.displayName || 'Unassigned';

  return (
    <div className="fixed inset-0 z-50 bg-background-dark">
      <header className="h-14 flex items-center justify-between px-4 border-b border-border-dark bg-sidebar-dark safe-top">
        <button
          onClick={onClose}
          className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="flex items-center gap-2">
          {issueKey && (
            <span className="font-display text-[10px] text-slate-400 uppercase tracking-wider">
              {issueKey}
            </span>
          )}
        </div>
      </header>

      <div className="h-[calc(100vh-56px)] overflow-y-auto safe-bottom">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <span className="material-symbols-outlined text-primary text-4xl animate-spin">sync</span>
            <p className="mt-4 font-display text-xs text-slate-500 uppercase tracking-wider">Loading ticket...</p>
          </div>
        ) : error ? (
          <div className="p-4">
            <div className="bg-red-900/20 border border-red-500/50 p-4">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          </div>
        ) : issue ? (
          <div className="p-4 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary">
                  {fields?.issuetype?.name || 'Issue'}
                </span>
                <span className="px-2 py-0.5 font-display text-[10px] font-bold bg-slate-700 text-slate-200">
                  {fields?.status?.name || 'Unknown'}
                </span>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                {fields?.summary || issue.key}
              </h2>

              <div className="space-y-1 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">person</span>
                  <span>Assignee: {assignee}</span>
                </div>
                {fields?.priority?.name && (
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">flag</span>
                    <span>Priority: {fields.priority.name}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">schedule</span>
                  <span>Created: {formatDate(fields?.created)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">update</span>
                  <span>Updated: {formatDate(fields?.updated)}</span>
                </div>
              </div>
            </div>

            {descriptionText && (
              <div className="bg-card-dark border border-border-dark p-4">
                <h3 className="font-display text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Description
                </h3>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{descriptionText}</p>
              </div>
            )}

            {Array.isArray(fields?.labels) && fields.labels.length > 0 && (
              <div className="bg-card-dark border border-border-dark p-4">
                <h3 className="font-display text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Labels
                </h3>
                <div className="flex flex-wrap gap-2">
                  {fields.labels.map((label) => (
                    <span
                      key={label}
                      className="px-2 py-1 text-[10px] font-display uppercase tracking-wider bg-slate-800 text-slate-300 border border-border-dark"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64">
            <span className="material-symbols-outlined text-slate-500 text-4xl">info</span>
            <p className="mt-2 text-slate-500 text-sm">No ticket selected</p>
          </div>
        )}
      </div>
    </div>
  );
}

