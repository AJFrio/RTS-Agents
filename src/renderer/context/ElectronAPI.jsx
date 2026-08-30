import { useMemo } from 'react';
import { isWebRuntime } from '../platform/is-web.mjs';
import { createWebApi } from '../platform/web-api.mjs';

/**
 * Returns the platform API for the current runtime, in precedence order:
 *   1. window.__electronAPI — injected by Playwright/e2e test mocks
 *   2. window.electronAPI   — real Electron preload bridge
 *   3. web adapter          — browser runtime (Cloudflare Worker build)
 *
 * Use this in components that need to call main process via IPC (desktop) or
 * the web adapter (browser).
 */
export function useElectronAPI() {
  return useMemo(() => {
    if (typeof window === 'undefined') return null;
    if (window.__electronAPI) return window.__electronAPI;
    if (window.electronAPI) return window.electronAPI;
    if (isWebRuntime()) return createWebApi();
    return null;
  }, []);
}

export default useElectronAPI;
