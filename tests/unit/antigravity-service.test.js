jest.mock('../../src/main/services/config-store', () => ({
  getSetting: jest.fn(() => ({})),
  getAntigravitySessions: jest.fn(() => []),
  setAntigravitySessions: jest.fn(),
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

jest.mock('../../src/main/services/provider-health', () => ({
  ok: jest.fn(),
  fail: jest.fn(),
}));

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn(),
}));

const { spawn } = require('child_process');
const { pathExists } = require('../../src/main/utils/path-exists');
const antigravityService = require('../../src/main/services/antigravity-service');

describe('AntigravityService model selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn() });
  });

  test('startSession includes --model when options.model is set', async () => {
    pathExists.mockResolvedValue(true);

    await antigravityService.startSession({
      prompt: 'Reverse the string',
      projectPath: '/repo',
      model: 'gemini-3.7-flash-high',
    });

    expect(spawn).toHaveBeenCalledWith(
      'agy',
      [
        '--print',
        'Reverse the string',
        '--print-timeout',
        '30m',
        '--model',
        'gemini-3.7-flash-high',
      ],
      expect.objectContaining({ cwd: '/repo', detached: true })
    );
  });

  test('startSession omits --model when options.model is absent', async () => {
    pathExists.mockResolvedValue(true);

    await antigravityService.startSession({
      prompt: 'Reverse the string',
      projectPath: '/repo',
    });

    expect(spawn).toHaveBeenCalledWith(
      'agy',
      ['--print', 'Reverse the string', '--print-timeout', '30m'],
      expect.anything()
    );
  });
});
