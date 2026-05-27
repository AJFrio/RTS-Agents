const agentsApi = require('./api-agents');
const settingsApi = require('./api-settings');
const utilsTasksApi = require('./api-utils-tasks');
const githubApi = require('./api-github');
const jiraApi = require('./api-jira');
const projectsApi = require('./api-projects');

function buildElectronApi() {
  return {
    platform: process.platform,
    versions: {
      node: process.versions.node,
      chrome: process.versions.chrome,
      electron: process.versions.electron
    },
    ...agentsApi,
    ...settingsApi,
    ...utilsTasksApi,
    ...githubApi,
    ...jiraApi,
    ...projectsApi
  };
}

module.exports = { buildElectronApi };
