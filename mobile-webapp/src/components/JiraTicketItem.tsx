import React from 'react';
import type { JiraIssue } from '../services/jira-service';

export function getAssignee(issue: JiraIssue): string {
  return issue.fields?.assignee?.displayName || 'Unassigned';
}

interface JiraTicketItemProps {
  issue: JiraIssue;
  onOpen: (issue: JiraIssue) => void;
}

const JiraTicketItem = React.memo(({ issue, onOpen }: JiraTicketItemProps) => {
  const handleOpen = () => onOpen(issue);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleOpen();
        }
      }}
      className="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-black/20 active:scale-[0.99] transition cursor-pointer"
      style={{ pointerEvents: 'auto', WebkitTapHighlightColor: 'transparent' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-display text-[10px] text-slate-500 uppercase tracking-wider">
            {issue.key}
          </div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">
            {issue.fields?.summary || '(no summary)'}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
            <span>Assignee: {getAssignee(issue)}</span>
            {issue.fields?.status?.name && (
              <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md text-xs">
                {issue.fields.status.name}
              </span>
            )}
          </div>
        </div>
        <span className="material-symbols-outlined text-slate-500 text-sm mt-1">
          chevron_right
        </span>
      </div>
    </div>
  );
});

JiraTicketItem.displayName = 'JiraTicketItem';

export default JiraTicketItem;
