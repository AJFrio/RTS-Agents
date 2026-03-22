const BASE_URL = 'https://openrouter.ai/api/v1';

class OpenRouterService {
  private apiKey: string | null = null;

  setApiKey(apiKey: string | null) {
    this.apiKey = apiKey;
  }

  getApiKey(): string | null {
    return this.apiKey;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async request(endpoint: string, method = 'GET', body: unknown = null) {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'HTTP-Referer': 'https://rts-agents.com', // Required by OpenRouter
      'X-Title': 'RTS Agents'
    };

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        let errorMessage = `OpenRouter API error: ${response.status}`;
        try {
            const errorData = await response.json();
            if (errorData?.error?.message) {
                errorMessage = `OpenRouter API error: ${errorData.error.message}`;
            } else {
                 errorMessage += ` - ${JSON.stringify(errorData)}`;
            }
        } catch {
             // ignore JSON parse error
             const text = await response.text();
             if (text) errorMessage += ` - ${text}`;
        }
        throw new Error(errorMessage);
    }

    return response.json();
  }

  async chat(messages: Array<{role: string, content: string}>, model = 'openai/gpt-4o', tools = null) {
    const body: any = {
      model: model,
      messages: messages
    };

    if (tools) {
      body.tools = tools;
    }

    return this.request('/chat/completions', 'POST', body);
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
        await this.request('/models');
        return { success: true };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  async getModels() {
    if (!this.apiKey) {
      return [];
    }

    try {
      const response = await this.request('/models');
      if (response && Array.isArray(response.data)) {
        return response.data.map((m: any) => ({
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

export const openRouterService = new OpenRouterService();
export default openRouterService;
