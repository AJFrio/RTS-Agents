const httpService = require('./http-service');

const BASE_URL = 'https://openrouter.ai/api/v1';

class OpenRouterService {
  constructor() {
    this.apiKey = null;
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  async request(endpoint, method = 'GET', body = null) {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const url = `${BASE_URL}${endpoint}`;

    return httpService.request(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://rts-agents.com', // Required by OpenRouter
        'X-Title': 'RTS Agents'
      },
      timeout: 60000,
      errorMessagePrefix: 'OpenRouter API error'
    }, body);
  }

  async chat(messages, model = 'openai/gpt-4o', tools = null) {
    const body = {
      model: model,
      messages: messages
    };

    if (tools) {
      body.tools = tools;
    }

    return this.request('/chat/completions', 'POST', body);
  }

  async testConnection() {
    try {
        await this.request('/models');
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
  }

  async getModels() {
    if (!this.apiKey) {
      return [];
    }

    try {
      const response = await this.request('/models');
      if (response && Array.isArray(response.data)) {
        return response.data.map(m => ({
          id: 'openrouter/' + m.id,
          name: m.name || m.id,
          provider: 'openrouter'
        }));
      }
      return [];
    } catch (err) {
      console.error('OpenRouter getModels error:', err);
      return [];
    }
  }
}

module.exports = new OpenRouterService();
