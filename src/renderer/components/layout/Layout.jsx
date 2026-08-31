import React, { useCallback, useEffect, useRef } from 'react';
import Sidebar from './Sidebar.jsx';
import Header from './Header.jsx';
import BottomNav from './BottomNav.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { SIDEBAR_DEFAULT_WIDTH } from '../../context/app-state.js';

/**
 * fixed-sidenav-shell (DESIGN.md §4): the sidebar is a fixed region whose
 * width is drag-resizable (200px → 1/3 viewport); the canvas owns its own
 * scroll per view. Only the sidebar section list and the canvas body scroll.
 */
export default function Layout({ children, fixedHeight }) {
  const { state, setSidebarWidth } = useApp();
  const dragState = useRef(null);
  const handleRef = useRef(null);

  const onPointerDown = useCallback(
    (e) => {
      dragState.current = {
        startX: e.clientX,
        startWidth: state.sidebarWidth,
      };
      handleRef.current?.setPointerCapture(e.pointerId);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [state.sidebarWidth]
  );

  const onPointerMove = useCallback(
    (e) => {
      if (!dragState.current) return;
      const { startX, startWidth } = dragState.current;
      setSidebarWidth(startWidth + (e.clientX - startX));
    },
    [setSidebarWidth]
  );

  const endDrag = useCallback(() => {
    if (!dragState.current) return;
    dragState.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => endDrag, [endDrag]);

  const onHandleDoubleClick = useCallback(() => {
    setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
  }, [setSidebarWidth]);

  const overflowClass = fixedHeight ? 'overflow-hidden' : 'overflow-y-auto';

  return (
    <div id="app" className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
      <div
        className="hidden h-full shrink-0 md:flex"
        style={{ width: state.sidebarWidth }}
      >
        <Sidebar />
      </div>
      <div
        ref={handleRef}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onHandleDoubleClick}
        className="group relative hidden w-px shrink-0 cursor-col-resize bg-border-light transition-colors hover:bg-neutral-400 dark:bg-border-dark dark:hover:bg-neutral-500 md:block"
      >
        <span className="absolute inset-y-0 -left-1 -right-1" aria-hidden="true" />
      </div>
      <main className="flex min-w-0 flex-1 flex-col bg-background-light dark:bg-background-dark">
        <Header />
        <div
          className={`min-h-0 flex-1 ${overflowClass} ${
            fixedHeight ? '' : 'p-4 pb-24 md:p-6 md:pb-6'
          }`}
        >
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
