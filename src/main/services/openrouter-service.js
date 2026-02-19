const https = require('https');

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

    const url = new URL(`${BASE_URL}${endpoint}`);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://rts-agents.com', // Required by OpenRouter
          'X-Title': 'RTS Agents'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve(data);
            }
          } else {
            // Try to parse error message from body
            try {
                const errorBody = JSON.parse(data);
                if (errorBody.error && errorBody.error.message) {
                    reject(new Error(`OpenRouter API error: ${errorBody.error.message}`));
                    return;
                }
            } catch (e) {
                // Ignore parse error
            }
            reject(new Error(`OpenRouter API error: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(60000, () => {
        req.destroy();
        reject(new Error('OpenRouter API request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
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
}

module.exports = new OpenRouterService();
