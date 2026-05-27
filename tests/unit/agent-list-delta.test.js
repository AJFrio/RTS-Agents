const { computeAgentListDelta } = require('../../src/main/utils/agent-list-delta');

describe('agent-list-delta', () => {
  test('detects added, updated, and removed agents', () => {
    const prev = [
      { id: 'a', status: 'running', updatedAt: '1', name: 'A', summary: '', prompt: '', repository: '' },
      { id: 'b', status: 'completed', updatedAt: '2', name: 'B', summary: '', prompt: '', repository: '' }
    ];
    const next = [
      { id: 'a', status: 'completed', updatedAt: '3', name: 'A', summary: '', prompt: '', repository: '' },
      { id: 'c', status: 'pending', updatedAt: '4', name: 'C', summary: '', prompt: '', repository: '' }
    ];
    const delta = computeAgentListDelta(prev, next);
    expect(delta.removed).toEqual(['b']);
    expect(delta.added.map((a) => a.id)).toEqual(['c']);
    expect(delta.updated.map((a) => a.id)).toEqual(['a']);
  });
});
