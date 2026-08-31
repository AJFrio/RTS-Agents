import React, { useEffect } from 'react';
import { Toaster } from 'sonner';
import { useApp } from './context/AppContext.jsx';
import Layout from './components/layout/Layout.jsx';
import AgentPage from './pages/AgentPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import BranchesPage from './pages/BranchesPage.jsx';
import PullRequestsPage from './pages/PullRequestsPage.jsx';
import ComputersPage from './pages/ComputersPage.jsx';
import JiraPage from './pages/JiraPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import AgentModal from './modals/AgentModal.jsx';
import NewTaskModal from './modals/NewTaskModal.jsx';
import CreateRepoModal from './modals/CreateRepoModal.jsx';
import PrModal from './modals/PrModal.jsx';
import PullRequestRepoFilterModal from './modals/PullRequestRepoFilterModal.jsx';
import JiraIssueModal from './modals/JiraIssueModal.jsx';
import ConfirmModal from './modals/ConfirmModal.jsx';
import PastedImageModal from './modals/PastedImageModal.jsx';

function App() {
  const {
    state,
    api,
    closeAgentModal,
    closeNewTaskModal,
    closeCreateRepoModal,
    closePrModal,
    closePrRepoFilter,
    closeConfirmModal,
    closeJiraIssueModal,
    closePastedImageModal,
  } = useApp();
  const view = state.currentView;
  const toastTheme = ['light', 'dark'].includes(state.settings?.theme)
    ? state.settings.theme
    : 'system';

  useEffect(() => {
    const theme = state.settings?.theme || 'system';
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else if (theme === 'light') root.classList.remove('dark');
    else {
      const m = window.matchMedia('(prefers-color-scheme: dark)');
      root.classList.toggle('dark', m.matches);
    }
  }, [state.settings?.theme]);

  const Page =
    view === 'agent'
      ? AgentPage
      : view === 'dashboard'
        ? DashboardPage
        : view === 'branches'
          ? BranchesPage
          : view === 'pull-requests'
            ? PullRequestsPage
            : view === 'computers'
              ? ComputersPage
              : view === 'jira'
                ? JiraPage
                : view === 'settings'
                  ? SettingsPage
                  : DashboardPage;

  return (
    <>
      <Layout fixedHeight={view === 'branches' || view === 'agent'}>
        <Page />
      </Layout>
      <AgentModal agent={state.agentModal} onClose={closeAgentModal} api={api} />
      <NewTaskModal open={state.newTaskModalOpen} onClose={closeNewTaskModal} api={api} />
      <CreateRepoModal open={state.createRepoModalOpen} onClose={closeCreateRepoModal} api={api} />
      <PrModal pr={state.prModal} onClose={closePrModal} api={api} />
      <PullRequestRepoFilterModal
        open={state.github.prRepoFilterOpen}
        onClose={closePrRepoFilter}
      />
      <JiraIssueModal issue={state.jiraIssueModal} onClose={closeJiraIssueModal} api={api} />
      <ConfirmModal config={state.confirmModal} onClose={closeConfirmModal} />
      <PastedImageModal imageUrl={state.pastedImageModal} onClose={closePastedImageModal} />
      <Toaster position="bottom-left" richColors theme={toastTheme} />
    </>
  );
}

export default App;
