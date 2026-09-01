/**
 * Agent orchestrator (web runtime).
 *
 * Simplified port of mobile-webapp/src/services/agent-orchestrator-service.ts:
 * model listing and chat completions via OpenRouter, WITHOUT the KV tool
 * loop (remote dispatch on web goes through createTask's targetDeviceId path).
 * chat() resolves to the assistant message ({role, content}) that AgentPage
 * renders.
 */

export function createAgentOrchestratorService({ openrouter, storage } = {}) {
  async function getAvailableModels() {
    const models = [];
    const errors = [];

    if (storage.hasApiKey('openrouter')) {
      try {
        models.push(...(await openrouter.getModels()));
      } catch (err) {
        errors.push({ provider: 'openrouter', error: err?.message || 'Unknown error' });
      }
    }

    return { models, errors };
  }

  async function chat(messages, selectedModel) {
    if (!storage.hasApiKey('openrouter')) {
      return {
        role: 'assistant',
        content: 'Please configure an OpenRouter API key in Settings to use Janus.',
      };
    }

    // Settings store models as 'openrouter/<vendor>/<model>'; OpenRouter wants
    // the bare '<vendor>/<model>' id.
    const model =
      selectedModel && selectedModel.startsWith('openrouter/')
        ? selectedModel.replace('openrouter/', '')
        : selectedModel;

    try {
      const response = await openrouter.chat(messages, model || 'openai/gpt-4o');
      if (!response || !response.choices || !response.choices[0]) {
        throw new Error('Invalid response from LLM provider');
      }
      return response.choices[0].message;
    } catch (err) {
      console.error('Orchestrator error:', err);
      return {
        role: 'assistant',
        content: `I encountered an error: ${err?.message || 'Unknown error'}`,
      };
    }
  }

  return { getAvailableModels, chat };
}

export default createAgentOrchestratorService;
