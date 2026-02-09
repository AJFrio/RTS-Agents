import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Layout from './components/Layout';
import Dashboard from './views/Dashboard';
import Repositories from './views/Repositories';
import Computers from './views/Computers';
import Jira from './views/Jira';
import Settings from './views/Settings';
import NewTaskModal from './modals/NewTaskModal';
import CreateRepoModal from './modals/CreateRepoModal';
import AgentDetailModal from './modals/AgentDetailModal';
import PrModal from './modals/PrModal';
import JiraIssueModal from './modals/JiraIssueModal';

const MainContent: React.FC = () => {
  const { currentView, refreshAgents, openModal } = useApp();

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard />;
      case 'branches': return <Repositories />;
      case 'computers': return <Computers />;
      case 'jira': return <Jira />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  return (
    <Layout
      onNewTask={() => openModal('newTask')}
      onRefresh={() => refreshAgents()}
    >
      {renderView()}
      <NewTaskModal />
      <CreateRepoModal />
      <AgentDetailModal />
      <PrModal />
      <JiraIssueModal />
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
};

export default App;
