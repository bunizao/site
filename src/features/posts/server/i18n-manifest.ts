import { blog } from '@/data/site';
import { readRuntimeEnvSource, type RuntimeEnvLocals } from '@/lib/runtime/env';
import { getAccessiblePosts } from './content';
import { getCanonicalSlug, getPostLocale, isTranslation } from '../i18n';

export interface I18nManifestEntry {
  translations?: Record<string, string>;
  canonical?: string;
  locale?: string;
}

export type I18nManifest = Record<string, I18nManifestEntry>;

interface AssetsBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

let builtManifestPromise: Promise<I18nManifest | null> | null = null;
let assetManifestPromise: Promise<I18nManifest | null> | null = null;

function assetsFromLocals(locals: unknown): AssetsBinding | null {
  const env = readRuntimeEnvSource(locals as RuntimeEnvLocals | undefined);
  const assets = env?.ASSETS;
  return assets && typeof assets === 'object' && typeof (assets as AssetsBinding).fetch === 'function'
    ? assets as AssetsBinding
    : null;
}

function createManifest(posts: Awaited<ReturnType<typeof getAccessiblePosts>>): I18nManifest {
  const bySlug = new Map(posts.map((post) => [post.slug, post]));
  const manifest: I18nManifest = {};
  const groups = new Map<string, typeof posts>();
  for (const post of posts) {
    const canonical = getCanonicalSlug(post);
    const group = groups.get(canonical);
    if (group) group.push(post);
    else groups.set(canonical, [post]);
  }
  for (const [canonical, group] of groups) {
    if (!bySlug.has(canonical)) continue;
    const translations: Record<string, string> = {};
    for (const post of group) {
      if (!isTranslation(post)) continue;
      const locale = getPostLocale(post);
      if (translations[locale]) continue;
      translations[locale] = post.slug;
    }
    if (!Object.keys(translations).length) continue;
    manifest[canonical] = { translations };
    for (const post of group) {
      if (isTranslation(post)) {
        manifest[post.slug] = { canonical, locale: getPostLocale(post) };
      }
    }
  }
  return manifest;
}

export async function readI18nManifest(locals: unknown, origin: string): Promise<I18nManifest | null> {
  const assets = assetsFromLocals(locals);
  if (assets) {
    if (!assetManifestPromise) {
      assetManifestPromise = (async () => {
        try {
          const response = await assets.fetch(new Request(new URL('/_i18n/posts.json', origin)));
          if (response.ok) return await response.json() as I18nManifest;
        } catch {
          return null;
        }
        return null;
      })();
    }
    return assetManifestPromise;
  }
  if (!builtManifestPromise) {
    builtManifestPromise = getAccessiblePosts({ outputTarget: 'web' })
      .then(createManifest)
      .catch(() => null);
  }
  return builtManifestPromise;
}

export function resetI18nManifestForTests(): void {
  builtManifestPromise = null;
  assetManifestPromise = null;
}

export function isBlogPostPath(pathname: string): boolean {
  return /^\/blog\/[^/]+\/?$/.test(pathname) && !/^\/blog\/(tag|rss\.xml|search\.json)(?:\/|$)/.test(pathname);
}

export function manifestEntryForPath(manifest: I18nManifest, pathname: string): { slug: string; entry: I18nManifestEntry } | null {
  const slug = pathname.replace(/^\/blog\//, '').replace(/\/+$/, '');
  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    return null;
  }
  const entry = manifest[decoded];
  return entry ? { slug: decoded, entry } : null;
}

export function localeVersions(entry: I18nManifestEntry): string[] {
  return [blog.locale.default, ...Object.keys(entry.translations ?? {})];
}

export function localeForTranslation(entry: I18nManifestEntry): string | null {
  return entry.locale ?? null;
}
