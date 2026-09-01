const { buildSpawnArgs } = require('../../../src/main/utils/cli-spawn');

function platformCli(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

/**
 * Assert spawnCli routed `command` + `args` through buildSpawnArgs
 * (cmd.exe wrap on Windows .cmd/.bat shims).
 */
function expectSpawnedCli(spawnFn, command, args, options = expect.anything()) {
  const spec = buildSpawnArgs(command, args);
  expect(spawnFn).toHaveBeenCalledWith(spec.command, spec.args, options);
}

module.exports = { expectSpawnedCli, platformCli };
