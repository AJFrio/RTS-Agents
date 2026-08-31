const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveProjectRoot, clearProjectRootCache } = require('../../src/main/utils/project-root');

let tmp;

function mk(...segments) {
  const dir = path.join(tmp, ...segments);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function touch(dir, name) {
  fs.writeFileSync(path.join(dir, name), '');
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proot-'));
  clearProjectRootCache();
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('resolveProjectRoot', () => {
  test('returns the directory containing .git', () => {
    const repo = mk('repo');
    fs.mkdirSync(path.join(repo, '.git'));
    const nested = mk('repo', 'src', 'deep');

    expect(resolveProjectRoot(nested)).toBe(repo);
  });

  test('prefers the git root over a nearer package manifest', () => {
    const repo = mk('repo');
    fs.mkdirSync(path.join(repo, '.git'));
    const pkg = mk('repo', 'packages', 'web');
    touch(pkg, 'package.json');

    expect(resolveProjectRoot(pkg)).toBe(repo);
  });

  test('falls back to a project manifest when there is no git repo', () => {
    const root = mk('mono');
    touch(root, 'package.json');
    const pkg = mk('mono', 'packages', 'generation');
    touch(pkg, 'package.json');

    // Climbing past packages/ merges monorepo packages into one project.
    expect(resolveProjectRoot(pkg)).toBe(root);
  });

  test('climbs past every recognised monorepo container', () => {
    for (const container of ['packages', 'apps', 'services', 'libs', 'crates']) {
      clearProjectRootCache();
      const root = mk(container + '-root');
      touch(root, 'package.json');
      const child = mk(container + '-root', container, 'thing');
      touch(child, 'package.json');

      expect(resolveProjectRoot(child)).toBe(root);
    }
  });

  test('recognises non-JS manifests', () => {
    for (const manifest of ['pyproject.toml', 'Cargo.toml', 'go.mod']) {
      clearProjectRootCache();
      const root = mk(`m-${manifest}`);
      touch(root, manifest);
      const nested = mk(`m-${manifest}`, 'src');

      expect(resolveProjectRoot(nested)).toBe(root);
    }
  });

  test('returns null when nothing identifies a project', () => {
    const bare = mk('bare', 'nested');
    expect(resolveProjectRoot(bare)).toBeNull();
  });

  test('returns null for missing or non-string input', () => {
    expect(resolveProjectRoot(null)).toBeNull();
    expect(resolveProjectRoot('')).toBeNull();
    expect(resolveProjectRoot(42)).toBeNull();
  });

  test('caches repeated lookups', () => {
    const repo = mk('cached');
    fs.mkdirSync(path.join(repo, '.git'));
    const nested = mk('cached', 'a', 'b');

    expect(resolveProjectRoot(nested)).toBe(repo);
    // Remove the marker; a cached answer must not re-probe the filesystem.
    fs.rmSync(path.join(repo, '.git'), { recursive: true });
    expect(resolveProjectRoot(nested)).toBe(repo);

    clearProjectRootCache();
    expect(resolveProjectRoot(nested)).toBeNull();
  });

  test('does not escape into the filesystem root', () => {
    // A path under a temp dir with no markers anywhere must terminate.
    expect(resolveProjectRoot(mk('x', 'y', 'z'))).toBeNull();
  });
});
