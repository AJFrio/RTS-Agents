const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { exec } = require('child_process');

class ProjectService {
  execAsync(command, options = {}) {
    return new Promise((resolve, reject) => {
      exec(command, options, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || stdout || error.message));
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  }

  async createLocalRepo({ directory, name }) {
    if (!name || typeof name !== 'string') throw new Error('Missing repository name');
    if (!directory || typeof directory !== 'string') throw new Error('Missing base directory');

    const baseDir = directory.trim();
    const repoName = name.trim();
    if (!baseDir) throw new Error('Missing base directory');
    if (!repoName) throw new Error('Missing repository name');

    if (!fs.existsSync(baseDir)) {
      throw new Error(`Base directory does not exist: ${baseDir}`);
    }

    const repoPath = path.join(baseDir, repoName);
    if (fs.existsSync(repoPath)) {
      throw new Error(`Target path already exists: ${repoPath}`);
    }

    await fsp.mkdir(repoPath, { recursive: false });
    await this.execAsync('git init', { cwd: repoPath });

    return repoPath;
  }

  async getLocalRepos(paths) {
    if (!Array.isArray(paths) || paths.length === 0) {
      return [];
    }

    const projects = [];
    const scannedPaths = new Set();

    for (const basePath of paths) {
      if (!fs.existsSync(basePath)) continue;

      try {
        const entries = fs.readdirSync(basePath, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

            const dirPath = path.join(basePath, entry.name);
            const gitPath = path.join(dirPath, '.git');

            if (fs.existsSync(gitPath) && !scannedPaths.has(dirPath)) {
              scannedPaths.add(dirPath);
              projects.push({
                id: entry.name,
                name: entry.name,
                path: dirPath,
                geminiPath: null,
                displayName: entry.name,
                hasExistingSessions: false
              });
            }
          }
        }
      } catch (err) {
        // Ignore error
      }
    }

    return projects;
  }

  async pullRepo(repoPath) {
    if (!repoPath || typeof repoPath !== 'string') throw new Error('Missing repository path');
    if (!fs.existsSync(repoPath)) throw new Error(`Repository path does not exist: ${repoPath}`);

    const gitDir = path.join(repoPath, '.git');
    if (!fs.existsSync(gitDir)) throw new Error(`Not a git repository: ${repoPath}`);

    await this.execAsync('git pull', { cwd: repoPath });
    return repoPath;
  }
}

module.exports = new ProjectService();
