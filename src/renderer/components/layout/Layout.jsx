import React from 'react';
import Sidebar from './Sidebar.jsx';
import Header from './Header.jsx';

export default function Layout({ children }) {
  return (
    <div id="app" className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto flex flex-col bg-[#F5F5F0] dark:bg-background-dark">
        <Header />
        <div className="flex-1 p-8">{children}</div>
      </main>
    </div>
  );
}
