/**
 * Format count with leading zeros (tactical style)
 */
export function formatCount(num) {
  return String(num ?? 0).padStart(2, '0');
}

/**
 * Get status label for display
 */
export function getTacticalStatus(status) {
  const statusMap = {
    running: 'RUNNING',
    completed: 'OP-COMPLETE',
    pending: 'PENDING_QUEUE',
    failed: 'FAILED',
    stopped: 'STOPPED',
  };
  return statusMap[status] || status?.toUpperCase() || 'UNKNOWN';
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(provider) {
  if (provider === 'claude-cloud') return 'Claude';
  if (provider === 'claude-cli') return 'Claude CLI';
  return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : '';
}

/**
 * Format time ago (1H_AGO, 2D_AGO, etc.)
 */
export function formatTimeAgo(date) {
  if (!date) return '';
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return 'NOW';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}M_AGO`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}H_AGO`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}D_AGO`;
  return then.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }).replace(/\//g, '/');
}

export function getStatusStyle(status) {
  const styles = {
    running: { bg: 'bg-yellow-500/20', text: 'text-yellow-500' },
    completed: { bg: 'bg-primary', text: 'text-black' },
    pending: { bg: 'bg-slate-700', text: 'text-slate-400' },
    failed: { bg: 'bg-red-500/20', text: 'text-red-500' },
    stopped: { bg: 'bg-slate-700', text: 'text-slate-400' },
  };
  const key = status === 'stopped' ? 'failed' : status;
  return styles[key] || styles.pending;
}

export function getProviderDot(provider) {
  const map = {
    jules: 'bg-primary',
    cursor: 'bg-blue-500',
    codex: 'bg-cyan-500',
    'claude-cloud': 'bg-amber-500',
    gemini: 'bg-emerald-500',
    'claude-cli': 'bg-orange-500',
  };
  return map[provider] || 'bg-primary';
}

export function extractRepoName(url) {
  if (!url) return '';
  const match = String(url).match(/github\.com\/([^/]+[/][^/]+)/);
  return match ? match[1] : url;
}

export function getStatusLabel(status) {
  const map = { running: 'RUNNING', completed: 'COMPLETE', pending: 'PENDING', failed: 'FAILED', stopped: 'STOPPED' };
  return map[status] || status?.toUpperCase() || 'UNKNOWN';
}
