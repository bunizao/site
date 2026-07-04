import GhostContentAPI from '@tryghost/content-api';

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

  const ghostClient = new GhostContentAPI({
    url: config.url,
    key: config.key,
    version: config.version,
  });

  ghostClients.set(cacheKey, ghostClient);

  return ghostClient;
}
