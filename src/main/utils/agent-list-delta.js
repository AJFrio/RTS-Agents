/**
 * Compute incremental agent list changes for IPC delta updates.
 */

function agentSignature(agent) {
  return [
    agent.status,
    String(agent.updatedAt || ''),
    agent.name || '',
    agent.summary || '',
    agent.prompt || '',
    agent.repository || ''
  ].join('\0');
}

function computeAgentListDelta(prevAgents, nextAgents) {
  const prevMap = new Map((prevAgents || []).map((a) => [a.id, a]));
  const nextMap = new Map((nextAgents || []).map((a) => [a.id, a]));
  const added = [];
  const updated = [];
  const removed = [];

  for (const [id, agent] of nextMap) {
    const prev = prevMap.get(id);
    if (!prev) {
      added.push(agent);
    } else if (agentSignature(prev) !== agentSignature(agent)) {
      updated.push(agent);
    }
  }

  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) {
      removed.push(id);
    }
  }

  return { added, updated, removed };
}

function hasAgentListChanges(delta) {
  return (
    (delta.added?.length || 0) > 0 ||
    (delta.updated?.length || 0) > 0 ||
    (delta.removed?.length || 0) > 0
  );
}

module.exports = { computeAgentListDelta, hasAgentListChanges, agentSignature };
