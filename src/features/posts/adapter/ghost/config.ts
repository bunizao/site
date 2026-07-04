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

const PRODUCTION_BRANCHES = new Set(['main', 'production', 'cloudflare-runtime']);

function readProcessEnv(name: string): string | null {
  if (typeof process === 'undefined' || !process.env) {
    return null;
  }

  return readString(process.env[name]);
}

// Vite injects .env values into import.meta.env, not process.env.
// Use this as the primary source when running under astro dev (Node SSR).
function readViteEnv(name: string): string | null {
  try {
    const env = (import.meta as { env?: Record<string, unknown> }).env;
    const raw = env?.[name];
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

function readEnvVar(name: string): string | null {
  return readViteEnv(name) ?? readProcessEnv(name);
}

function readEnvFlag(name: string): boolean | undefined {
  const value = readEnvVar(name)?.toLowerCase();
  if (!value) return undefined;
  return value === '1' || value === 'true';
}

function isProductionBuild(): boolean {
  try {
    const env = (import.meta as { env?: Record<string, unknown> }).env;
    if (env?.PROD === true) return true;
  } catch {
    // Fall through to NODE_ENV below.
  }

  return readProcessEnv('NODE_ENV') === 'production';
}

function isWorkersPreviewBuild(): boolean {
  const branch = readProcessEnv('WORKERS_CI_BRANCH')?.trim();

  if (readProcessEnv('WORKERS_CI') !== '1' || !branch) return false;

  return !PRODUCTION_BRANCHES.has(branch);
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
    ?? isWorkersPreviewBuild()
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
