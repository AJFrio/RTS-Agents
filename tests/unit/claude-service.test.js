const path = require('path');
const realFs = jest.requireActual('fs');

// Mock external modules
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: {
    access: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    readFile: jest.fn(),
  }
}));
jest.mock('https');
jest.mock('child_process', () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn(),
}));
jest.mock('os', () => ({
  homedir: jest.fn().mockReturnValue('/home/user'),
  platform: jest.fn().mockReturnValue('linux')
}));

jest.mock('../../src/main/services/config-store', () => ({
  setClaudeCliSessions: jest.fn(),
  getClaudeCliSessions: jest.fn(() => []),
}));

jest.mock('../../src/main/services/acp-service', () => ({
  resolveAdapter: jest.fn(),
  runPrompt: jest.fn(),
  openSession: jest.fn(),
  loadSession: jest.fn(),
  clearAdapterCache: jest.fn(),
  pickPermissionOption: jest.fn(),
  buildSpawnArgs: jest.fn(),
}));

describe('ClaudeService', () => {
  let claudeService;
  let fs;
  let https;
  let os;
  let acpService;
  let configStore;
  let spawn;
  let spawnSync;

  // Setup mocks
  const mockHomeDir = '/home/user';

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Re-require modules to get fresh mocks/instances after resetModules
    fs = require('fs');
    https = require('https');
    os = require('os');
    ({ spawn, spawnSync } = require('child_process'));
    acpService = require('../../src/main/services/acp-service');
    configStore = require('../../src/main/services/config-store');

    // Reset os mock
    os.homedir.mockReturnValue(mockHomeDir);

    // Reset fs mocks
    fs.existsSync.mockReturnValue(false);
    fs.readdirSync.mockReturnValue([]);
    fs.statSync.mockReturnValue({
      birthtime: new Date('2023-01-01'),
      mtime: new Date('2023-01-02'),
      size: 100
    });

    // Re-require service to get fresh instance/state
    claudeService = require('../../src/main/services/claude-service');
  });

  describe('Session Parsing Logic', () => {
    test('extractSessionName returns title if present', () => {
      const session = { title: 'My Custom Title' };
      expect(claudeService.extractSessionName(session)).toBe('My Custom Title');
    });

    test('extractSessionName falls back to user prompt', () => {
      const session = {
        messages: [
          { role: 'user', content: 'This is a long prompt that should be truncated because it is very long indeed' }
        ]
      };
      const name = claudeService.extractSessionName(session);
      expect(name).toContain('This is a long prompt');
      expect(name.endsWith('...')).toBe(true);
    });

    test('inferStatus detects running sessions based on mtime', () => {
      const now = new Date();
      fs.statSync.mockReturnValue({
        mtime: now // Just modified
      });

      const session = {};
      const stats = { mtime: now };

      expect(claudeService.inferStatus(session, stats)).toBe('running');
    });

    test('inferStatus detects completed sessions from status field', () => {
      const oldDate = new Date('2020-01-01');
      const stats = { mtime: oldDate };
      const session = { status: 'completed' };

      expect(claudeService.inferStatus(session, stats)).toBe('completed');
    });

    test('inferStatus defaults to completed for old sessions', () => {
      const oldDate = new Date('2020-01-01');
      const stats = { mtime: oldDate };
      const session = {};

      expect(claudeService.inferStatus(session, stats)).toBe('completed');
    });
  });

  describe('parseTranscript cwd capture', () => {
    test('captures the working directory recorded in the transcript', () => {
      const content = [
        JSON.stringify({ type: 'summary', leafUuid: 'x' }),
        JSON.stringify({
          type: 'user',
          cwd: '/Users/me/projects/sellout',
          message: { role: 'user', content: 'hello' },
        }),
      ].join('\n');

      expect(claudeService.parseTranscript(content).cwd).toBe('/Users/me/projects/sellout');
    });

    test('is undefined when no record carries a cwd', () => {
      const content = JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'hello' },
      });

      expect(claudeService.parseTranscript(content).cwd).toBeUndefined();
    });

    test('keeps the first cwd seen', () => {
      const content = [
        JSON.stringify({ type: 'user', cwd: '/first', message: { role: 'user', content: 'a' } }),
        JSON.stringify({ type: 'user', cwd: '/second', message: { role: 'user', content: 'b' } }),
      ].join('\n');

      expect(claudeService.parseTranscript(content).cwd).toBe('/first');
    });
  });

  describe('extractRepository', () => {
    test('falls back to the transcript cwd when no project-info.json exists', async () => {
      fs.promises.readFile.mockRejectedValue(new Error('ENOENT'));

      const repo = await claudeService.extractRepository('/any/project/dir', {
        cwd: '/Users/me/projects/sellout',
      });

      expect(repo).toBe('/Users/me/projects/sellout');
    });

    test('prefers an explicit repository over the cwd', async () => {
      const repo = await claudeService.extractRepository('/any', {
        repository: 'https://github.com/me/repo',
        cwd: '/Users/me/projects/sellout',
      });

      expect(repo).toBe('https://github.com/me/repo');
    });
  });

  describe('parseTranscript rich content', () => {
    const richFixture = () =>
      realFs.readFileSync(path.join(__dirname, '../fixtures/claude-session-rich.jsonl'), 'utf-8');

    test('preserves tool calls as structured entries on the message', () => {
      const session = claudeService.parseTranscript(richFixture());
      const withTool = session.messages.find((m) => m.toolCalls && m.toolCalls.length);

      expect(withTool).toBeDefined();
      expect(withTool.toolCalls[0]).toMatchObject({ id: 't1', name: 'Bash' });
    });

    test('captures the tool result for a matching tool call', () => {
      const session = claudeService.parseTranscript(richFixture());
      const call = session.messages
        .flatMap((m) => m.toolCalls || [])
        .find((t) => t.id === 't1');

      expect(call.result).toContain('left-pad');
    });

    test('preserves thinking separately from visible text', () => {
      const session = claudeService.parseTranscript(richFixture());
      const thought = session.messages.find((m) => m.thinking);

      expect(thought.thinking).toContain('missing dep');
      expect(thought.content).not.toContain('missing dep');
      expect(thought.content).toBe('Let me check the build.');
    });

    test('does not emit a standalone message for a tool_result-only turn', () => {
      const session = claudeService.parseTranscript(richFixture());

      // the tool_result turn is folded into its tool call, not shown as a user message
      expect(session.messages.filter((m) => m.role === 'user')).toHaveLength(1);
    });

    test('keeps a tool-only assistant turn even when it has no text', () => {
      const jsonl =
        '{"type":"assistant","message":{"role":"assistant","content":[' +
        '{"type":"tool_use","id":"x1","name":"Read","input":{"file_path":"/a.js"}}]}}';
      const session = claudeService.parseTranscript(jsonl);

      expect(session.messages).toHaveLength(1);
      expect(session.messages[0].toolCalls[0].name).toBe('Read');
    });

    test('content stays a plain string for backward compatibility', () => {
      const session = claudeService.parseTranscript(richFixture());
      session.messages.forEach((m) => expect(typeof m.content).toBe('string'));
    });
  });

  describe('getLocalSessionDetails', () => {
    test('opens a .jsonl transcript instead of returning null', async () => {
      // Arrange
      const jsonl = realFs.readFileSync(
        path.join(__dirname, '../fixtures/claude-session-sample.jsonl'),
        'utf-8'
      );
      fs.promises.readFile.mockResolvedValue(jsonl);
      fs.promises.stat.mockResolvedValue({
        birthtime: new Date('2024-05-01'),
        mtime: new Date('2024-05-01'),
        size: jsonl.length,
      });

      // Act
      const details = await claudeService.getLocalSessionDetails('/p/abc123.jsonl');

      // Assert
      expect(details).not.toBeNull();
      expect(details.messageCount).toBe(4);
      expect(details.messages).toHaveLength(4);
      expect(details.name).toBe('Fix failing build');
    });

    test('still opens legacy .json sessions', async () => {
      const data = { title: 'Legacy', messages: [{ role: 'user', content: 'hello there' }] };
      fs.promises.readFile.mockResolvedValue(JSON.stringify(data));
      fs.promises.stat.mockResolvedValue({
        birthtime: new Date(),
        mtime: new Date(),
        size: 10,
      });

      const details = await claudeService.getLocalSessionDetails('/p/legacy.json');

      expect(details).not.toBeNull();
      expect(details.name).toBe('Legacy');
    });
  });

  describe('discoverProjects', () => {
    test('discovers project directories containing only .jsonl transcripts', async () => {
      // Arrange: a project dir with no sessions/ or chats/ subdir, only .jsonl
      fs.promises.access.mockImplementation(async (p) => {
        const target = String(p);
        if (target.endsWith('sessions') || target.endsWith('chats')) {
          throw new Error('ENOENT');
        }
        return undefined;
      });
      fs.promises.readdir.mockImplementation(async (p, opts) => {
        if (opts && opts.withFileTypes) {
          return [{ name: '-Users-me-repo', isDirectory: () => true }];
        }
        return ['9a7925e9-2cf8-40c4-8ab6-2a581343fd95.jsonl'];
      });

      // Act
      const projects = await claudeService.discoverProjects();

      // Assert
      expect(projects).toHaveLength(1);
      expect(projects[0].hash).toBe('-Users-me-repo');
    });
  });

  describe('getProjectSessions', () => {
    test('getProjectSessions returns sessions from valid directory', async () => {
      const projectPath = '/path/to/project';
      const sessionsPath = '/path/to/project/sessions';
      const file = 'session1.json';
      const sessionData = {
        title: 'Test Session',
        startTime: '2023-01-01T00:00:00.000Z'
      };

      fs.promises.access.mockResolvedValue(undefined);
      fs.promises.readdir.mockResolvedValue([file]);
      fs.promises.stat.mockResolvedValue({
        birthtime: new Date('2023-01-01'),
        mtime: new Date('2023-01-02')
      });
      fs.promises.readFile.mockResolvedValue(JSON.stringify(sessionData));

      const sessions = await claudeService.getProjectSessions(projectPath, sessionsPath);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].name).toBe('Test Session');
      expect(fs.promises.readdir).toHaveBeenCalledWith(sessionsPath);
      expect(fs.promises.readFile).toHaveBeenCalledWith(path.join(sessionsPath, file), 'utf-8');
    });

    test('getProjectSessions handles errors and returns empty array', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      fs.promises.readdir.mockRejectedValue(new Error('Read error'));

      const sessions = await claudeService.getProjectSessions('/path', '/path/sessions');
      expect(sessions).toEqual([]);
    });

    test('getProjectSessions reads .jsonl transcripts written by Claude Code', async () => {
      // Arrange
      const sessionsPath = '/path/to/project';
      const jsonl = realFs.readFileSync(
        path.join(__dirname, '../fixtures/claude-session-sample.jsonl'),
        'utf-8'
      );

      fs.promises.access.mockResolvedValue(undefined);
      fs.promises.readdir.mockResolvedValue(['9a7925e9.jsonl']);
      fs.promises.stat.mockResolvedValue({
        birthtime: new Date('2024-05-01'),
        mtime: new Date('2024-05-01'),
      });
      fs.promises.readFile.mockResolvedValue(jsonl);

      // Act
      const sessions = await claudeService.getProjectSessions(sessionsPath, sessionsPath);

      // Assert
      expect(sessions).toHaveLength(1);
      expect(sessions[0].messageCount).toBe(4);
      expect(sessions[0].prompt).toBe('Fix the failing build');
    });

    test('getProjectSessions strips the full .jsonl extension from the session id', async () => {
      const sessionsPath = '/path/to/project';
      fs.promises.access.mockResolvedValue(undefined);
      fs.promises.readdir.mockResolvedValue(['abc123.jsonl']);
      fs.promises.stat.mockResolvedValue({ birthtime: new Date(), mtime: new Date() });
      fs.promises.readFile.mockResolvedValue(
        '{"type":"user","message":{"role":"user","content":"hi there friend"}}'
      );

      const sessions = await claudeService.getProjectSessions(sessionsPath, sessionsPath);

      expect(sessions[0].id).toBe('claude-local-project-abc123');
      expect(sessions[0].id).not.toContain('.jsonl');
      expect(sessions[0].id.endsWith('l')).toBe(false);
    });

    test('getProjectSessions uses aiTitle as the session name when present', async () => {
      const sessionsPath = '/path/to/project';
      const jsonl = realFs.readFileSync(
        path.join(__dirname, '../fixtures/claude-session-sample.jsonl'),
        'utf-8'
      );
      fs.promises.access.mockResolvedValue(undefined);
      fs.promises.readdir.mockResolvedValue(['abc123.jsonl']);
      fs.promises.stat.mockResolvedValue({ birthtime: new Date(), mtime: new Date() });
      fs.promises.readFile.mockResolvedValue(jsonl);

      const sessions = await claudeService.getProjectSessions(sessionsPath, sessionsPath);

      expect(sessions[0].name).toBe('Fix failing build');
    });

    test('getProjectSessions joins text blocks and ignores tool_use/thinking noise', async () => {
      const sessionsPath = '/path/to/project';
      const jsonl = realFs.readFileSync(
        path.join(__dirname, '../fixtures/claude-session-sample.jsonl'),
        'utf-8'
      );
      fs.promises.access.mockResolvedValue(undefined);
      fs.promises.readdir.mockResolvedValue(['abc123.jsonl']);
      fs.promises.stat.mockResolvedValue({ birthtime: new Date(), mtime: new Date() });
      fs.promises.readFile.mockResolvedValue(jsonl);

      const sessions = await claudeService.getProjectSessions(sessionsPath, sessionsPath);

      expect(sessions[0].summary).toBe('Fixed the missing dependency.');
      expect(sessions[0].summary).not.toContain('internal reasoning');
      expect(sessions[0].summary).not.toContain('tool_use');
    });

    test('getProjectSessions skips malformed lines instead of dropping the session', async () => {
      const sessionsPath = '/path/to/project';
      fs.promises.access.mockResolvedValue(undefined);
      fs.promises.readdir.mockResolvedValue(['abc123.jsonl']);
      fs.promises.stat.mockResolvedValue({ birthtime: new Date(), mtime: new Date() });
      fs.promises.readFile.mockResolvedValue(
        '{"type":"user","message":{"role":"user","content":"first message here"}}\n' +
          '{ this is not valid json\n' +
          '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"ok"}]}}'
      );

      const sessions = await claudeService.getProjectSessions(sessionsPath, sessionsPath);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].messageCount).toBe(2);
    });

    test('getProjectSessions still reads legacy .json sessions', async () => {
      const sessionsPath = '/path/to/project/sessions';
      fs.promises.access.mockResolvedValue(undefined);
      fs.promises.readdir.mockResolvedValue(['legacy.json']);
      fs.promises.stat.mockResolvedValue({ birthtime: new Date(), mtime: new Date() });
      fs.promises.readFile.mockResolvedValue(JSON.stringify({ title: 'Legacy Session' }));

      const sessions = await claudeService.getProjectSessions('/path/to/project', sessionsPath);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].name).toBe('Legacy Session');
    });
  });

  describe('Project Discovery', () => {
    test('discoverProjects finds projects with sessions', async () => {
      const projectsDir = path.join(mockHomeDir, '.claude', 'projects');

      // Mock directory structure using fs.promises for the new async logic
      if (!fs.promises.access) {
        fs.promises.access = jest.fn();
      }

      fs.promises.access.mockImplementation(async (p) => {
        if (p === projectsDir) return Promise.resolve();
        if (p.endsWith('my-project')) return Promise.resolve();
        if (p.endsWith('sessions')) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });

      fs.promises.readdir.mockImplementation(async (p, options) => {
        if (p === projectsDir) {
          return Promise.resolve([{
            name: 'my-project',
            isDirectory: () => true
          }]);
        }
        return Promise.resolve([]);
      });

      const projects = await claudeService.discoverProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].hash).toBe('my-project');
    });
  });

  describe('API Interaction', () => {
    test('createMessage makes HTTPS request', async () => {
      claudeService.setApiKey('test-api-key');

      const mockReq = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        setTimeout: jest.fn()
      };

      https.request.mockImplementation((options, cb) => {
        const mockRes = {
          statusCode: 200,
          headers: {},
          on: (event, handler) => {
            if (event === 'data') handler(JSON.stringify({ content: [] }));
            if (event === 'end') handler();
          }
        };
        cb(mockRes);
        return mockReq;
      });

      await claudeService.createMessage([{ role: 'user', content: 'hi' }]);

      expect(https.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key'
          })
        }),
        expect.any(Function)
      );
    });

    test('createMessage throws if API key not set', async () => {
        claudeService.setApiKey(null);
        await expect(claudeService.createMessage([])).rejects.toThrow('Anthropic API key not configured');
    });
  });

  describe('install detection', () => {
    test('bare ~/.claude without CLI is NOT installed', async () => {
      fs.promises.access.mockRejectedValue(new Error('ENOENT'));
      spawnSync.mockReturnValue({ status: 1 });

      expect(await claudeService.refreshInstallStatus()).toBe(false);
    });

    test('projects dir with session data counts as installed', async () => {
      fs.promises.access.mockImplementation(async (target) => {
        if (String(target).endsWith('.claude/projects')) return undefined;
        throw new Error('ENOENT');
      });

      expect(await claudeService.refreshInstallStatus()).toBe(true);
    });

    test('runnable claude CLI counts as installed', async () => {
      fs.promises.access.mockRejectedValue(new Error('ENOENT'));
      spawnSync.mockReturnValue({ status: 0 });

      expect(await claudeService.refreshInstallStatus()).toBe(true);
    });
  });

  describe('interactive follow-up turns', () => {
    function mockOpenSession({ promptImpl, sessionId = 'acp-live-1', alive = true } = {}) {
      acpService.resolveAdapter.mockReturnValue('claude-agent-acp');
      const session = {
        sessionId,
        capabilities: {},
        canLoadSession: false,
        prompt: jest.fn(promptImpl || (() => Promise.resolve({ stopReason: 'end_turn' }))),
        dispose: jest.fn(),
        isAlive: jest.fn(() => alive),
      };
      let captured = {};
      acpService.openSession.mockImplementation((opts) => {
        captured = opts;
        // Real adapters fire onSessionId as soon as session/new returns; the
        // task card resolves off this, not off the first turn finishing.
        if (opts.onSessionId) opts.onSessionId(sessionId);
        return Promise.resolve(session);
      });
      return { session, handlers: () => captured };
    }

    test('sendFollowUp rejects for a task it has never heard of', async () => {
      await expect(
        claudeService.sendFollowUp('claude-cli-does-not-exist', 'are you there?')
      ).rejects.toThrow(/unknown claude code task/i);
    });

    test('sendFollowUp rejects when the task has no live session and nothing to resume', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      mockOpenSession();
      const card = await claudeService.startLocalSession({
        prompt: 'first',
        projectPath: '/repo',
      });
      await new Promise((r) => setImmediate(r));

      // Drop the live adapter and clear the resumable id.
      claudeService.disposeLiveSessions();
      const tracked = claudeService.getTrackedLocalSessions().find((t) => t.id === card.id);
      delete tracked.acpSessionId;

      await expect(claudeService.sendFollowUp(card.id, 'hi')).rejects.toThrow(
        /no live session and nothing to resume/i
      );
    });

    test('sendFollowUp prompts the existing session without respawning', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      const { session, handlers } = mockOpenSession();

      const card = await claudeService.startLocalSession({
        prompt: 'first task',
        projectPath: '/repo',
      });
      // Let the opening turn settle.
      await new Promise((r) => setImmediate(r));

      await claudeService.sendFollowUp(card.id, 'now also update the docs');

      expect(acpService.openSession).toHaveBeenCalledTimes(1);
      expect(session.prompt).toHaveBeenLastCalledWith('now also update the docs');
      // The adapter must not have been torn down between turns.
      expect(session.dispose).not.toHaveBeenCalled();
      expect(handlers().cwd).toBe('/repo');
    });

    test('records the user follow-up in the transcript before the reply', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      // Each turn streams its own reply chunk, as a real adapter would.
      let turn = 0;
      const replies = ['first reply', 'second reply'];
      const { session, handlers } = mockOpenSession({
        promptImpl: () => {
          const text = replies[turn];
          turn += 1;
          handlers().onUpdate(
            { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
            'acp-live-1'
          );
          return Promise.resolve({ stopReason: 'end_turn' });
        },
      });

      const card = await claudeService.startLocalSession({
        prompt: 'first task',
        projectPath: '/repo',
      });
      await new Promise((r) => setImmediate(r));

      await claudeService.sendFollowUp(card.id, 'follow up question');

      const tracked = claudeService.getTrackedLocalSessions().find((t) => t.id === card.id);
      const roles = tracked.streamMessages.map((m) => `${m.role}:${m.content}`);

      // The user turn must break the assistant chunk merge, otherwise the
      // second reply would be concatenated onto the first.
      expect(roles).toEqual([
        'assistant:first reply',
        'user:follow up question',
        'assistant:second reply',
      ]);
      expect(session.prompt).toHaveBeenCalledTimes(2);
    });

    test('sets the task back to running during a follow-up and completed after', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      // Each turn gets its own resolver so releasing turn 1 cannot be
      // clobbered by turn 2 starting.
      const releases = [];
      mockOpenSession({
        promptImpl: () => new Promise((resolve) => { releases.push(resolve); }),
      });

      const card = await claudeService.startLocalSession({
        prompt: 'first',
        projectPath: '/repo',
      });
      // The opening prompt has already been issued by the time the card
      // resolves, so its resolver is queued and ready to release.
      releases.shift()({ stopReason: 'end_turn' });
      await new Promise((r) => setImmediate(r));

      const followUp = claudeService.sendFollowUp(card.id, 'more work');
      await new Promise((r) => setImmediate(r));

      expect(
        claudeService.getTrackedLocalSessions().find((t) => t.id === card.id).status
      ).toBe('running');

      releases.shift()({ stopReason: 'end_turn' });
      await followUp;

      expect(
        claudeService.getTrackedLocalSessions().find((t) => t.id === card.id).status
      ).toBe('completed');
    });

    test('marks the task failed when the follow-up turn errors', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      let calls = 0;
      mockOpenSession({
        promptImpl: () => {
          calls += 1;
          if (calls === 1) return Promise.resolve({ stopReason: 'end_turn' });
          const err = new Error('adapter died');
          err.phase = 'exit';
          return Promise.reject(err);
        },
      });

      const card = await claudeService.startLocalSession({
        prompt: 'first',
        projectPath: '/repo',
      });
      await new Promise((r) => setImmediate(r));

      await expect(claudeService.sendFollowUp(card.id, 'more')).rejects.toThrow('adapter died');

      const tracked = claudeService.getTrackedLocalSessions().find((t) => t.id === card.id);
      expect(tracked.status).toBe('failed');
      expect(tracked.error).toMatch(/adapter died/);
    });

    test('supportsFollowUp reflects whether a live session exists', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      mockOpenSession();

      const card = await claudeService.startLocalSession({
        prompt: 'first',
        projectPath: '/repo',
      });
      await new Promise((r) => setImmediate(r));

      expect(claudeService.supportsFollowUp(card.id)).toBe(true);
      expect(claudeService.supportsFollowUp('claude-cli-other')).toBe(false);
    });
  });

  describe('follow-ups on discovered (.jsonl) sessions', () => {
    // Discovered sessions are not tracked records - they are scanned from
    // ~/.claude/projects/**/*.jsonl, where the filename IS the ACP session
    // id. They are resumable via session/load even though the app never
    // dispatched them.
    const DISCOVERED_ID =
      'claude-local--Users-me-proj-8c52ba41-b157-41f4-8b5b-3378703104c4';
    const FILE_PATH =
      '/home/user/.claude/projects/-Users-me-proj/8c52ba41-b157-41f4-8b5b-3378703104c4.jsonl';

    beforeEach(() => {
      // The project dir is recovered from the transcript's cwd field, not
      // from the (ambiguous) dash-encoded folder name.
      fs.readFileSync.mockReturnValue(
        [
          JSON.stringify({ type: 'user', cwd: '/Users/me/proj', sessionId: 'x' }),
          JSON.stringify({ type: 'assistant', message: { content: 'hi' } }),
        ].join('\n')
      );
    });

    test('derives a resumable record from a discovered session id and file path', () => {
      const record = claudeService.recordForFollowUp(DISCOVERED_ID, FILE_PATH);

      expect(record).toMatchObject({
        acpSessionId: '8c52ba41-b157-41f4-8b5b-3378703104c4',
        projectPath: '/Users/me/proj',
      });
    });

    test('supportsFollowUp is true for a discovered session with a file path', () => {
      expect(claudeService.supportsFollowUp(DISCOVERED_ID, FILE_PATH)).toBe(true);
    });

    test('supportsFollowUp is false for a discovered id with no file path', () => {
      // Without the transcript path we cannot recover the project directory.
      expect(claudeService.supportsFollowUp(DISCOVERED_ID)).toBe(false);
    });

    test('ignores a file path whose name is not a session uuid', () => {
      expect(
        claudeService.supportsFollowUp(DISCOVERED_ID, '/home/user/.claude/projects/p/notes.jsonl')
      ).toBe(false);
    });

    test('is not resumable when the transcript has no recoverable cwd', () => {
      fs.readFileSync.mockReturnValue(
        JSON.stringify({ type: 'summary', leafUuid: 'abc' })
      );
      expect(claudeService.supportsFollowUp(DISCOVERED_ID, FILE_PATH)).toBe(false);
    });

    test('is not resumable when the transcript cannot be read', () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('EACCES');
      });
      expect(claudeService.supportsFollowUp(DISCOVERED_ID, FILE_PATH)).toBe(false);
    });

    test('sendFollowUp resumes a discovered session via session/load', async () => {
      const resumed = {
        sessionId: '8c52ba41-b157-41f4-8b5b-3378703104c4',
        capabilities: { loadSession: true },
        canLoadSession: true,
        isAlive: () => true,
        dispose: jest.fn(),
        prompt: jest.fn().mockResolvedValue({ stopReason: 'end_turn' }),
      };
      acpService.resolveAdapter.mockReturnValue('claude-agent-acp');
      acpService.loadSession.mockResolvedValue(resumed);

      const result = await claudeService.sendFollowUp(
        DISCOVERED_ID,
        'what were we working on?',
        FILE_PATH
      );

      expect(acpService.loadSession).toHaveBeenCalledWith(
        expect.objectContaining({
          acpSessionId: '8c52ba41-b157-41f4-8b5b-3378703104c4',
          command: 'claude-agent-acp',
        })
      );
      expect(resumed.prompt).toHaveBeenCalledWith('what were we working on?');
      expect(result.success).toBe(true);
    });
  });

  describe('ACP-backed local sessions', () => {
    // The interactive dispatch path now opens a long-lived session and then
    // prompts it; this helper preserves the old per-turn assertions by
    // driving the same callbacks through the session handle.
    function mockAcpRunPrompt(overrides = {}) {
      acpService.resolveAdapter.mockReturnValue('claude-agent-acp');
      // Handlers are handed to the caller as soon as the session opens.
      const captureOpen = overrides.onOpen;
      // A pre-session failure (spawn/initialize) must reject from openSession
      // itself - that is the only window where legacy fallback is legal.
      if (overrides.openError) {
        acpService.openSession.mockRejectedValue(overrides.openError);
        return;
      }
      acpService.openSession.mockImplementation(({ onSessionId, onUpdate }) => {
        const session = {
          sessionId: 'acp-1',
          capabilities: {},
          canLoadSession: false,
          isAlive: () => true,
          dispose: jest.fn(),
          prompt: jest.fn(() => {
            if (overrides.onRun) overrides.onRun({ onSessionId, onUpdate });
            return (
              overrides.promise ||
              Promise.resolve({ sessionId: 'acp-1', stopReason: 'end_turn' })
            );
          }),
        };
        if (captureOpen) captureOpen({ onSessionId, onUpdate });
        if (onSessionId) onSessionId('acp-1');
        return Promise.resolve(session);
      });
    }

    test('startLocalSession dispatches via ACP and resolves early on session/new', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      mockAcpRunPrompt({
        promise: new Promise(() => {}),
        onRun: ({ onSessionId, onUpdate }) => {
          onSessionId('acp-session-1');
          onUpdate(
            { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Working' } },
            'acp-session-1'
          );
        },
      });

      const result = await claudeService.startLocalSession({
        prompt: 'Fix the failing tests',
        projectPath: '/repo',
      });

      expect(acpService.openSession).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'claude-agent-acp',
          cwd: '/repo',
          permissionPolicy: 'safe-tools',
        })
      );
      // The prompt is now sent as a turn on the session, not at open time.
      const openedSession = await acpService.openSession.mock.results[0].value;
      expect(openedSession.prompt).toHaveBeenCalledWith('Fix the failing tests');
      expect(result).toMatchObject({
        provider: 'claude',
        source: 'local',
        status: 'running',
        prompt: 'Fix the failing tests',
        repository: '/repo',
      });

      const tracked = claudeService.getTrackedLocalSessions();
      expect(tracked).toHaveLength(1);
      expect(tracked[0]).toMatchObject({
        prompt: 'Fix the failing tests',
        projectPath: '/repo',
        status: 'running',
      });
    });

    test('completion patches the tracked session status and persists it', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      mockAcpRunPrompt({
        onRun: ({ onSessionId, onUpdate }) => {
          onSessionId('acp-session-1');
          onUpdate(
            { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Working' } },
            'acp-session-1'
          );
        },
      });

      await claudeService.startLocalSession({ prompt: 'Fix it', projectPath: '/repo' });
      await new Promise((r) => setImmediate(r));

      const tracked = claudeService.getTrackedLocalSessions();
      expect(tracked[0].status).toBe('completed');
      expect(tracked[0].streamMessages).toEqual([
        expect.objectContaining({ role: 'assistant', content: 'Working' }),
      ]);
      expect(configStore.setClaudeCliSessions).toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
    });

    test('persists stream messages with debounce while running', async () => {
      jest.useFakeTimers();
      try {
        fs.promises.access.mockResolvedValue(undefined);
        let captured;
        mockAcpRunPrompt({
          promise: new Promise(() => {}),
          onOpen: (handlers) => {
            captured = handlers;
          },
        });

        const startPromise = claudeService.startLocalSession({
          prompt: 'Long task',
          projectPath: '/repo',
        });
        await Promise.resolve();
        captured.onSessionId('acp-1');
        captured.onUpdate(
          { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'live output' } },
          'acp-1'
        );

        jest.advanceTimersByTime(1100);
        const persisted = configStore.setClaudeCliSessions.mock.calls.at(-1)[0];
        expect(persisted[0].streamMessages).toEqual([
          expect.objectContaining({ content: 'live output' }),
        ]);
        expect(persisted[0].status).toBe('running');
        await startPromise;
      } finally {
        jest.useRealTimers();
      }
    });

    test('marks the tracked session failed when ACP fails after start', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      mockAcpRunPrompt({
        promise: Promise.reject(
          Object.assign(new Error('ACP adapter exited (code 1)'), {
            phase: 'exit',
            fallbackAllowed: false,
          })
        ),
      });

      await claudeService.startLocalSession({ prompt: 'Fix it', projectPath: '/repo' });
      await new Promise((r) => setImmediate(r));

      expect(claudeService.getTrackedLocalSessions()[0]).toMatchObject({
        status: 'failed',
        error: 'ACP adapter exited (code 1)',
      });
      expect(spawn).not.toHaveBeenCalled();
    });

    test('falls back to legacy spawn when ACP fails before any agent work', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      mockAcpRunPrompt({
        openError: Object.assign(new Error('Failed to start ACP adapter'), {
          phase: 'spawn',
          fallbackAllowed: true,
        }),
      });
      spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn() });

      const result = await claudeService.startLocalSession({
        prompt: 'Fix it',
        projectPath: '/repo',
      });

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        ['-p', 'Fix it', '--allowedTools', 'Read,Edit,Bash'],
        expect.objectContaining({ cwd: '/repo', detached: true })
      );
      expect(result.message).toContain('Claude Code CLI session started');
      expect(claudeService.getTrackedLocalSessions()).toHaveLength(0);
    });

    test('falls back to legacy spawn when no adapter is installed', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      acpService.resolveAdapter.mockReturnValue(null);
      spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn() });

      await claudeService.startLocalSession({ prompt: 'Fix it', projectPath: '/repo' });

      expect(acpService.openSession).not.toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledWith(
        'claude',
        ['-p', 'Fix it', '--allowedTools', 'Read,Edit,Bash'],
        expect.objectContaining({ detached: true })
      );
    });

    test('getAllLocalSessions merges tracked ACP sessions with filesystem discovery', async () => {
      claudeService.setTrackedLocalSessions([
        {
          id: 'claude-cli-1-abc',
          prompt: 'Fix the bug',
          projectPath: '/repo',
          status: 'running',
          streamMessages: [{ role: 'assistant', content: 'Step one done' }],
          createdAt: '2026-08-30T00:00:00.000Z',
          updatedAt: '2026-08-30T00:01:00.000Z',
        },
      ]);

      const sessions = await claudeService.getAllLocalSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        id: 'claude-cli-1-abc',
        provider: 'claude',
        source: 'local',
        status: 'running',
      });
    });

    test('getAgentDetails returns tracked messages for claude-cli session ids', async () => {
      claudeService.setTrackedLocalSessions([
        {
          id: 'claude-cli-1-abc',
          prompt: 'Fix the bug',
          projectPath: '/repo',
          status: 'completed',
          streamMessages: [{ role: 'assistant', content: 'All done', id: 'stream-0' }],
          createdAt: '2026-08-30T00:00:00.000Z',
          updatedAt: '2026-08-30T00:01:00.000Z',
        },
      ]);

      const details = await claudeService.getAgentDetails('claude-cli-1-abc');
      expect(details.status).toBe('completed');
      expect(details.messages).toEqual([
        expect.objectContaining({ role: 'user', content: 'Fix the bug' }),
        expect.objectContaining({ role: 'assistant', content: 'All done' }),
      ]);
    });

    test('restore via setTrackedLocalSessions round-trips', () => {
      expect(claudeService.getTrackedLocalSessions()).toEqual([]);
      claudeService.setTrackedLocalSessions([{ id: 'x' }]);
      expect(claudeService.getTrackedLocalSessions()).toEqual([{ id: 'x' }]);
    });
  });

  describe('model selection', () => {
    const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-4-20250514';

    test('legacy spawn appends --model when a model is requested', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      acpService.resolveAdapter.mockReturnValue(null);
      spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn() });

      await claudeService.startLocalSession({
        prompt: 'Fix it',
        projectPath: '/repo',
        model: 'claude-sonnet-4-6',
      });

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        ['-p', 'Fix it', '--allowedTools', 'Read,Edit,Bash', '--model', 'claude-sonnet-4-6'],
        expect.objectContaining({ detached: true })
      );
    });

    test('legacy spawn omits --model when no model is requested', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      acpService.resolveAdapter.mockReturnValue(null);
      spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn() });

      await claudeService.startLocalSession({ prompt: 'Fix it', projectPath: '/repo' });

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        ['-p', 'Fix it', '--allowedTools', 'Read,Edit,Bash'],
        expect.anything()
      );
    });

    test('ACP dispatch forwards the requested model to openSession', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      acpService.resolveAdapter.mockReturnValue('claude-agent-acp');
      acpService.openSession.mockResolvedValue({
        sessionId: 'acp-1',
        capabilities: {},
        canLoadSession: false,
        isAlive: () => true,
        dispose: jest.fn(),
        prompt: jest.fn().mockResolvedValue({ stopReason: 'end_turn' }),
      });

      await claudeService.startLocalSession({
        prompt: 'Fix it',
        projectPath: '/repo',
        model: 'sonnet',
      });

      expect(acpService.openSession).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'sonnet' })
      );
    });

    test('cloud createTask sends the requested model to the Messages API', async () => {
      claudeService.setApiKey('test-api-key');

      const writes = [];
      const mockReq = {
        on: jest.fn(),
        write: (chunk) => writes.push(String(chunk)),
        end: jest.fn(),
        setTimeout: jest.fn()
      };

      https.request.mockImplementation((options, cb) => {
        const mockRes = {
          statusCode: 200,
          headers: {},
          on: (event, handler) => {
            if (event === 'data') handler(JSON.stringify({ content: [] }));
            if (event === 'end') handler();
          }
        };
        cb(mockRes);
        return mockReq;
      });

      await claudeService.createTask({ prompt: 'Hi', model: 'claude-opus-4-8' });

      const body = JSON.parse(writes.find((w) => w.includes('"model"')));
      expect(body.model).toBe('claude-opus-4-8');
    });

    test('cloud createTask falls back to the default model', async () => {
      claudeService.setApiKey('test-api-key');

      const writes = [];
      const mockReq = {
        on: jest.fn(),
        write: (chunk) => writes.push(String(chunk)),
        end: jest.fn(),
        setTimeout: jest.fn()
      };

      https.request.mockImplementation((options, cb) => {
        const mockRes = {
          statusCode: 200,
          headers: {},
          on: (event, handler) => {
            if (event === 'data') handler(JSON.stringify({ content: [] }));
            if (event === 'end') handler();
          }
        };
        cb(mockRes);
        return mockReq;
      });

      await claudeService.createTask({ prompt: 'Hi' });

      const body = JSON.parse(writes.find((w) => w.includes('"model"')));
      expect(body.model).toBe(CLAUDE_DEFAULT_MODEL);
    });
  });
});
