const { registerAgentsHandlers } = require('./register-agents');
const { registerGithubHandlers } = require('./register-github');
const { registerSettingsHandlers } = require('./register-settings');
const { registerCloudflareHandlers } = require('./register-cloudflare');
const { registerJiraHandlers } = require('./register-jira');
const { registerTasksHandlers } = require('./register-tasks');
const { registerProjectsHandlers } = require('./register-projects');
const { registerUtilsHandlers } = require('./register-utils');

/**
 * Register all IPC handlers. Call once after services are loaded.
 * @param {object} deps - Shared dependencies (services, lifecycle, window accessors)
 */
function registerAllIpcHandlers(deps) {
  registerAgentsHandlers(deps);
  registerGithubHandlers(deps);
  registerSettingsHandlers(deps);
  registerCloudflareHandlers(deps);
  registerJiraHandlers(deps);
  registerTasksHandlers(deps);
  registerProjectsHandlers(deps);
  return registerUtilsHandlers(deps);
}

module.exports = { registerAllIpcHandlers };
