/**
 * OpenRouter API service (web runtime).
 *
 * Port of mobile-webapp/src/services/openrouter-service.ts to plain ESM JS.
 * Unlike the other providers this one calls https://openrouter.ai/api/v1
 * DIRECTLY from the browser (OpenRouter allows CORS; matches the mobile PWA).
 */

import { createRequester } from './provider-http.mjs';

const BASE_URL = 'https://openrouter.ai/api/v1';

export function createOpenRouterService({ storage, fetchImpl } = {}) {
  const request = createRequester({
    baseUrl: BASE_URL,
    label: 'OpenRouter',
    fetchImpl,
    getHeaders() {
      const apiKey = storage.getApiKey('openrouter');
      if (!apiKey) throw new Error('OpenRouter API key not configured');
      return {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://rts-agents.com', // Required by OpenRouter
        'X-Title': 'RTS Agents',
      };
    },
    formatError: async (response) => {
      const text = await response.text();
      let errorMessage = `OpenRouter API error: ${response.status}`;
      try {
        const errorData = JSON.parse(text);
        if (errorData?.error?.message) {
          return `OpenRouter API error: ${errorData.error.message}`;
        }
        return `${errorMessage} - ${JSON.stringify(errorData)}`;
      } catch {
        // Non-JSON error body — append it raw when present.
        return text ? `${errorMessage} - ${text}` : errorMessage;
      }
    },
  });

  async function chat(messages, model = 'openai/gpt-4o', tools = null) {
    const body = {
      model,
      messages,
    };

    if (tools) body.tools = tools;

    return request('/chat/completions', 'POST', body);
  }

  async function testConnection() {
    try {
      await request('/models');
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message || 'Unknown error' };
    }
  }

  async function getModels() {
    if (!storage.getApiKey('openrouter')) {
      return [];
    }

    try {
      const response = await request('/models');
      if (response && Array.isArray(response.data)) {
        return response.data.map((m) => ({
          id: 'openrouter/' + m.id,
          name: m.name || m.id,
          provider: 'openrouter',
        }));
      }
      return [];
    } catch (err) {
      console.error('OpenRouter getModels error:', err);
      return [];
    }
  }

  return { chat, testConnection, getModels };
}

export default createOpenRouterService;
