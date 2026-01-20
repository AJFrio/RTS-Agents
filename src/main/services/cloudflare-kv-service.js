/**
 * Cloudflare KV Service
 *
 * Uses Cloudflare v4 API:
 * - Namespaces: /client/v4/accounts/:accountId/storage/kv/namespaces
 * - Values:     /client/v4/accounts/:accountId/storage/kv/namespaces/:namespaceId/values/:key
 */

const DEFAULT_NAMESPACE_TITLE = 'rtsa';

class CloudflareKvService {
  constructor() {
    this.accountId = null;
    this.apiToken = null;
  }

  setConfig({ accountId, apiToken }) {
    this.accountId = accountId || null;
    this.apiToken = apiToken || null;
  }

  isConfigured() {
    return !!(this.accountId && this.apiToken);
  }

  get baseUrl() {
    if (!this.accountId) throw new Error('Cloudflare accountId not configured');
    return `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/storage/kv`;
  }

  get headers() {
    if (!this.apiToken) throw new Error('Cloudflare apiToken not configured');
    return {
      Authorization: `Bearer ${this.apiToken}`
    };
  }

  async _request(path, { method = 'GET', headers = {}, body } = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...this.headers,
        ...headers
      },
      body
    });

    // KV values endpoints can return raw bodies; namespaces endpoints return JSON.
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      let errText = '';
      try {
        errText = await res.text();
      } catch (_) {}
      throw new Error(`Cloudflare KV request failed (${res.status}): ${errText || res.statusText}`);
    }

    if (contentType.includes('application/json')) {
      return await res.json();
    }
    return res;
  }

  async listNamespaces({ page = 1, perPage = 100 } = {}) {
    const json = await this._request(`/namespaces?page=${page}&per_page=${perPage}`, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    if (!json?.success) {
      throw new Error(`Cloudflare KV list namespaces failed: ${JSON.stringify(json?.errors || [])}`);
    }
    return json;
  }

  async findNamespaceIdByTitle(title = DEFAULT_NAMESPACE_TITLE) {
    let page = 1;
    while (true) {
      const json = await this.listNamespaces({ page, perPage: 100 });
      const found = (json.result || []).find(ns => ns?.title === title);
      if (found?.id) return found.id;
      const info = json.result_info || {};
      const totalPages = info.total_pages || 1;
      if (page >= totalPages) return null;
      page += 1;
    }
  }

  async createNamespace(title = DEFAULT_NAMESPACE_TITLE) {
    const json = await this._request(`/namespaces`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title })
    });
    if (!json?.success) {
      throw new Error(`Cloudflare KV create namespace failed: ${JSON.stringify(json?.errors || [])}`);
    }
    return json.result?.id;
  }

  async ensureNamespace(title = DEFAULT_NAMESPACE_TITLE) {
    const existing = await this.findNamespaceIdByTitle(title);
    if (existing) return existing;
    const created = await this.createNamespace(title);
    if (!created) throw new Error('Cloudflare KV namespace creation returned no id');
    return created;
  }

  async putValue(namespaceId, key, value) {
    if (!namespaceId) throw new Error('Missing Cloudflare KV namespaceId');
    if (!key) throw new Error('Missing Cloudflare KV key');

    const body = typeof value === 'string' ? value : JSON.stringify(value);
    await this._request(`/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain'
      },
      body
    });
    return { success: true };
  }

  async getValueText(namespaceId, key) {
    if (!namespaceId) throw new Error('Missing Cloudflare KV namespaceId');
    if (!key) throw new Error('Missing Cloudflare KV key');

    const res = await this._request(`/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`, {
      method: 'GET'
    });
    return await res.text();
  }

  async getValueJson(namespaceId, key, fallback = null) {
    try {
      const text = await this.getValueText(namespaceId, key);
      if (!text) return fallback;
      return JSON.parse(text);
    } catch (err) {
      // If key is missing, Cloudflare returns 404 (handled earlier) so this is parse/other.
      return fallback;
    }
  }

  async ensureDevicesArray(namespaceId) {
    try {
      const devices = await this.getValueJson(namespaceId, 'devices', []);
      if (Array.isArray(devices)) return devices;
      // If something else is stored, reset to empty array.
      await this.putValue(namespaceId, 'devices', []);
      return [];
    } catch (err) {
      // If missing, create it.
      await this.putValue(namespaceId, 'devices', []);
      return [];
    }
  }

  upsertDevice(devices, device) {
    const next = Array.isArray(devices) ? [...devices] : [];
    const idx = next.findIndex(d => d?.id && d.id === device.id);
    if (idx >= 0) {
      next[idx] = { ...next[idx], ...device };
    } else {
      next.push(device);
    }
    return next;
  }

  async heartbeat({ namespaceId, device }) {
    const devices = await this.ensureDevicesArray(namespaceId);
    const next = this.upsertDevice(devices, device);
    await this.putValue(namespaceId, 'devices', next);
    return next;
  }

  async pushKeys(namespaceId, keys) {
    return this.putValue(namespaceId, 'keys', keys);
  }

  async pullKeys(namespaceId) {
    return this.getValueJson(namespaceId, 'keys', {});
  }
}

module.exports = new CloudflareKvService();

