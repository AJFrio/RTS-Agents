const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /Basic\s+[A-Za-z0-9._~+/=-]+/gi,
  /X-Goog-Api-Key:\s*[A-Za-z0-9._~+/=-]+/gi,
  /x-api-key:\s*[A-Za-z0-9._~+/=-]+/gi,
];

function redact(value) {
  if (value == null) return value;
  if (typeof value !== 'string') return value;

  return SECRET_PATTERNS.reduce(
    (current, pattern) =>
      current.replace(pattern, (match) => match.split(/\s+/)[0] + ' [redacted]'),
    value
  );
}

function redactObject(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactObject);

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (/token|key|secret|authorization|password/i.test(key)) {
        return [key, entry ? '[redacted]' : entry];
      }
      if (typeof entry === 'string') return [key, redact(entry)];
      if (entry && typeof entry === 'object') return [key, redactObject(entry)];
      return [key, entry];
    })
  );
}

function errorMessage(error) {
  if (!error) return null;
  if (typeof error === 'string') return redact(error);
  return redact(error.message || String(error));
}

function providerHealth(provider, options = {}) {
  const {
    configured = false,
    installed = null,
    connected,
    success,
    status,
    message,
    error,
    docsUrl = null,
    endpointLabel = null,
    diagnostics = null,
  } = options;

  const isConnected = typeof connected === 'boolean' ? connected : !!success;
  const normalizedStatus =
    status || (isConnected ? 'ok' : configured || installed ? 'error' : 'not_configured');
  const normalizedError = errorMessage(error);

  return {
    provider,
    success: isConnected,
    connected: isConnected,
    configured: !!configured,
    installed: installed == null ? null : !!installed,
    status: normalizedStatus,
    message: message || (isConnected ? 'Connected' : normalizedError || 'Not configured'),
    error: isConnected ? null : normalizedError,
    checkedAt: new Date().toISOString(),
    docsUrl,
    endpointLabel,
    diagnostics: diagnostics ? redactObject(diagnostics) : null,
  };
}

function ok(provider, options = {}) {
  return providerHealth(provider, {
    ...options,
    success: true,
    connected: true,
    status: options.status || 'ok',
  });
}

function fail(provider, error, options = {}) {
  return providerHealth(provider, {
    ...options,
    success: false,
    connected: false,
    status: options.status || 'error',
    error,
  });
}

function notConfigured(provider, options = {}) {
  const message = options.message || 'Not configured';
  return providerHealth(provider, {
    ...options,
    configured: false,
    success: false,
    connected: false,
    status: 'not_configured',
    message,
    error: options.error || message,
  });
}

module.exports = {
  providerHealth,
  ok,
  fail,
  notConfigured,
  redact,
  redactObject,
};
