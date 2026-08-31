/**
 * Form-init and Cloudflare detect+connect helpers for ServiceOnboardingModal.
 * Seed the form only on modal open / service id change — never on every
 * app-state tick (that wipes a pasted apiToken).
 */

export function getInitialValues(service, state) {
  if (!service) return {};
  if (service.kind === 'jira') {
    return {
      baseUrl: state?.settings?.jiraBaseUrl || '',
      apiKey: '',
    };
  }
  if (service.kind === 'cloudflare') {
    return {
      accountId: state?.serviceInfo?.cloudflare?.accountId || '',
      apiToken: '',
    };
  }
  return { path: '', apiKey: '' };
}

/**
 * True only when the modal opens or the focused service id changes.
 * Background state refreshes must not re-seed (they would clear apiToken).
 */
export function shouldReseedOnboardingForm({ open, serviceId, prevOpen, prevServiceId }) {
  if (!open || !serviceId) return false;
  if (!prevOpen) return true;
  return serviceId !== prevServiceId;
}

export function getOnboardingModalTitle(service, connected) {
  if (!service?.title) return '';
  return `${connected ? 'Manage' : 'Connect'} ${service.title}`;
}

export function cloudflareConnectSuccessMessage(accountName) {
  const name = typeof accountName === 'string' ? accountName.trim() : '';
  return name
    ? `Connected to ${name}. Cloudflare KV is ready.`
    : 'Connected. Cloudflare KV is ready.';
}

export function getOnboardingFieldHelper(service, fieldKey) {
  if (!service) return '';
  if (service.kind === 'cloud-api-key' && fieldKey === 'apiKey') {
    return 'Stored on this device. Used only to talk to this provider.';
  }
  if (service.kind === 'jira' && fieldKey === 'apiKey') {
    return 'Stored on this device. Use email:token or a PAT.';
  }
  if (service.kind === 'cloudflare' && fieldKey === 'apiToken') {
    return 'Paste the token, then Detect & connect to find your account and verify.';
  }
  return '';
}

export async function verifyCloudflareConnection({ api, accountId, apiToken }) {
  const id = (accountId || '').trim();
  const token = (apiToken || '').trim();
  if (!id || !token) {
    return {
      ok: false,
      keepFields: true,
      feedback: {
        type: 'error',
        message: 'Enter both the Cloudflare account ID and API token.',
      },
    };
  }
  if (typeof api?.setCloudflareConfig !== 'function' || typeof api?.testCloudflare !== 'function') {
    return {
      ok: false,
      keepFields: true,
      feedback: {
        type: 'error',
        message: 'Desktop bridge is unavailable. Restart the app and try again.',
      },
    };
  }

  try {
    await api.setCloudflareConfig(id, token);
    const result = await api.testCloudflare();
    if (!result?.success) {
      if (typeof api.clearCloudflareConfig === 'function') {
        await api.clearCloudflareConfig();
      }
      return {
        ok: false,
        keepFields: true,
        feedback: {
          type: 'error',
          message: result?.error || result?.message || 'Verification failed.',
        },
      };
    }
    return {
      ok: true,
      feedback: {
        type: 'success',
        message: result.message || 'Cloudflare KV connected successfully.',
      },
    };
  } catch (err) {
    return {
      ok: false,
      keepFields: true,
      feedback: {
        type: 'error',
        message: err?.message || 'Unable to connect this service.',
      },
    };
  }
}

/**
 * Discover the account from the current token, then save + test with that
 * discovered id and the same token. Never reads form state after an update.
 */
export async function detectAndConnectCloudflare({ api, apiToken }) {
  const token = (apiToken || '').trim();
  if (!token) {
    return {
      ok: false,
      keepFields: true,
      feedback: {
        type: 'error',
        message: 'Paste your API token first, then detect your account ID.',
      },
    };
  }

  if (typeof api?.discoverCloudflareAccount !== 'function') {
    return {
      ok: false,
      keepFields: true,
      feedback: {
        type: 'error',
        message: 'Could not detect account ID — enter it manually.',
      },
    };
  }

  let discover;
  try {
    discover = await api.discoverCloudflareAccount(token);
  } catch {
    return {
      ok: false,
      keepFields: true,
      feedback: {
        type: 'error',
        message: 'Could not detect account ID — enter it manually.',
      },
    };
  }

  const account = discover?.success && Array.isArray(discover.accounts) ? discover.accounts[0] : null;
  if (!account?.id) {
    return {
      ok: false,
      keepFields: true,
      feedback: {
        type: 'error',
        message: 'Could not detect account ID — enter it manually.',
      },
    };
  }

  const verify = await verifyCloudflareConnection({
    api,
    accountId: account.id,
    apiToken: token,
  });

  if (!verify.ok) {
    return {
      ok: false,
      accountId: account.id,
      accountName: account.name,
      formPatch: { accountId: account.id },
      keepFields: true,
      feedback: verify.feedback,
    };
  }

  return {
    ok: true,
    accountId: account.id,
    accountName: account.name,
    formPatch: { accountId: account.id },
    keepFields: true,
    feedback: {
      type: 'success',
      message: cloudflareConnectSuccessMessage(account.name),
    },
  };
}
