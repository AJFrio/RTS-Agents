const fsPromises = require('fs').promises;
const path = require('path');
const os = require('os');

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

async function statToken(filePath) {
  try {
    const stat = await fsPromises.stat(filePath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return null;
  }
}

async function fingerprintJsonDir(dirPath) {
  try {
    await fsPromises.access(dirPath);
    const names = await fsPromises.readdir(dirPath);
    const jsonFiles = names.filter((n) => n.endsWith('.json')).sort();
    if (jsonFiles.length === 0) {
      const dirStat = await statToken(dirPath);
      return dirStat || '';
    }
    const tokens = await Promise.all(
      jsonFiles.map((name) => statToken(path.join(dirPath, name)))
    );
    return tokens.filter(Boolean).join(',');
  } catch {
    return '';
  }
}

async function fingerprintProjectTree(basePath) {
  try {
    await fsPromises.access(basePath);
    const entries = await fsPromises.readdir(basePath, { withFileTypes: true });
    const parts = [await statToken(basePath)];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'bin' || entry.name === 'cache' || entry.name === 'tmp') continue;
      const projectPath = path.join(basePath, entry.name);
      const chats = path.join(projectPath, 'chats');
      const sessions = path.join(projectPath, 'sessions');
      parts.push(await fingerprintJsonDir(chats));
      parts.push(await fingerprintJsonDir(sessions));
      parts.push(await fingerprintJsonDir(projectPath));
    }
    return parts.filter(Boolean).join('|');
  } catch {
    return '';
  }
}

function getConfigSignature(configStore) {
  return JSON.stringify({
    paths: configStore.getAllProjectPaths(),
    antigravityPaths: configStore.getAntigravityPaths?.() ?? [],
    geminiPaths: configStore.getGeminiPaths?.() ?? [],
    claudePaths: configStore.getClaudePaths?.() ?? [],
    cursorPaths: configStore.getCursorPaths?.() ?? [],
    codexPaths: configStore.getCodexPaths?.() ?? [],
    keys: {
      jules: configStore.hasApiKey('jules'),
      cursor: configStore.hasApiKey('cursor'),
      codex: configStore.hasApiKey('codex'),
      claude: configStore.hasApiKey('claude')
    },
    codexThreads: (configStore.getCodexThreads?.() || []).length,
    claudeConversations: (configStore.getClaudeConversations?.() || []).length,
    opencodeSessions: (configStore.getOpenCodeSessions?.() || []).length,
    antigravitySessions: (configStore.getAntigravitySessions?.() || []).length
  });
}

/**
 * Lightweight filesystem fingerprint for local CLI session stores.
 * @param {object} deps
 * @returns {Promise<string>}
 */
async function computeLocalFingerprint(deps) {
  const { configStore, antigravityService, geminiService } = deps;
  const parts = [];

  parts.push(await statToken(antigravityService.getDefaultDataPath()));
  parts.push(await fingerprintProjectTree(antigravityService.getDefaultDataPath()));
  for (const extra of configStore.getAntigravityPaths?.() || []) {
    parts.push(await fingerprintProjectTree(extra));
  }

  parts.push(await statToken(geminiService.getDefaultPath()));
  parts.push(await fingerprintProjectTree(geminiService.getDefaultPath()));

  for (const extra of configStore.getGeminiPaths?.() || []) {
    parts.push(await fingerprintProjectTree(extra));
  }

  parts.push(await statToken(CLAUDE_PROJECTS_DIR));
  parts.push(await fingerprintProjectTree(CLAUDE_PROJECTS_DIR));
  for (const extra of configStore.getClaudePaths?.() || []) {
    parts.push(await fingerprintProjectTree(extra));
  }

  const opencodeRoot = path.join(os.homedir(), '.opencode');
  parts.push(await statToken(opencodeRoot));
  parts.push(await fingerprintProjectTree(opencodeRoot));

  return parts.join('::');
}

module.exports = {
  computeLocalFingerprint,
  getConfigSignature,
  fingerprintJsonDir,
  fingerprintProjectTree
};
