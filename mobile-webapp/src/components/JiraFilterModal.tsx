/**
 * Jira Filter Modal
 *
 * Modal for filtering Jira tickets by assignee and status.
 */

interface JiraFilterModalProps {
  isOpen: boolean;
  availableAssignees: string[];
  availableStatuses: string[];
  selectedAssignee: string | null;
  selectedStatus: string | null;
  showAllTickets: boolean;
  onFilterChange: (assignee: string | null, status: string | null, showAll: boolean) => void;
  onClearFilters: () => void;
  onClose: () => void;
}

export default function JiraFilterModal({
  isOpen,
  availableAssignees,
  availableStatuses,
  selectedAssignee,
  selectedStatus,
  showAllTickets,
  onFilterChange,
  onClearFilters,
  onClose,
}: JiraFilterModalProps) {
  if (!isOpen) return null;

  const handleAssigneeChange = (value: string) => {
    const assignee = value === '' ? null : value;
    onFilterChange(assignee, selectedStatus, showAllTickets);
  };

  const handleStatusChange = (value: string) => {
    const status = value === '' ? null : value;
    onFilterChange(selectedAssignee, status, showAllTickets);
  };

  const handleShowAllChange = (value: string) => {
    const showAll = value === 'all';
    onFilterChange(selectedAssignee, selectedStatus, showAll);
  };

  const handleClear = () => {
    onClearFilters();
  };

  const hasActiveFilters = selectedAssignee !== null || selectedStatus !== null || showAllTickets;

  return (
    <div className="fixed inset-0 z-50 bg-black/90">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-border-dark bg-sidebar-dark safe-top">
        <button
          onClick={onClose}
          className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>

        <h2 className="font-display text-sm font-bold uppercase tracking-tight">Filter Tickets</h2>

        {hasActiveFilters && (
          <button
            onClick={handleClear}
            className="text-primary font-display text-[10px] font-bold uppercase tracking-wider hover:opacity-80 transition-opacity"
          >
            Clear
          </button>
        )}
      </header>

      {/* Content */}
      <div className="h-[calc(100vh-56px)] overflow-y-auto p-4 space-y-6 safe-bottom">
        {/* Show Tickets Filter */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary text-sm">visibility</span>
            <h3 className="font-display text-xs font-bold text-slate-300 uppercase tracking-wider">Show Tickets</h3>
          </div>

          <select
            value={showAllTickets ? 'all' : 'active'}
            onChange={(e) => handleShowAllChange(e.target.value)}
            className="w-full bg-black border border-border-dark text-sm py-3 px-3 text-slate-300 font-display text-xs focus:outline-none focus:border-primary"
          >
            <option value="active">Active Only</option>
            <option value="all">All Tickets (Including Closed)</option>
          </select>
        </div>

        {/* Assignee Filter */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary text-sm">person</span>
            <h3 className="font-display text-xs font-bold text-slate-300 uppercase tracking-wider">Assignee</h3>
          </div>

          <select
            value={selectedAssignee || ''}
            onChange={(e) => handleAssigneeChange(e.target.value)}
            className="w-full bg-black border border-border-dark text-sm py-3 px-3 text-slate-300 font-display text-xs focus:outline-none focus:border-primary"
          >
            <option value="">All Assignees</option>
            {availableAssignees.map((assignee) => (
              <option key={assignee} value={assignee}>
                {assignee}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary text-sm">flag</span>
            <h3 className="font-display text-xs font-bold text-slate-300 uppercase tracking-wider">Status</h3>
          </div>

          <select
            value={selectedStatus || ''}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="w-full bg-black border border-border-dark text-sm py-3 px-3 text-slate-300 font-display text-xs focus:outline-none focus:border-primary"
          >
            <option value="">All Statuses</option>
            {availableStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {/* Active Filters Summary */}
        {hasActiveFilters && (
          <div className="bg-card-dark border border-border-dark p-4">
            <h3 className="font-display text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Active Filters
            </h3>
            <div className="space-y-2">
              {showAllTickets && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Show:</span>
                  <span className="text-xs text-white font-semibold">All Tickets</span>
                </div>
              )}
              {selectedAssignee && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Assignee:</span>
                  <span className="text-xs text-white font-semibold">{selectedAssignee}</span>
                </div>
              )}
              {selectedStatus && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Status:</span>
                  <span className="text-xs text-white font-semibold">{selectedStatus}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Apply Button */}
        <button
          onClick={onClose}
          className="w-full bg-primary text-black px-4 py-3 font-display text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
        >
          Apply Filters
        </button>
      </div>
    </div>
  );
}
