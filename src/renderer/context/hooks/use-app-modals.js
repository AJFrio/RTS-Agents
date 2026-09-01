import { useMemo } from 'react';

/**
 * Modal open/close helpers and view navigation.
 */
export function useAppModals(dispatch) {
  return useMemo(
    () => ({
      setView: (view) => dispatch({ type: 'SET_VIEW', payload: view }),
      openTask: (agent) => dispatch({ type: 'OPEN_TASK', payload: agent }),
      closeTask: () => dispatch({ type: 'CLOSE_TASK' }),
      setSidebarWidth: (width) => dispatch({ type: 'SET_SIDEBAR_WIDTH', payload: width }),
      setSidebarMode: (mode) => dispatch({ type: 'SET_SIDEBAR_MODE', payload: mode }),
      openNewTaskModal: (options) => {
        dispatch({ type: 'OPEN_NEW_TASK_MODAL', payload: options });
        dispatch({ type: 'SET_VIEW', payload: 'new-task' });
      },
      closeNewTaskModal: () => dispatch({ type: 'CLOSE_NEW_TASK_MODAL' }),
      openCreateRepoModal: () => dispatch({ type: 'OPEN_CREATE_REPO_MODAL' }),
      closeCreateRepoModal: () => dispatch({ type: 'CLOSE_CREATE_REPO_MODAL' }),
      openPrModal: (pr) => dispatch({ type: 'OPEN_PR_MODAL', payload: pr }),
      closePrModal: () => dispatch({ type: 'CLOSE_PR_MODAL' }),
      openPrRepoFilter: () => dispatch({ type: 'OPEN_PR_REPO_FILTER' }),
      closePrRepoFilter: () => dispatch({ type: 'CLOSE_PR_REPO_FILTER' }),
      openConfirmModal: (config) => dispatch({ type: 'OPEN_CONFIRM_MODAL', payload: config }),
      closeConfirmModal: () => dispatch({ type: 'CLOSE_CONFIRM_MODAL' }),
      openJiraIssueModal: (issue) => dispatch({ type: 'OPEN_JIRA_ISSUE_MODAL', payload: issue }),
      closeJiraIssueModal: () => dispatch({ type: 'CLOSE_JIRA_ISSUE_MODAL' }),
      openPastedImageModal: (imageUrl) =>
        dispatch({ type: 'OPEN_PASTED_IMAGE_MODAL', payload: imageUrl }),
      closePastedImageModal: () => dispatch({ type: 'CLOSE_PASTED_IMAGE_MODAL' }),
    }),
    [dispatch]
  );
}
