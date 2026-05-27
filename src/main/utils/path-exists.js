const fsPromises = require('fs').promises;

/**
 * Non-blocking existence check (replaces fs.existsSync in hot paths).
 * @param {string} targetPath
 * @returns {Promise<boolean>}
 */
async function pathExists(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    return false;
  }
  try {
    await fsPromises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string[]} paths
 * @returns {Promise<boolean>}
 */
async function pathExistsAny(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return false;
  }
  for (const p of paths) {
    if (await pathExists(p)) {
      return true;
    }
  }
  return false;
}

module.exports = { pathExists, pathExistsAny };
