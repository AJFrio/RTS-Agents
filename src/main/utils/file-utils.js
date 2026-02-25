const fs = require('fs');
const path = require('path');

/**
 * Scan directories for projects matching criteria
 * @param {string[]} basePaths - List of base directories to scan
 * @param {object} options - Options for scanning
 * @param {function} options.checkFn - Function that takes (projectPath, entryName) and returns truthy if it's a project. Can return an object with extra data.
 * @param {function} options.mapFn - Function that takes (projectPath, entryName, checkResult) and returns the project object.
 * @param {function} [options.shouldSkip] - Function that takes (entryName) and returns true if the directory should be skipped.
 * @returns {Array} List of found projects
 */
function scanDirectories(basePaths, options = {}) {
  const {
    checkFn,
    mapFn,
    shouldSkip = (name) => ['bin', 'cache', 'tmp', 'node_modules'].includes(name) || name.startsWith('.')
  } = options;

  const results = [];
  const scannedPaths = new Set();

  // Normalize basePaths and remove duplicates
  const uniqueBasePaths = [...new Set(basePaths)];

  for (const basePath of uniqueBasePaths) {
    if (!basePath || !fs.existsSync(basePath)) {
      continue;
    }

    try {
      const entries = fs.readdirSync(basePath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (shouldSkip(entry.name)) continue;

        const projectPath = path.join(basePath, entry.name);

        // Avoid duplicates if multiple base paths point to same structure or same path added twice
        if (scannedPaths.has(projectPath)) continue;

        const checkResult = checkFn(projectPath, entry.name);
        if (checkResult) {
          scannedPaths.add(projectPath);
          results.push(mapFn(projectPath, entry.name, checkResult));
        }
      }
    } catch (err) {
      // Ignore errors accessing directory
    }
  }

  return results;
}

module.exports = { scanDirectories };
