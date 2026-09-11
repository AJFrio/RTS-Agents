/**
 * Format count with leading zeros (tactical style)
 */
export function formatCount(num) {
  return String(num ?? 0).padStart(2, '0');
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(provider) {
  if (provider === 'antigravity') return 'Antigravity CLI';
  if (provider === 'claude-cloud') return 'Claude';
  if (provider === 'claude-cli') return 'Claude CLI';
  if (provider === 'opencode') return 'OpenCode';
  return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : '';
}

/**
 * Relative time in the Recent Tasks style: now, 5m, 3h, 2d, then "Sep 11".
 */
export function relativeTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function getStatusStyle(status) {
  const styles = {
    running: { bg: 'bg-yellow-500/20', text: 'text-yellow-700 dark:text-yellow-300' },
    completed: { bg: 'bg-primary', text: 'text-black' },
    pending: { bg: 'bg-slate-200 dark:bg-slate-700', text: 'text-slate-700 dark:text-slate-200' },
    failed: { bg: 'bg-red-500/20', text: 'text-red-700 dark:text-red-300' },
    stopped: { bg: 'bg-slate-200 dark:bg-slate-700', text: 'text-slate-700 dark:text-slate-200' },
  };
  const key = status === 'stopped' ? 'failed' : status;
  return styles[key] || styles.pending;
}

export function getProviderDot(provider) {
  const map = {
    antigravity: 'bg-emerald-500',
    jules: 'bg-primary',
    cursor: 'bg-blue-500',
    codex: 'bg-cyan-500',
    'claude-cloud': 'bg-amber-500',
    'claude-cli': 'bg-orange-500',
    opencode: 'bg-violet-500',
  };
  return map[provider] || 'bg-primary';
}

export function getProviderText(provider) {
  const map = {
    antigravity: 'text-emerald-600 dark:text-emerald-300',
    jules: 'text-primary',
    cursor: 'text-blue-600 dark:text-blue-300',
    codex: 'text-cyan-600 dark:text-cyan-300',
    'claude-cloud': 'text-amber-600 dark:text-amber-300',
    'claude-cli': 'text-orange-600 dark:text-orange-300',
    opencode: 'text-violet-600 dark:text-violet-300',
  };
  return map[provider] || 'text-slate-600 dark:text-slate-300';
}

export function extractRepoName(url) {
  if (!url) return '';
  const match = String(url).match(/github\.com\/([^/]+[/][^/]+)/);
  return match ? match[1] : url;
}

export function getStatusLabel(status) {
  const map = {
    running: 'RUNNING',
    completed: 'COMPLETE',
    pending: 'PENDING',
    failed: 'FAILED',
    stopped: 'STOPPED',
  };
  return map[status] || status?.toUpperCase() || 'UNKNOWN';
}
