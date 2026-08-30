export function isWebRuntime() {
  return typeof window !== 'undefined' && !window.electronAPI && !window.__electronAPI;
}

export default isWebRuntime;
