/**
 * Codex on the web runtime is local-CLI only. Cloud Responses / Assistants
 * integration was removed; desktop and remote-queue dispatch handle Codex.
 */

export function createCodexService() {
  async function notAvailable(action) {
    throw new Error(`Codex ${action} is desktop-only`);
  }

  return {
    async getAllAgents() {
      return [];
    },
    async getAgentDetails() {
      return notAvailable('details');
    },
    async listModels() {
      return { data: [] };
    },
    async testConnection() {
      return { success: false, error: 'Codex is local CLI only' };
    },
    async createTask() {
      return notAvailable('tasks');
    },
    async sendFollowup() {
      return notAvailable('follow-up');
    },
    getTrackedThreads() {
      return [];
    },
    loadTrackedThreads() {},
    trackThread() {},
  };
}

export default createCodexService;
