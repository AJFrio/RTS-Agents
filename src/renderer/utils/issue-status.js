/**
 * Map a Jira/Linear status name to a shared task status key.
 */
export function jiraStatusKey(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('done') || s.includes('closed') || s.includes('resolved')) return 'completed';
  if (s.includes('progress') || s.includes('review') || s.includes('testing')) return 'running';
  if (s.includes('todo') || s.includes('backlog') || s.includes('open') || s.includes('new')) {
    return 'queued';
  }
  return 'idle';
}
