const fs = require('fs');
const path = require('path');

/**
 * Scan directories for subdirectories matching a predicate
 * @param {string[]} directories - Base directories to scan
 * @param {function(fs.Dirent, string): any} predicate - Function that returns a value if the directory matches, or null/undefined
 * @returns {any[]} Array of results returned by predicate (excluding null/undefined)
 */
function scanDirectories(directories, predicate) {
  const results = [];
  // Use a Set to avoid scanning the same directory multiple times if passed in duplicates
  const scannedDirs = new Set();

  for (const baseDir of directories) {
    if (!baseDir || typeof baseDir !== 'string') continue;

    // Normalize path to avoid duplicates
    const normalizedBase = path.resolve(baseDir);
    if (scannedDirs.has(normalizedBase)) continue;
    scannedDirs.add(normalizedBase);

    if (!fs.existsSync(normalizedBase)) continue;

    try {
      const entries = fs.readdirSync(normalizedBase, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(normalizedBase, entry.name);
          const result = predicate(entry, fullPath);
          if (result) {
            results.push(result);
          }
        }
      }
    } catch (err) {
      // Ignore errors (permission denied, etc)
    }
  }

  return results;
}

module.exports = {
  scanDirectories
};
