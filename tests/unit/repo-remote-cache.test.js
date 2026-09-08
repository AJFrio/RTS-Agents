const { RepoRemoteCache } = require('../../src/main/services/repo-remote-cache');
const { canonicalizeGitRemote, isFilesystemPath } = require('../../src/main/utils/repo-identity');

describe('repo-remote-cache', () => {
  test('canonicalizeGitRemote normalizes https and ssh', () => {
    expect(canonicalizeGitRemote('https://github.com/AJFrio/open-shop.git')).toBe(
      'github.com/ajfrio/open-shop'
    );
    expect(canonicalizeGitRemote('git@github.com:AJFrio/open-shop.git')).toBe(
      'github.com/ajfrio/open-shop'
    );
    expect(isFilesystemPath('D:\\GitHub\\Open Shop')).toBe(true);
    expect(isFilesystemPath('https://github.com/a/b')).toBe(false);
  });

  test('applyToAgents stamps cached remotes onto local paths', () => {
    const cache = new RepoRemoteCache();
    cache.set('D:\\GitHub\\Open Shop', 'https://github.com/ajfrio/open-shop.git');
    const agents = cache.applyToAgents([
      { id: '1', repository: 'D:\\GitHub\\Open Shop' },
      { id: '2', repository: 'https://github.com/ajfrio/other' },
    ]);
    expect(agents[0].repoRemote).toBe('github.com/ajfrio/open-shop');
    expect(agents[1].repoRemote).toBeUndefined();
  });

  test('refreshMissing looks up origin once and caches it', async () => {
    const cache = new RepoRemoteCache();
    const exec = jest.fn((file, args, opts, cb) => {
      cb(null, 'git@github.com:ajfrio/open-shop.git\n', '');
    });
    const agents = [{ id: '1', repository: '/tmp/open-shop' }];
    const changed = await cache.refreshMissing(agents, exec);
    expect(changed).toBe(true);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(cache.get('/tmp/open-shop')).toBe('github.com/ajfrio/open-shop');

    exec.mockClear();
    const again = await cache.refreshMissing(agents, exec);
    expect(again).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  test('failed git lookups are not retried this process', async () => {
    const cache = new RepoRemoteCache();
    const exec = jest.fn((file, args, opts, cb) => {
      cb(new Error('not a git repo'));
    });
    await cache.refreshMissing([{ id: '1', repository: '/tmp/not-git' }], exec);
    expect(exec).toHaveBeenCalledTimes(1);
    await cache.refreshMissing([{ id: '1', repository: '/tmp/not-git' }], exec);
    expect(exec).toHaveBeenCalledTimes(1);
  });
});
