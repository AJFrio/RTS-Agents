import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { useApp } from '../context/AppContext';

interface LayoutProps {
  children: React.ReactNode;
  onNewTask: () => void;
  onRefresh: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, onNewTask, onRefresh }) => {
  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark text-slate-800 dark:text-slate-200">
      <Sidebar />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <Header onNewTask={onNewTask} onRefresh={onRefresh} />
        <main className="flex-1 overflow-y-auto p-8 relative">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
