/**
 * Cursor run/agent mapping helpers — pure functions ported from
 * mobile-webapp/src/services/cursor-service.ts.
 */

export function mapRunStatus(status) {
  if (!status) return 'pending';

  const statusMap = {
    CREATING: 'pending',
    RUNNING: 'running',
    FINISHED: 'completed',
    ERROR: 'failed',
    FAILED: 'failed',
    CANCELLED: 'stopped',
    EXPIRED: 'failed',
    STOPPED: 'stopped',
  };

  return statusMap[status.toUpperCase()] || 'pending';
}

export function mapAgentStatus(status, hasRun = false) {
  if (!status) return hasRun ? 'completed' : 'pending';

  const statusMap = {
    ACTIVE: hasRun ? 'completed' : 'pending',
    ARCHIVED: 'stopped',
    CREATING: 'pending',
    RUNNING: 'running',
    FINISHED: 'completed',
    ERROR: 'failed',
    FAILED: 'failed',
    CANCELLED: 'stopped',
    EXPIRED: 'failed',
    STOPPED: 'stopped',
  };

  return statusMap[status.toUpperCase()] || (hasRun ? 'completed' : 'pending');
}

/** List responses arrive as {items|agents|runs|repositories} or a bare array. */
export function extractListItems(response) {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  return response.items || response.agents || response.runs || response.repositories || [];
}

/** API responses may wrap the payload as {agent: ...} / {run: ...}. */
export function unwrapEnvelope(response, key) {
  if (!response) return null;
  if (Object.prototype.hasOwnProperty.call(response, key)) {
    return response[key] || null;
  }
  return response;
}

export function formatRunGitDescription(run) {
  const branches = run.git?.branches || [];
  if (!branches.length) return null;

  return branches
    .map((entry) => {
      const parts = [];
      if (entry.repoUrl) parts.push(entry.repoUrl);
      if (entry.branch) parts.push(`branch: ${entry.branch}`);
      if (entry.prUrl) parts.push(`PR: ${entry.prUrl}`);
      return parts.join(' · ');
    })
    .filter(Boolean)
    .join('\n');
}

export function buildRunActivity(run) {
  const gitNote = formatRunGitDescription(run);
  const description = [run.result, gitNote].filter(Boolean).join('\n\n') || null;

  return {
    id: run.id,
    type: 'cursor_run',
    title: `Run ${run.status || 'UNKNOWN'}`,
    description,
    timestamp: run.updatedAt || run.createdAt,
  };
}

export function buildConversationFromRuns(runs) {
  const chronological = [...runs].reverse();
  const messages = [];

  for (const run of chronological) {
    if (!run.result?.trim()) continue;
    messages.push({
      id: run.id,
      type: 'assistant_message',
      text: run.result,
      isUser: false,
    });
  }

  return messages;
}

export function extractRepoName(url) {
  if (!url) return 'Unknown';
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return match ? match[1] : url;
}
