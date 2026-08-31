/**
 * Resolve the project a working directory belongs to.
 *
 * Agent sessions record the directory they ran in, but that directory is
 * often a subpackage rather than the project a person thinks in. Grouping on
 * the raw path splits one project into several entries — a monorepo's
 * `packages/generation` and `packages/grading` read as unrelated.
 *
 * The rule, in order:
 *   1. A `.git` directory wins. It is the least ambiguous project boundary.
 *   2. Otherwise the nearest ancestor holding a project manifest. Not every
 *      project is a git repo, and those still need grouping.
 *   3. While climbing, step over monorepo container directories so a package
 *      resolves to the workspace root rather than to itself.
 *
 * Returns null when nothing identifies a project; callers decide what an
 * unlocatable session should look like.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_MANIFESTS = [
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'Gemfile',
];

// Directories that hold sibling packages rather than being projects themselves.
const MONOREPO_CONTAINERS = new Set(['packages', 'apps', 'services', 'libs', 'crates']);

// Depth guard: a symlink loop or pathological path must not spin forever.
const MAX_DEPTH = 40;

// Resolution touches the filesystem, and a dashboard regroups on every
// refresh. The answer only changes when a repo is created or moved.
const cache = new Map();

function exists(candidate) {
  try {
    return fs.existsSync(candidate);
  } catch {
    // Permission denied on an ancestor is not an error worth propagating;
    // it just means this directory cannot be the project root.
    return false;
  }
}

/**
 * @param {string} dirPath - Directory an agent session ran in.
 * @returns {string|null} Absolute project root, or null when unidentifiable.
 */
function resolveProjectRoot(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') return null;
  if (cache.has(dirPath)) return cache.get(dirPath);

  let current = dirPath;
  let manifestRoot = null;

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const parent = path.dirname(current);
    if (!current || current === parent) break;

    if (exists(path.join(current, '.git'))) {
      cache.set(dirPath, current);
      return current;
    }

    // Keep the highest manifest seen: a workspace root beats a package that
    // also carries its own package.json.
    if (PROJECT_MANIFESTS.some((manifest) => exists(path.join(current, manifest)))) {
      manifestRoot = current;
    }

    // `packages/web` -> skip `packages` and continue from the workspace root,
    // so a package never resolves to its own container.
    current = MONOREPO_CONTAINERS.has(path.basename(parent)) ? path.dirname(parent) : parent;
  }

  cache.set(dirPath, manifestRoot);
  return manifestRoot;
}

/** Drop memoized results. Exposed for tests and for a manual rescan. */
function clearProjectRootCache() {
  cache.clear();
}

module.exports = {
  MONOREPO_CONTAINERS,
  PROJECT_MANIFESTS,
  resolveProjectRoot,
  clearProjectRootCache,
};
