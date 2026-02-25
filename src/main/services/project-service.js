const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { exec } = require('child_process');
const { scanDirectories } = require('../utils/file-utils');

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

    return scanDirectories(paths, {
      shouldSkip: (name) => name.startsWith('.') || name === 'node_modules',
      checkFn: (projectPath, entryName) => {
        const gitPath = path.join(projectPath, '.git');
        return fs.existsSync(gitPath) ? true : null;
      },
      mapFn: (projectPath, entryName) => ({
        id: entryName,
        name: entryName,
        path: projectPath,
        geminiPath: null,
        displayName: entryName,
        hasExistingSessions: false
      })
    });
  }

  async getRepoFile(repoPath, fileName) {
    if (!repoPath || typeof repoPath !== 'string') throw new Error('Missing repository path');
    if (!fileName || typeof fileName !== 'string') throw new Error('Missing file name');

    // Security check: ensure fileName doesn't contain directory traversal
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      throw new Error('Invalid file name');
    }

    const filePath = path.join(repoPath, fileName);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = await fsp.readFile(filePath, 'utf8');
      return content;
    } catch (err) {
      console.error(`Error reading file ${filePath}:`, err);
      return null;
    }
  }

  async pullRepo(repoPath) {
    if (!repoPath || typeof repoPath !== 'string') throw new Error('Missing repository path');
    if (!fs.existsSync(repoPath)) throw new Error(`Repository path does not exist: ${repoPath}`);

    const gitDir = path.join(repoPath, '.git');
    if (!fs.existsSync(gitDir)) throw new Error(`Not a git repository: ${repoPath}`);

    // Check remote URL to understand authentication requirements
    let remoteUrl = null;
    try {
      const remoteResult = await this.execAsync('git config --get remote.origin.url', { cwd: repoPath });
      remoteUrl = remoteResult.stdout.trim();
      console.log(`Remote URL: ${remoteUrl}`);
    } catch (err) {
      console.log('Could not determine remote URL:', err.message);
    }

    // Check credential helper configuration
    let credentialHelper = null;
    try {
      const helperResult = await this.execAsync('git config --get credential.helper', { cwd: repoPath });
      credentialHelper = helperResult.stdout.trim();
      console.log(`Credential Helper (repo): ${credentialHelper || '(not set)'}`);
    } catch (err) {
      // Not set at repo level, check global
      try {
        const globalHelperResult = await this.execAsync('git config --global --get credential.helper', { cwd: repoPath });
        credentialHelper = globalHelperResult.stdout.trim();
        console.log(`Credential Helper (global): ${credentialHelper || '(not set)'}`);
      } catch (err2) {
        console.log('Credential Helper: (not configured)');
      }
    }

    // Log execution details
    console.log('=== Git Pull Execution Details ===');
    console.log(`Platform: ${process.platform}`);
    console.log(`Repository Path: ${repoPath}`);
    console.log(`Working Directory (cwd): ${repoPath}`);
    console.log(`Command: git pull`);
    console.log(`Remote URL: ${remoteUrl || '(unknown)'}`);
    console.log(`Credential Helper: ${credentialHelper || '(default)'}`);

    // Use exec with cwd option, same approach as performUpdate in main.js
    // On Windows, ensure we use Windows Credential Manager if credential helper is problematic
    return new Promise((resolve, reject) => {
      let command = 'git pull';
      
      // On Windows with HTTPS, always use Windows Credential Manager
      // This prevents git from trying to use bash-based credential helpers that fail in Electron
      if (process.platform === 'win32' && remoteUrl && remoteUrl.startsWith('https://')) {
        // 'manager' is the modern Git for Windows credential helper that works in Electron
        // This overrides any problematic credential helper config for this command only
        command = `git -c credential.helper=manager pull`;
        console.log(`Using Windows Credential Manager (manager) for HTTPS remote`);
      }
      
      const options = { 
        cwd: repoPath
      };
      
      console.log(`Executing: ${command} in directory: ${repoPath}`);
      
      exec(command, options, (error, stdout, stderr) => {
        if (error) {
          console.error('=== Pull Failed ===');
          console.error(`Error Code: ${error.code}`);
          console.error(`Error Signal: ${error.signal}`);
          console.error(`Error Message: ${error.message}`);
          console.error(`Stdout: ${stdout || '(empty)'}`);
          console.error(`Stderr: ${stderr || '(empty)'}`);
          
          // Provide helpful error message for authentication issues
          if (stderr && (stderr.includes('could not read Username') || stderr.includes('Authentication failed'))) {
            const authError = `Git authentication required. Please configure credentials for this repository.\n\n` +
              `Options:\n` +
              `1. Use SSH instead of HTTPS: git remote set-url origin git@github.com:user/repo.git\n` +
              `2. Configure Windows Credential Manager: git config --global credential.helper wincred\n` +
              `3. Use a Personal Access Token in the URL: git remote set-url origin https://token@github.com/user/repo.git\n\n` +
              `Original error: ${stderr}`;
            reject(new Error(authError));
            return;
          }
          
          reject(new Error(stderr || stdout || error.message));
          return;
        }

        console.log('=== Pull Succeeded ===');
        console.log(`Stdout: ${stdout || '(empty)'}`);
        if (stderr) console.log(`Stderr: ${stderr}`);

        resolve(repoPath);
      });
    });
  }
}

module.exports = new ProjectService();
