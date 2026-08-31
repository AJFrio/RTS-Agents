/**
 * Cloudflare quick-setup deep-link builder.
 *
 * Builds the Cloudflare dashboard URL that opens the API token creation
 * page with the Workers KV Storage: Edit permission pre-selected, so the
 * ServiceOnboardingModal quick-setup flow only needs the user to approve
 * the token, copy the secret, and paste it back into the form.
 */

export function buildCloudflareTokenUrl({ name = 'RTS Agents KV Sync' } = {}) {
  const permissionGroupKeys = encodeURIComponent(
    JSON.stringify([{ key: 'workers_kv_storage', type: 'edit' }])
  );
  return (
    'https://dash.cloudflare.com/profile/api-tokens' +
    `?permissionGroupKeys=${permissionGroupKeys}` +
    '&accountId=*&zoneId=all' +
    `&name=${encodeURIComponent(name)}`
  );
}
