export const GHOST_API_VERSION = 'v6.0';

export interface GhostAdapterOptions {
  url?: string | null;
  key?: string | null;
  version?: string;
  mockContent?: boolean;
}

export interface GhostRuntimeConfig {
  url: string | null;
  key: string | null;
  version: string;
  isConfigured: boolean;
}

function readProcessEnv(name: string): string | null {
  if (typeof process === 'undefined' || !process.env) {
    return null;
  }

  return readString(process.env[name]);
}

function readString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function normalizeUrl(value: string | null | undefined): string | null {
  const url = readString(value);

  return url ? url.replace(/\/+$/, '') : null;
}

export function getGhostRuntimeConfig(
  options: GhostAdapterOptions = {},
): GhostRuntimeConfig {
  const url = normalizeUrl(options.url ?? readProcessEnv('PUBLIC_GHOST_URL'));
  const key = readString(options.key ?? readProcessEnv('GHOST_CONTENT_API_KEY'));
  const version = readString(options.version) ?? GHOST_API_VERSION;

  return {
    url,
    key,
    version,
    isConfigured: Boolean(url && key),
  };
}
