/**
 * Runtime detection and capability flags for the shared renderer.
 *
 * Desktop (Electron preload) can run local CLIs, pick folders, and update
 * the installed app. The Cloudflare-hosted web app cannot — those controls
 * must be hidden, not shown as dead ends.
 */

export const RUNTIME = {
  DESKTOP: 'desktop',
  WEB: 'web',
};

/**
 * @param {object} [globalObj]
 * @returns {'desktop' | 'web'}
 */
export function detectRuntime(globalObj = globalThis) {
  const win = globalObj.window ?? globalObj;
  if (win?.electronAPI || win?.__electronAPI) return RUNTIME.DESKTOP;
  return RUNTIME.WEB;
}

export function isDesktopRuntime(globalObj) {
  return detectRuntime(globalObj) === RUNTIME.DESKTOP;
}

export function isWebRuntime(globalObj) {
  return detectRuntime(globalObj) === RUNTIME.WEB;
}

/**
 * @param {'desktop' | 'web'} [runtime]
 */
export function getRuntimeCapabilities(runtime = detectRuntime()) {
  const desktop = runtime === RUNTIME.DESKTOP;
  return {
    runtime,
    desktop,
    web: !desktop,
    appUpdates: desktop,
    windowMode: desktop,
    localCliServices: desktop,
    localFilesystem: desktop,
    localTaskEnvironment: desktop,
    directoryPicker: desktop,
    openLocalTerminal: desktop,
    createLocalRepo: desktop,
  };
}

export function isDesktopOnlyService(service) {
  if (!service) return false;
  if (service.desktopOnly === true) return true;
  return service.kind === 'local-path';
}

export function filterServicesForRuntime(services, capabilities = getRuntimeCapabilities()) {
  const list = Array.isArray(services) ? services : [];
  if (capabilities.desktop || capabilities.localCliServices) return list;
  return list.filter((service) => !isDesktopOnlyService(service));
}

export function getTaskEnvironments(capabilities = getRuntimeCapabilities()) {
  const environments = [{ id: 'cloud', label: 'Cloud' }];
  if (capabilities.localTaskEnvironment) {
    environments.push({ id: 'local', label: 'Local' });
  }
  environments.push({ id: 'remote', label: 'Remote' });
  return environments;
}

export function getDefaultTaskEnvironment(capabilities = getRuntimeCapabilities()) {
  return capabilities.localTaskEnvironment ? 'local' : 'cloud';
}

export function resolveTaskEnvironment(preferred, capabilities = getRuntimeCapabilities()) {
  const allowed = new Set(getTaskEnvironments(capabilities).map((item) => item.id));
  if (preferred && allowed.has(preferred)) return preferred;
  return getDefaultTaskEnvironment(capabilities);
}

export function getRepoCreateLocations(capabilities = getRuntimeCapabilities()) {
  const locations = [{ id: 'github', label: 'GitHub' }];
  if (capabilities.createLocalRepo) {
    locations.push({ id: 'local', label: 'This Computer (Local)' });
  }
  if (capabilities.desktop) {
    locations.push({ id: 'remote', label: 'Remote Computer' });
  }
  return locations;
}

export default isWebRuntime;
