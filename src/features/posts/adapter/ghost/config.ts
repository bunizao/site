export const GHOST_API_VERSION = 'v6.0';

export interface GhostAdapterOptions {
  url?: string | null;
  key?: string | null;
  version?: string;
  mockContent?: boolean;
  forceMockContent?: boolean;
}

export interface GhostRuntimeConfig {
  url: string | null;
  key: string | null;
  version: string;
  isConfigured: boolean;
  mockContent: boolean;
  forceMockContent: boolean;
}

function readProcessEnv(name: string): string | null {
  if (typeof process === 'undefined' || !process.env) {
    return null;
  }

  return readString(process.env[name]);
}

function readEnvVar(name: string): string | null {
  return readProcessEnv(name);
}

function readEnvFlag(name: string): boolean | undefined {
  const value = readEnvVar(name)?.toLowerCase();
  if (!value) return undefined;
  return value === '1' || value === 'true';
}

function isProductionBuild(): boolean {
  if (import.meta.env.PROD) return true;

  return readProcessEnv('NODE_ENV') === 'production';
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
  const url = normalizeUrl(options.url ?? readEnvVar('PUBLIC_GHOST_URL'));
  const key = readString(
    options.key ?? readEnvVar('GHOST_CONTENT_API_KEY') ?? readEnvVar('GHOST_CONTENT_APIKEY'),
  );
  const version = readString(options.version) ?? GHOST_API_VERSION;
  const forceMockContent = options.forceMockContent
    ?? (readEnvFlag('E2E_SITE_FIXTURE') === true);
  const mockContent = options.mockContent
    ?? (forceMockContent ? true : undefined)
    ?? readEnvFlag('GHOST_MOCK_CONTENT')
    ?? !isProductionBuild();

  return {
    url,
    key,
    version,
    isConfigured: Boolean(url && key),
    mockContent,
    forceMockContent,
  };
}
