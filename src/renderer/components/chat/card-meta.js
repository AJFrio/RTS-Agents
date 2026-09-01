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

export function shortRepo(repository) {
  if (!repository) return null;
  const text = String(repository);
  const base = text.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  return base || text;
}

export function truncate(text, max = 140) {
  if (!text) return '';
  const value = String(text).replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
