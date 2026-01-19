const fs = require('fs');
const path = require('path');
const os = require('os');
const geminiService = require('../../src/main/services/gemini-service');

describe('GeminiService Integration Tests', () => {
  let tempDir;
  let projectDir;
  let chatsDir;

  beforeAll(() => {
    // Create a temporary directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-integration-'));
    projectDir = path.join(tempDir, 'test-project');
    chatsDir = path.join(projectDir, 'chats');

    fs.mkdirSync(projectDir);
    fs.mkdirSync(chatsDir);

    // Create a dummy session file
    const sessionData = {
      sessionId: 'test-session-1',
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      messages: [
        { role: 'user', content: 'Integration test prompt' },
        { role: 'gemini', content: 'Integration test response' }
      ]
    };

    fs.writeFileSync(
      path.join(chatsDir, 'session-1.json'),
      JSON.stringify(sessionData, null, 2)
    );
  });

  afterAll(() => {
    // Cleanup
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error('Failed to cleanup temp dir:', e);
    }
  });

  test('should discover projects and read sessions from real file system', async () => {
    // 1. Discover Projects
    const projects = await geminiService.discoverProjects([tempDir]);
    expect(projects).toHaveLength(1);
    expect(projects[0].hash).toBe('test-project');
    expect(projects[0].path).toBe(projectDir);

    // 2. Get Project Sessions
    const sessions = await geminiService.getProjectSessions(projects[0].path);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].prompt).toBe('Integration test prompt');
    expect(sessions[0].messageCount).toBe(2);
  });
});
