// Mock implementation of electron-store
class Store {
  constructor(options = {}) {
    this.data = options.default || {};
    // Apply schema defaults if provided
    if (options.schema) {
      Object.keys(options.schema).forEach(key => {
        if (this.data[key] === undefined && options.schema[key].default !== undefined) {
          this.data[key] = options.schema[key].default;
        }
      });
    }
  }

  get(key, defaultValue) {
    if (key === undefined) return this.data;
    const keys = key.split('.');
    let value = this.data;
    for (const k of keys) {
      if (value === undefined || value === null) return defaultValue;
      value = value[k];
    }
    return value !== undefined ? value : defaultValue;
  }

  set(key, value) {
    const keys = key.split('.');
    let target = this.data;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!target[k] || typeof target[k] !== 'object') {
        target[k] = {};
      }
      target = target[k];
    }
    target[keys[keys.length - 1]] = value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    // Simplified delete for one level
    delete this.data[key];
  }

  clear() {
    this.data = {};
  }
}

module.exports = Store;
