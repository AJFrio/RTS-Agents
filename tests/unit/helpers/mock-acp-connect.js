/**
 * Shared ACP connect mock for provider unit tests that used to stub runPrompt.
 */
function mockAcpConnect(acpService, overrides = {}) {
  const sessionId = overrides.sessionId || 'acp-1';
  if (overrides.resolveAdapter !== undefined) {
    acpService.resolveAdapter.mockReturnValue(overrides.resolveAdapter);
  }
  acpService.connect.mockImplementation(async (opts) => {
    acpService._lastConnectOpts = opts;
    if (overrides.connectReject) {
      throw overrides.connectReject;
    }
    if (overrides.fireSessionId !== false) {
      opts.onSessionId?.(overrides.acpSessionId || sessionId);
    }
    return {
      sessionId: overrides.acpSessionId || sessionId,
      loadSession: overrides.loadSession !== false,
      closed: false,
      prompt: jest.fn(async (text, { onAccepted } = {}) => {
        if (overrides.onPrompt) {
          await overrides.onPrompt({ ...opts, text });
        }
        if (typeof onAccepted === 'function') onAccepted();
        if (overrides.promptPromise) return overrides.promptPromise;
        return {
          sessionId: overrides.acpSessionId || sessionId,
          stopReason: overrides.stopReason || 'end_turn',
        };
      }),
      close: jest.fn(),
    };
  });
}

function acpConnectMockExports() {
  return {
    resolveAdapter: jest.fn(),
    runPrompt: jest.fn(),
    connect: jest.fn(),
    registerSession: jest.fn(),
    closeSession: jest.fn(),
    hasLiveSession: jest.fn(() => false),
    canFollowUp: jest.fn(() => false),
    promptFollowUp: jest.fn(),
    closeAll: jest.fn(),
    clearAdapterCache: jest.fn(),
    pickPermissionOption: jest.fn(),
    buildSpawnArgs: jest.fn(),
  };
}

async function flushPromises(times = 8) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

module.exports = { mockAcpConnect, acpConnectMockExports, flushPromises };
