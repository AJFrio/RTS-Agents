/** In-memory install probe cache (warmed async; read synchronously where needed). */
const cache = new Map();

function getCached(key) {
  return cache.has(key) ? cache.get(key) : undefined;
}

function setCached(key, value) {
  cache.set(key, Boolean(value));
}

function clearInstallStatusCache() {
  cache.clear();
}

module.exports = { getCached, setCached, clearInstallStatusCache };
