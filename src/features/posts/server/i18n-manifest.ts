import { readRuntimeEnvSource, type RuntimeEnvLocals } from '@/lib/runtime/env';
import { getAccessiblePosts } from './content';
import {
  getCanonicalSlug,
  getPostLocale,
  isKnownLocale,
  isTranslation,
  readLocaleTag,
} from '../i18n';
import type { Post } from '../types';

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

/**
 * Maps each translated article to its versions and each translation back to
 * its original. The build runs it `strict`, so a translation tag the site
 * cannot serve fails the deploy; the dev fallback maps what it can instead.
 */
export function createManifest(
  posts: Array<Pick<Post, 'slug' | 'tags'>>,
  { strict = false } = {},
): I18nManifest {
  const slugs = new Set(posts.map((post) => post.slug));
  const manifest: I18nManifest = {};
  const groups = new Map<string, typeof posts>();
  for (const post of posts) {
    const tag = readLocaleTag(post);
    if (strict && tag?.canonicalSlug && !isKnownLocale(tag.locale)) {
      throw new Error(`Unknown blog translation locale on ${post.slug}: ${tag.locale}`);
    }
    const canonical = getCanonicalSlug(post);
    const group = groups.get(canonical);
    if (group) group.push(post);
    else groups.set(canonical, [post]);
  }
  for (const [canonical, group] of groups) {
    if (!slugs.has(canonical)) {
      if (strict) throw new Error(`Blog translation target does not exist: ${canonical}`);
      continue;
    }
    const translations: Record<string, string> = {};
    const seenLocales = new Set<string>();
    for (const post of group) {
      const locale = getPostLocale(post);
      if (strict && seenLocales.has(locale)) {
        throw new Error(`Duplicate ${locale} version in blog group ${canonical}`);
      }
      seenLocales.add(locale);
      if (!isTranslation(post) || translations[locale]) continue;
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
      .then((posts) => createManifest(posts))
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
