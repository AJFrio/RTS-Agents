const fs = require('fs');
const path = require('path');
const os = require('os');
const claudeService = require('../../src/main/services/claude-service');

async function benchmark() {
  const numFiles = 1000;
  const tempDir = path.join(os.tmpdir(), `claude-bench-${Date.now()}`);
  const sessionsPath = path.join(tempDir, 'sessions');
  const projectPath = tempDir;

  if (!fs.existsSync(sessionsPath)) {
    fs.mkdirSync(sessionsPath, { recursive: true });
  }

  console.log(`Generating ${numFiles} mock session files in ${sessionsPath}...`);
  const mockSession = {
    startTime: new Date().toISOString(),
    messages: [
      { role: 'user', content: 'This is a test prompt for benchmarking' },
      { role: 'assistant', content: 'This is a test response for benchmarking' }
    ]
  };
  const content = JSON.stringify(mockSession);

  for (let i = 0; i < numFiles; i++) {
    fs.writeFileSync(path.join(sessionsPath, `session-${i}.json`), content);
  }

  console.log('Starting benchmark...');
  const start = performance.now();
  const sessions = await claudeService.getProjectSessions(projectPath, sessionsPath);
  const end = performance.now();

  console.log(`Processed ${sessions.length} sessions in ${(end - start).toFixed(2)}ms`);

  // Cleanup
  console.log('Cleaning up...');
  for (let i = 0; i < numFiles; i++) {
    fs.unlinkSync(path.join(sessionsPath, `session-${i}.json`));
  }
  fs.rmdirSync(sessionsPath);
  fs.rmdirSync(tempDir);

  return end - start;
}

benchmark().catch(err => {
  console.error(err);
  process.exit(1);
});
