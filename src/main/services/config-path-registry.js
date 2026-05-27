/**
 * Shared project-path storage for provider scan directories (settings.*Paths).
 */

const PROJECT_PATH_PROVIDERS = ['gemini', 'claude', 'cursor', 'codex', 'github'];

function settingsPathKey(provider) {
  if (!PROJECT_PATH_PROVIDERS.includes(provider)) {
    throw new Error(`Unknown project path provider: ${provider}`);
  }
  return `settings.${provider}Paths`;
}

function getPaths(store, provider) {
  return store.get(settingsPathKey(provider), []);
}

function addPath(store, provider, path) {
  const paths = getPaths(store, provider);
  if (!paths.includes(path)) {
    paths.push(path);
    store.set(settingsPathKey(provider), paths);
  }
  return paths;
}

function removePath(store, provider, path) {
  const paths = getPaths(store, provider).filter((p) => p !== path);
  store.set(settingsPathKey(provider), paths);
  return paths;
}

function getAllProjectPaths(store) {
  const combined = PROJECT_PATH_PROVIDERS.flatMap((provider) => getPaths(store, provider));
  return [...new Set(combined)];
}

function getPathsByProvider(store) {
  const out = {};
  for (const provider of PROJECT_PATH_PROVIDERS) {
    out[`${provider}Paths`] = getPaths(store, provider);
  }
  return out;
}

module.exports = {
  PROJECT_PATH_PROVIDERS,
  settingsPathKey,
  getPaths,
  addPath,
  removePath,
  getAllProjectPaths,
  getPathsByProvider
};
