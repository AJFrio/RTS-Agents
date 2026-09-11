import { useMemo } from 'react';
import { getRuntimeCapabilities } from '../platform/runtime.mjs';

/**
 * Capability flags for the current renderer runtime (Electron vs browser).
 * Stable for the life of the page — the preload bridge does not appear later.
 */
export function useRuntime() {
  return useMemo(() => getRuntimeCapabilities(), []);
}

export default useRuntime;
