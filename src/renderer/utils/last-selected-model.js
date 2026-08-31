const LAST_MODEL_KEY_PREFIX = 'rts_last_model_';

export function getLastSelectedModel(provider, storage = globalThis.localStorage) {
  try {
    if (!storage || !provider) return '';
    return storage.getItem(LAST_MODEL_KEY_PREFIX + provider) || '';
  } catch {
    return '';
  }
}

export function setLastSelectedModel(provider, model, storage = globalThis.localStorage) {
  try {
    if (!storage || !provider) return;
    if (!model) {
      storage.removeItem(LAST_MODEL_KEY_PREFIX + provider);
      return;
    }
    storage.setItem(LAST_MODEL_KEY_PREFIX + provider, model);
  } catch {
    // ignore quota / private-mode failures
  }
}

export { LAST_MODEL_KEY_PREFIX };
