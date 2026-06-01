jest.mock('../../src/main/services/config-store', () => ({
  getSetting: jest.fn(() => ({})),
  setOpenCodeSessions: jest.fn(),
  getOpenCodeSessions: jest.fn(() => []),
}));

jest.mock('../../src/main/services/project-service', () => ({}));

jest.mock('../../src/main/utils/path-exists', () => ({
  pathExists: jest.fn(),
  pathExistsAny: jest.fn(),
}));

jest.mock('../../src/main/utils/install-status', () => ({
  getCached: jest.fn(),
  setCached: jest.fn(),
}));

const opencodeService = require('../../src/main/services/opencode-service');

describe('OpenCodeService', () => {
  test('buildRunArgs uses non-interactive run with project dir', () => {
    const args = opencodeService.buildRunArgs('D:\\GitHub\\MyRepo', 'Fix the bug');
    expect(args[0]).toBe('run');
    expect(args).toContain('--dir');
    expect(args).toContain('D:\\GitHub\\MyRepo');
    expect(args).toContain('--dangerously-skip-permissions');
    expect(args[args.length - 1]).toBe('Fix the bug');
  });

  test('buildRunArgs can omit auto-approve flag', () => {
    const args = opencodeService.buildRunArgs('/repo', 'task', { skipPermissions: false });
    expect(args).not.toContain('--dangerously-skip-permissions');
  });
});
