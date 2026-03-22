class GeminiService {
  private apiKey: string | null = null;

  setApiKey(apiKey: string | null) {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async request(endpoint: string, method = 'GET') {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    // endpoint example: /v1beta/models
    const url = new URL(`https://generativelanguage.googleapis.com${endpoint}`);
    url.searchParams.append('key', this.apiKey);

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
        let errorMessage = `Gemini API error: ${response.status}`;
        try {
            const errorData = await response.json();
             errorMessage += ` - ${JSON.stringify(errorData)}`;
        } catch {
             const text = await response.text();
             if (text) errorMessage += ` - ${text}`;
        }
        throw new Error(errorMessage);
    }

    return response.json();
  }

  async getModels() {
     if (!this.apiKey) return [];
     try {
       const response = await this.request('/v1beta/models');
       if (response && Array.isArray(response.models)) {
         return response.models
           .filter((m: any) => m.name.includes('gemini'))
           .map((m: any) => ({
             id: 'gemini/' + m.name.replace('models/', ''),
             name: m.displayName || m.name,
             provider: 'gemini'
           }));
       }
       return [];
     } catch (err) {
       console.error('Gemini getModels error:', err);
       return [];
     }
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
      try {
          await this.getModels(); // Simple test
          return { success: true };
      } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
  }
}

export const geminiService = new GeminiService();
export default geminiService;
