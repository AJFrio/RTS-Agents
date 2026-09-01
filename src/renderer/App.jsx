import React, { useEffect } from 'react';
import { Toaster } from 'sonner';
import { useApp } from './context/AppContext.jsx';
import { useBelowMd } from './hooks/use-media-query.js';
import Layout from './components/layout/Layout.jsx';
import AgentPage from './pages/AgentPage.jsx';
import NewTaskPage from './pages/NewTaskPage.jsx';
import PluginsPage from './pages/PluginsPage.jsx';
import DevicesPage from './pages/DevicesPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import BranchesPage from './pages/BranchesPage.jsx';
import PullRequestsPage from './pages/PullRequestsPage.jsx';
import JiraPage from './pages/JiraPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import TaskDetailView from './pages/TaskDetailView.jsx';
import CreateRepoModal from './modals/CreateRepoModal.jsx';
import PrModal from './modals/PrModal.jsx';
import PullRequestRepoFilterModal from './modals/PullRequestRepoFilterModal.jsx';
import JiraIssueModal from './modals/JiraIssueModal.jsx';
import ConfirmModal from './modals/ConfirmModal.jsx';
import PastedImageModal from './modals/PastedImageModal.jsx';

const FIXED_HEIGHT_VIEWS = new Set(['agent', 'new-task', 'task-detail', 'branches']);

function App() {
  const {
    state,
    api,
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
      : view === 'new-task'
        ? NewTaskPage
        : view === 'plugins'
          ? PluginsPage
          : view === 'devices'
            ? DevicesPage
            : view === 'task-detail'
              ? TaskDetailView
              : view === 'branches'
                ? BranchesPage
                : view === 'pull-requests'
                  ? PullRequestsPage
                  : view === 'jira'
                    ? JiraPage
                    : view === 'settings'
                      ? SettingsPage
                      : DashboardPage;

  return (
    <>
      <Layout fixedHeight={FIXED_HEIGHT_VIEWS.has(view)}>
        <Page key={view === 'new-task' ? `new-task-${state.newTask?.newTaskLaunchId || 0}` : view} />
      </Layout>
      <CreateRepoModal open={state.createRepoModalOpen} onClose={closeCreateRepoModal} api={api} />
      <PrModal pr={state.prModal} onClose={closePrModal} api={api} />
      <PullRequestRepoFilterModal
        open={state.github.prRepoFilterOpen}
        onClose={closePrRepoFilter}
      />
      <JiraIssueModal issue={state.jiraIssueModal} onClose={closeJiraIssueModal} api={api} />
      <ConfirmModal config={state.confirmModal} onClose={closeConfirmModal} />
      <PastedImageModal imageUrl={state.pastedImageModal} onClose={closePastedImageModal} />
      <AppToaster theme={toastTheme} />
    </>
  );
}

function AppToaster({ theme }) {
  const belowMd = useBelowMd();
  return (
    <Toaster
      position={belowMd ? 'top-center' : 'bottom-right'}
      richColors
      theme={theme}
      offset={belowMd ? 12 : 16}
    />
  );
}

export default App;
