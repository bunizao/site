import { blog } from '@/data/site';
import { readOptionalEnv, type EnvSource } from '@/lib/runtime/env';

export const DEFAULT_BLOG_OG_IMAGE_ENDPOINT = 'https://og.tuuhub.com/api/og';
export const BLOG_OG_IMAGE_WIDTH = 1200;
export const BLOG_OG_IMAGE_HEIGHT = 630;
export const BLOG_META_DESCRIPTION_MAX_LENGTH = 220;

const OG_TITLE_MAX_LENGTH = 60;
const OG_SITE_MAX_LENGTH = 80;
const OG_EXCERPT_MAX_LENGTH = 80;
const OG_AUTHOR_MAX_LENGTH = 80;
const OG_DATE_MAX_LENGTH = 48;

export interface BlogOgImageInput {
  title: string;
  site?: string | null;
  excerpt?: string | null;
  author?: string | null;
  date?: string | null;
  image?: string | null;
  theme?: 'pixel' | 'modern' | null;
  pixelFont?: string | null;
}

interface BlogOgImageOptions {
  endpoint?: string | null;
  env?: EnvSource;
}

function readConfiguredEndpoint(env?: EnvSource): string | undefined {
  if (env) {
    return readEnvValue(env, 'PUBLIC_BLOG_OG_IMAGE_ENDPOINT')
      ?? readEnvValue(env, 'BLOG_OG_IMAGE_ENDPOINT');
  }

  return readOptionalEnv(undefined, 'PUBLIC_BLOG_OG_IMAGE_ENDPOINT', env)
    ?? readOptionalEnv(undefined, 'BLOG_OG_IMAGE_ENDPOINT', env);
}

function readEnvValue(env: EnvSource, name: string): string | undefined {
  const raw = env[name];
  const value = typeof raw === 'string' ? raw.trim() : '';

  return value || undefined;
}

function normalizeEndpoint(endpoint?: string | null): string {
  const raw = endpoint?.trim() || DEFAULT_BLOG_OG_IMAGE_ENDPOINT;

  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
  } catch {
    // Fall through to the known-good public endpoint.
  }

  return DEFAULT_BLOG_OG_IMAGE_ENDPOINT;
}

function appendOptionalParam(params: URLSearchParams, key: string, value?: string | null): void {
  const trimmed = value?.trim();

  if (trimmed) {
    params.set(key, trimmed);
  }
}

export function getBlogOgImageEndpoint(options: BlogOgImageOptions = {}): string {
  return normalizeEndpoint(options.endpoint ?? readConfiguredEndpoint(options.env));
}

export function normalizeBlogMetaText(
  value: string | null | undefined,
  maxLength = BLOG_META_DESCRIPTION_MAX_LENGTH,
): string {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function buildBlogOgImageUrl(
  input: BlogOgImageInput,
  options: BlogOgImageOptions = {},
): string {
  const endpoint = getBlogOgImageEndpoint(options);
  const url = new URL(endpoint);
  const title = normalizeBlogMetaText(input.title, OG_TITLE_MAX_LENGTH) || blog.name;

  url.searchParams.set('title', title);
  url.searchParams.set('site', normalizeBlogMetaText(input.site, OG_SITE_MAX_LENGTH) || blog.name);
  url.searchParams.set('theme', input.theme?.trim() || 'pixel');

  appendOptionalParam(url.searchParams, 'excerpt', normalizeBlogMetaText(input.excerpt, OG_EXCERPT_MAX_LENGTH));
  appendOptionalParam(url.searchParams, 'author', normalizeBlogMetaText(input.author, OG_AUTHOR_MAX_LENGTH));
  appendOptionalParam(url.searchParams, 'date', normalizeBlogMetaText(input.date, OG_DATE_MAX_LENGTH));
  appendOptionalParam(url.searchParams, 'image', input.image);
  appendOptionalParam(url.searchParams, 'pixelFont', input.pixelFont);

  return url.toString();
}
