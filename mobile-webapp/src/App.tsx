/**
 * RTS Agents Mobile PWA
 * Main Application Component
 */

import { AppProvider, useApp } from './store/AppContext';
import { Layout } from './components';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import ComputersList from './components/ComputersList';
import BranchesView from './components/BranchesView';
import PullRequestsView from './components/PullRequestsView';
import JiraView from './components/JiraView';
import AgentView from './components/AgentView';
import AgentModal from './components/AgentModal';
import NewTaskModal from './components/NewTaskModal';
import './index.css';

function AppContent() {
  const { state } = useApp();

  const renderView = () => {
    switch (state.currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'settings':
        return <Settings />;
      case 'computers':
        return <ComputersList />;
      case 'branches':
        return <BranchesView />;
      case 'pull-requests':
        return <PullRequestsView />;
      case 'jira':
        return <JiraView />;
      case 'agent':
        return <AgentView />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <>
      <Layout>
        {renderView()}
      </Layout>
      <AgentModal />
      <NewTaskModal />
    </>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
