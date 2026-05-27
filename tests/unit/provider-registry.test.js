const {
  sortAgentsByDate,
  REMOTE_TASK_PROVIDERS
} = require('../../src/main/ipc/provider-registry');

describe('provider-registry', () => {
  test('sortAgentsByDate orders newest first', () => {
    const sorted = sortAgentsByDate([
      { id: 'a', createdAt: '2020-01-01' },
      { id: 'b', updatedAt: '2025-01-01' },
      { id: 'c', createdAt: '2024-06-01' }
    ]);
    expect(sorted.map((a) => a.id)).toEqual(['b', 'c', 'a']);
  });

  test('REMOTE_TASK_PROVIDERS includes expected local CLIs', () => {
    expect(REMOTE_TASK_PROVIDERS.has('gemini')).toBe(true);
    expect(REMOTE_TASK_PROVIDERS.has('claude-cli')).toBe(true);
    expect(REMOTE_TASK_PROVIDERS.has('jules')).toBe(false);
  });
});
