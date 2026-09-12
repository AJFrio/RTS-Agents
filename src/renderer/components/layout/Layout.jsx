import React, { useCallback, useEffect, useRef } from 'react';
import Sidebar from './Sidebar.jsx';
import Header from './Header.jsx';
import MobileSidebar from './MobileSidebar.jsx';
import { useAppActions, useAppState } from '../../context/AppContext.jsx';
import { SIDEBAR_DEFAULT_WIDTH } from '../../context/app-state.js';
import { useBelowMd } from '../../hooks/use-media-query.js';

/**
 * fixed-sidenav-shell (DESIGN.md §4): the sidebar is a fixed region whose
 * width is drag-resizable (200px → 1/3 viewport); the canvas owns its own
 * scroll per view. Only the sidebar section list and the canvas body scroll.
 * Below 768px the sidebar becomes an overlay drawer opened from the header.
 */
export default function Layout({ children, fixedHeight }) {
  const { sidebarWidth } = useAppState();
  const { setSidebarWidth } = useAppActions();
  const belowMd = useBelowMd();
  const dragState = useRef(null);
  const handleRef = useRef(null);

  const onPointerDown = useCallback(
    (e) => {
      dragState.current = {
        startX: e.clientX,
        startWidth: sidebarWidth,
      };
      handleRef.current?.setPointerCapture(e.pointerId);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [sidebarWidth]
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
    <div
      id="app"
      className="safe-left safe-right flex h-dvh overflow-hidden bg-background-light dark:bg-background-dark"
    >
      {!belowMd && (
        <>
          <div className="flex h-full shrink-0" style={{ width: sidebarWidth }}>
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
            className="group relative w-px shrink-0 cursor-col-resize bg-border-light transition-colors hover:bg-neutral-400 dark:bg-border-dark dark:hover:bg-neutral-500"
          >
            <span className="absolute inset-y-0 -left-1 -right-1" aria-hidden="true" />
          </div>
        </>
      )}
      <main className="safe-bottom flex min-w-0 flex-1 flex-col bg-background-light dark:bg-background-dark">
        <Header />
        <div className={`min-h-0 flex-1 ${overflowClass} ${fixedHeight ? '' : 'p-4 md:p-6'}`}>
          {children}
        </div>
      </main>
      <MobileSidebar />
    </div>
  );
}
