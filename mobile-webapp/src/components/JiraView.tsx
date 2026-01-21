/**
 * Jira View (placeholder)
 *
 * Displays Jira tickets grouped by sprint (implementation to follow).
 */
export default function JiraView() {
  return (
    <div className="p-4">
      <div className="bg-card-dark border border-border-dark p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-primary text-lg">assignment</span>
          <h3 className="font-display text-sm font-bold uppercase tracking-tight">Jira</h3>
        </div>
        <p className="text-xs text-slate-500">
          Configure Jira in Settings to load your backlog.
        </p>
      </div>
    </div>
  );
}

