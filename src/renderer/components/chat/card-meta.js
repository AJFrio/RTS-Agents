export { relativeTime } from '../../utils/format.js';

export function shortRepo(repository) {
  if (!repository) return null;
  const text = String(repository);
  const base = text
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .pop();
  return base || text;
}

export function truncate(text, max = 140) {
  if (!text) return '';
  const value = String(text).replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
