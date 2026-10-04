import GhostContentAPI, { type GhostRequestOptions } from '@tryghost/content-api';

import {
  type GhostAdapterOptions,
  getGhostRuntimeConfig,
} from './config';

const ghostClients = new Map<string, GhostContentAPI>();

export function getGhostClient(options: GhostAdapterOptions = {}) {
  const config = getGhostRuntimeConfig(options);

  if (!config.isConfigured || !config.url || !config.key) {
    return null;
  }

  const cacheKey = `${config.url}|${config.key}|${config.version}`;
  const existingClient = ghostClients.get(cacheKey);

  if (existingClient) {
    return existingClient;
  }

  let ghostClient: GhostContentAPI;
  try {
    ghostClient = new GhostContentAPI({
      url: config.url,
      key: config.key,
      version: config.version,
      makeRequest: requestGhostContent,
    });
  } catch {
    throw new Error('Ghost Content configuration is invalid.');
  }

  ghostClients.set(cacheKey, ghostClient);

  return ghostClient;
}

async function requestGhostContent({ url, method, params, headers }: GhostRequestOptions): Promise<{ data: unknown }> {
  const requestUrl = new URL(url);
  for (const [name, value] of Object.entries(params)) {
    requestUrl.searchParams.set(name, (Array.isArray(value) ? value : [value]).join(','));
  }

  const signal = AbortSignal.timeout(10_000);
  let response: Response;
  try {
    // The SDK's Axios fetch adapter sets cache: 'default', which workerd rejects.
    response = await fetch(requestUrl, { method: method.toUpperCase(), headers, signal });
  } catch {
    throw new Error(signal.aborted ? 'Ghost Content request timed out.' : 'Ghost Content request failed.');
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (response.ok) {
      throw new Error(signal.aborted ? 'Ghost Content request timed out.' : 'Ghost Content returned an invalid response.');
    }
  }

  if (!response.ok) {
    const upstream = typeof data === 'object' && data !== null && 'errors' in data
      && Array.isArray(data.errors) ? data.errors[0] : null;
    const type = typeof upstream?.type === 'string' && /^[A-Za-z]+Error$/.test(upstream.type)
      ? upstream.type : 'GhostContentError';
    const code = typeof upstream?.code === 'string' && /^[A-Z0-9_]+$/.test(upstream.code)
      && !upstream.code.toLowerCase().includes(String(params.key).toLowerCase())
      ? upstream.code : undefined;
    // Keep the SDK's error envelope without echoing URLs, API keys or response metadata.
    throw Object.assign(new Error('Ghost Content request failed.'), {
      response: {
        status: response.status,
        data: { errors: [{ message: 'Ghost Content request failed.', type, ...(code ? { code } : {}) }] },
      },
    });
  }

  return { data };
}
