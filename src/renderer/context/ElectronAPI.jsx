import { useMemo } from 'react';

/**
 * Returns window.electronAPI (from preload) or window.__electronAPI (for tests).
 * Use this in components that need to call main process via IPC.
 */
export function useElectronAPI() {
  return useMemo(() => {
    return typeof window !== 'undefined' ? (window.__electronAPI || window.electronAPI) : null;
  }, []);
}

export default useElectronAPI;
