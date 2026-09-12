import React, { useEffect } from 'react';
import { useAppActions, useAppState } from '../../context/AppContext.jsx';
import { useBelowMd } from '../../hooks/use-media-query.js';
import Sidebar from './Sidebar.jsx';

/**
 * Mobile navigation drawer. Replaces the old bottom bar + More sheet so
 * every sidebar destination (and Repos/Agents) is reachable below 768px.
 */
export default function MobileSidebar() {
  const { mobileSidebarOpen } = useAppState();
  const { setMobileSidebarOpen } = useAppActions();
  const belowMd = useBelowMd();

  useEffect(() => {
    if (!belowMd && mobileSidebarOpen) setMobileSidebarOpen(false);
  }, [belowMd, mobileSidebarOpen, setMobileSidebarOpen]);

  useEffect(() => {
    if (!belowMd || !mobileSidebarOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMobileSidebarOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const closeButton = document.getElementById('mobile-nav-close');
    closeButton?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      document.getElementById('mobile-nav-toggle')?.focus();
    };
  }, [belowMd, mobileSidebarOpen, setMobileSidebarOpen]);

  if (!belowMd || !mobileSidebarOpen) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        className="fixed inset-0 z-30 bg-black/50 md:hidden"
        onClick={() => setMobileSidebarOpen(false)}
      />
      <div
        id="mobile-sidebar-drawer"
        className="mobile-sidebar-panel safe-left fixed inset-y-0 left-0 z-40 w-[min(20rem,86vw)] md:hidden"
      >
        <Sidebar variant="drawer" />
      </div>
    </>
  );
}
