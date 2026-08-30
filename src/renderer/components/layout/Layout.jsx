import React from 'react';
import Sidebar from './Sidebar.jsx';
import Header from './Header.jsx';
import BottomNav from './BottomNav.jsx';

export default function Layout({ children, fixedHeight }) {
  const overflowClass = fixedHeight ? 'overflow-hidden' : 'overflow-y-auto';

  return (
    <div id="app" className="flex h-screen overflow-hidden">
      <div className="hidden md:flex h-full flex-shrink-0">
        <Sidebar />
      </div>
      <main className={`flex-1 ${overflowClass} flex flex-col bg-[#F5F5F0] dark:bg-background-dark`}>
        <Header />
        <div className={`flex-1 p-4 pb-24 md:p-8 md:pb-8 ${fixedHeight ? 'overflow-hidden' : ''}`}>{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
