const LAST_MODEL_KEY_PREFIX = 'rts_last_model_';

function getLastSelectedModel(provider, storage) {
  const s = storage || (typeof globalThis !== 'undefined' ? globalThis.localStorage : null);
  try {
    if (!s || !provider) return '';
    return s.getItem(LAST_MODEL_KEY_PREFIX + provider) || '';
  } catch {
    return '';
  }
}

function setLastSelectedModel(provider, model, storage) {
  const s = storage || (typeof globalThis !== 'undefined' ? globalThis.localStorage : null);
  try {
    if (!s || !provider) return;
    if (!model) {
      s.removeItem(LAST_MODEL_KEY_PREFIX + provider);
      return;
    }
    s.setItem(LAST_MODEL_KEY_PREFIX + provider, model);
  } catch {
    // ignore quota / private-mode failures
  }
}

module.exports = { getLastSelectedModel, setLastSelectedModel, LAST_MODEL_KEY_PREFIX };
