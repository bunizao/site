const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || '545faed61bc6b0c8ef2c417303555d6f';
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
const workerName = process.env.WORKER_NAME?.trim();
const workersSubdomain = process.env.CLOUDFLARE_WORKERS_SUBDOMAIN?.trim() || 'bunizao';
const policyName = 'Bunizao CI preview bypass';

if (!accountId || !apiToken || !workerName) {
  throw new Error('CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and WORKER_NAME are required.');
}

const appName = `${workerName} - Cloudflare Workers`;
const domain = `*-${workerName}.${workersSubdomain}.workers.dev`;

async function cloudflare(path, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${apiToken}`,
      'content-type': 'application/json',
      ...options.headers,
    },
  });
  const payload = await response.json();

  if (!response.ok || !payload.success) {
    const message = payload.errors?.map((error) => error.message).join('; ') || response.statusText;
    throw new Error(
      `Cloudflare API ${options.method || 'GET'} ${path} failed: ${message}. ` +
        'The token must be able to read and edit Zero Trust Access applications.'
    );
  }

  return payload.result;
}

function buildBypassPolicy(existingPolicy) {
  return {
    ...existingPolicy,
    name: policyName,
    decision: 'bypass',
    include: [{ everyone: {} }],
    exclude: [],
    require: [],
  };
}

function buildAppBody(existingApp) {
  const existingPolicies = existingApp?.policies ?? [];
  const policyIndex = existingPolicies.findIndex((policy) => policy.name === policyName);
  const policies =
    policyIndex >= 0
      ? existingPolicies.map((policy, index) => (index === policyIndex ? buildBypassPolicy(policy) : policy))
      : [buildBypassPolicy({}), ...existingPolicies];

  return {
    allowed_idps: existingApp?.allowed_idps,
    allow_authenticate_via_warp: existingApp?.allow_authenticate_via_warp,
    app_launcher_visible: existingApp?.app_launcher_visible ?? false,
    auto_redirect_to_identity: existingApp?.auto_redirect_to_identity,
    cors_headers: existingApp?.cors_headers,
    enable_binding_cookie: existingApp?.enable_binding_cookie,
    http_only_cookie_attribute: existingApp?.http_only_cookie_attribute,
    options_preflight_bypass: existingApp?.options_preflight_bypass,
    same_site_cookie_attribute: existingApp?.same_site_cookie_attribute,
    service_auth_401_redirect: existingApp?.service_auth_401_redirect,
    session_duration: existingApp?.session_duration ?? '24h',
    name: appName,
    type: 'self_hosted',
    domain,
    destinations: [{ type: 'public', uri: domain }],
    policies,
  };
}

const searchParams = new URLSearchParams({
  domain,
  exact: 'true',
  per_page: '100',
});
const existingApps = await cloudflare(`/accounts/${accountId}/access/apps?${searchParams}`);
const existingApp = existingApps.find((app) => app.domain === domain);
const body = buildAppBody(existingApp);
const path = existingApp
  ? `/accounts/${accountId}/access/apps/${existingApp.id}`
  : `/accounts/${accountId}/access/apps`;
const method = existingApp ? 'PUT' : 'POST';
const savedApp = await cloudflare(path, {
  method,
  body: JSON.stringify(body),
});

console.log(`${method === 'POST' ? 'Created' : 'Updated'} Access app ${savedApp.name} (${savedApp.domain}).`);
