const LAST_MODEL_KEY_PREFIX = 'rts_last_model_';

function scopedKey(provider, scopeKey) {
  const scope = typeof scopeKey === 'string' ? scopeKey.trim() : '';
  return LAST_MODEL_KEY_PREFIX + provider + (scope ? `::${scope}` : '');
}

export function getLastSelectedModel(provider, storage = globalThis.localStorage) {
  try {
    if (!storage || !provider) return '';
    return storage.getItem(scopedKey(provider, '')) || '';
  } catch {
    return '';
  }
}

export function setLastSelectedModel(provider, model, storage = globalThis.localStorage) {
  try {
    if (!storage || !provider) return;
    if (!model) {
      storage.removeItem(scopedKey(provider, ''));
      return;
    }
    storage.setItem(scopedKey(provider, ''), model);
  } catch {
    // ignore quota / private-mode failures
  }
}

export function getLastSelectedModelForScope(
  provider,
  scopeKey,
  storage = globalThis.localStorage
) {
  try {
    if (!storage || !provider) return '';
    return storage.getItem(scopedKey(provider, scopeKey)) || '';
  } catch {
    return '';
  }
}

export function setLastSelectedModelForScope(
  provider,
  scopeKey,
  model,
  storage = globalThis.localStorage
) {
  try {
    if (!storage || !provider) return;
    const key = scopedKey(provider, scopeKey);
    if (!model) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, model);
  } catch {
    // ignore quota / private-mode failures
  }
}

export { LAST_MODEL_KEY_PREFIX };
