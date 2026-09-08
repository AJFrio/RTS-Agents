/**
 * Repo identity grouping contract tests (Node-native, ESM).
 *
 * Usage: node tests/unit/repo-identity.verify.mjs
 */
import assert from 'node:assert/strict';
import {
  parseRepoIdentity,
  groupTasksByRepo,
  repoGroupKey,
  resolveAgentRepoIdentity,
  slugifyRepoName,
  isFilesystemPath,
  NO_REPO_KEY,
} from '../../src/renderer/utils/repo-identity.js';

const TESTS = [];
function test(name, fn) {
  TESTS.push({ name, fn });
}

test('slugify folds case, spaces, underscores, and .git', () => {
  assert.equal(slugifyRepoName('Open Shop'), 'open-shop');
  assert.equal(slugifyRepoName('open_shop.git'), 'open-shop');
  assert.equal(slugifyRepoName('Open-Shop'), 'open-shop');
});

test('parses local Windows and POSIX paths', () => {
  const win = parseRepoIdentity('D:\\GitHub\\Open Shop');
  assert.equal(win.kind, 'local');
  assert.equal(win.slug, 'open-shop');
  assert.equal(win.displayName, 'Open Shop');
  assert.equal(win.localPath, 'D:/GitHub/Open Shop');

  const posix = parseRepoIdentity('/home/ajfrio/src/open-shop');
  assert.equal(posix.kind, 'local');
  assert.equal(posix.slug, 'open-shop');
});

test('parses GitHub https, ssh, and owner/repo', () => {
  const https = parseRepoIdentity('https://github.com/AJFrio/open-shop.git');
  assert.equal(https.kind, 'remote');
  assert.equal(https.remote, 'github.com/ajfrio/open-shop');
  assert.equal(https.slug, 'open-shop');

  const ssh = parseRepoIdentity('git@github.com:AJFrio/open-shop.git');
  assert.equal(ssh.remote, 'github.com/ajfrio/open-shop');

  const short = parseRepoIdentity('AJFrio/open-shop');
  assert.equal(short.remote, 'github.com/ajfrio/open-shop');
});

test('isFilesystemPath distinguishes paths from remotes', () => {
  assert.equal(isFilesystemPath('C:\\GitHub\\app'), true);
  assert.equal(isFilesystemPath('/tmp/app'), true);
  assert.equal(isFilesystemPath('https://github.com/a/b'), false);
  assert.equal(isFilesystemPath('git@github.com:a/b.git'), false);
  assert.equal(isFilesystemPath('a/b'), false);
});

test('merges local folder and Cursor cloud URL for the same repo', () => {
  const groups = groupTasksByRepo([
    {
      id: 'local-1',
      provider: 'claude-cli',
      status: 'running',
      repository: 'D:\\GitHub\\Open Shop',
      name: 'Local task',
    },
    {
      id: 'cloud-1',
      provider: 'cursor',
      status: 'running',
      repository: 'https://github.com/ajfrio/open-shop',
      name: 'Cloud task',
    },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, 'open-shop');
  assert.equal(groups[0].tasks.length, 2);
  assert.equal(groups[0].label, 'Open Shop');
});

test('uses git repoRemote when the local folder name differs', () => {
  const groups = groupTasksByRepo([
    {
      id: 'local-1',
      provider: 'codex',
      status: 'running',
      repository: '/tmp/workspace',
      repoRemote: 'github.com/ajfrio/open-shop',
    },
    {
      id: 'cloud-1',
      provider: 'cursor',
      status: 'running',
      repository: 'https://github.com/ajfrio/open-shop',
    },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, 'open-shop');
  assert.equal(groups[0].tasks.length, 2);
});

test('keeps two GitHub remotes with the same repo name separate', () => {
  const groups = groupTasksByRepo([
    { id: 'a', repository: 'https://github.com/alice/app' },
    { id: 'b', repository: 'https://github.com/bob/app' },
  ]);
  assert.equal(groups.length, 2);
  const keys = groups.map((g) => g.key).sort();
  assert.deepEqual(keys, ['github.com/alice/app', 'github.com/bob/app']);
});

test('empty repository groups under No repository', () => {
  const groups = groupTasksByRepo([{ id: 'x', repository: '' }]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, NO_REPO_KEY);
});

test('repoGroupKey attaches a local slug to a unique remote', () => {
  const identity = resolveAgentRepoIdentity({
    repository: '/Users/me/src/Open Shop',
  });
  const slugRemotes = new Map([['open-shop', new Set(['github.com/ajfrio/open-shop'])]]);
  assert.equal(repoGroupKey(identity, slugRemotes), 'open-shop');
});

let failed = 0;
for (const { name, fn } of TESTS) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(err && err.stack ? err.stack : err);
  }
}

console.log(`\n${TESTS.length - failed}/${TESTS.length} passed`);
if (failed) process.exit(1);
