/**
 * Cloudflare Worker API Proxy
 * 
 * Routes API requests to their respective providers while handling CORS
 * and authentication. API keys are passed from the client in headers.
 */

interface ProxyConfig {
  baseUrl: string;
  authHeader: (apiKey: string) => Record<string, string>;
}

const PROXY_CONFIGS: Record<string, ProxyConfig> = {
  jules: {
    baseUrl: 'https://jules.googleapis.com/v1alpha',
    authHeader: (apiKey) => ({ 'X-Goog-Api-Key': apiKey }),
  },
  cursor: {
    baseUrl: 'https://api.cursor.com/v0',
    authHeader: (apiKey) => ({ 'Authorization': `Basic ${btoa(`${apiKey}:`)}` }),
  },
  codex: {
    baseUrl: 'https://api.openai.com/v1',
    authHeader: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'OpenAI-Beta': 'assistants=v2',
    }),
  },
  claude: {
    baseUrl: 'https://api.anthropic.com/v1',
    authHeader: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }),
  },
  github: {
    baseUrl: 'https://api.github.com',
    authHeader: (apiKey) => ({
      'Authorization': `token ${apiKey}`,
      'User-Agent': 'RTS-Agents-Mobile-PWA',
      'Accept': 'application/vnd.github.v3+json',
    }),
  },
  cloudflare: {
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts',
    authHeader: () => ({}), // Auth handled specially for Cloudflare
  },
  jira: {
    baseUrl: '',
    authHeader: () => ({}), // Auth handled specially for Jira
  },
};

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-JIRA-BASE-URL, X-CF-Account-Id, X-CF-Api-Token',
    'Access-Control-Max-Age': '86400',
  };
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function jiraAuthHeader(apiKey: string): Record<string, string> {
  // Support either:
  // - "email:token" (Cloud basic auth)
  // - "token" (PAT / bearer)
  if (apiKey.includes(':')) {
    return { 'Authorization': `Basic ${btoa(apiKey)}` };
  }
  return { 'Authorization': `Bearer ${apiKey}` };
}

async function handleJiraRequest(request: Request, path: string): Promise<Response> {
  const apiKey = request.headers.get('X-API-Key');
  const baseUrlHeader = request.headers.get('X-JIRA-BASE-URL');

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
  if (!baseUrlHeader) {
    return new Response(JSON.stringify({ error: 'Jira base URL required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const baseUrl = normalizeBaseUrl(baseUrlHeader);
  const targetUrl = `${baseUrl}${path}`;
  const authHeaders = jiraAuthHeader(apiKey);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...authHeaders,
  };

  try {
    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const body = await request.text();
      if (body) fetchOptions.body = body;
    }

    const response = await fetch(targetUrl, fetchOptions);
    const responseBody = await response.text();

    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        ...corsHeaders(),
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Jira request failed';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}

async function handleProxyRequest(
  request: Request,
  provider: string,
  path: string
): Promise<Response> {
  const config = PROXY_CONFIGS[provider];
  if (!config) {
    return new Response(JSON.stringify({ error: `Unknown provider: ${provider}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const apiKey = request.headers.get('X-API-Key');

  // Special handling for Cloudflare KV
  if (provider === 'cloudflare') {
    return handleCloudflareRequest(request, path);
  }
  // Special handling for Jira (base URL is dynamic)
  if (provider === 'jira') {
    return handleJiraRequest(request, path);
  }

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const targetUrl = `${config.baseUrl}${path}`;
  const authHeaders = config.authHeader(apiKey);

  // Clone request headers and add auth
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders,
  };

  // Forward the request
  try {
    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
    };

    // Include body for non-GET requests
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const body = await request.text();
      if (body) {
        fetchOptions.body = body;
      }
    }

    const response = await fetch(targetUrl, fetchOptions);

    // Get response body
    const responseBody = await response.text();

    // Return proxied response with CORS headers
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        ...corsHeaders(),
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Proxy request failed';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}

async function handleCloudflareRequest(request: Request, path: string): Promise<Response> {
  const accountId = request.headers.get('X-CF-Account-Id');
  const apiToken = request.headers.get('X-CF-Api-Token');

  if (!accountId || !apiToken) {
    return new Response(JSON.stringify({ error: 'Cloudflare credentials required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const targetUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv${path}`;

  try {
    const fetchOptions: RequestInit = {
      method: request.method,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
      },
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const body = await request.text();
      if (body) {
        fetchOptions.body = body;
      }
    }

    const response = await fetch(targetUrl, fetchOptions);
    const responseBody = await response.text();

    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        ...corsHeaders(),
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Cloudflare request failed';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // API proxy routes
    if (url.pathname.startsWith('/api/')) {
      const pathParts = url.pathname.slice(5).split('/'); // Remove '/api/'
      const provider = pathParts[0];
      const remainingPath = '/' + pathParts.slice(1).join('/') + url.search;

      return handleProxyRequest(request, provider, remainingPath);
    }

    // For non-API routes, return 404 (static files handled by Cloudflare Pages)
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
