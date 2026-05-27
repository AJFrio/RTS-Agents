import { useCallback } from 'react';

/**
 * GitHub repos and pull-request list loaders.
 */
export function useAppGithub(api, dispatch) {
  const loadBranches = useCallback(async () => {
    if (!api?.github?.getRepos) return;
    dispatch({ type: 'SET_GITHUB', payload: { loadingRepos: true } });
    try {
      const [result, localResult] = await Promise.all([
        api.github.getRepos(),
        api.projects?.getLocalRepos?.()?.catch(() => null) ?? Promise.resolve(null),
      ]);
      const localRepos = localResult?.success ? (localResult.repos ?? []) : [];
      if (result?.success) {
        const repos = result.repos ?? [];
        dispatch({
          type: 'SET_GITHUB',
          payload: { repos, filteredRepos: repos, localRepos, loadingRepos: false },
        });
      } else {
        dispatch({ type: 'SET_GITHUB', payload: { loadingRepos: false } });
      }
    } catch {
      dispatch({ type: 'SET_GITHUB', payload: { loadingRepos: false } });
    }
  }, [api, dispatch]);

  const loadAllPrs = useCallback(async () => {
    if (!api?.github?.getAllPrs) return;
    dispatch({ type: 'SET_ALL_PRS_LOADING', payload: true });
    try {
      const result = await api.github.getAllPrs();
      if (result?.success) {
        dispatch({ type: 'SET_ALL_PRS', payload: result.prs || [] });
      } else {
        dispatch({ type: 'SET_ALL_PRS_ERROR', payload: result?.error || 'Failed to fetch PRs' });
      }
    } catch (err) {
      dispatch({ type: 'SET_ALL_PRS_ERROR', payload: err.message });
    }
  }, [api, dispatch]);

  const removePr = useCallback(
    (id) => {
      dispatch({ type: 'REMOVE_PR', payload: id });
    },
    [dispatch]
  );

  return { loadBranches, loadAllPrs, removePr };
}
