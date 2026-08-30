import { blog } from '@/data/site';

interface AcceptEntry {
  mediaType: string;
  q: number;
  order: number;
}

export interface RequestLocaleOptions {
  query?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
  availableLocales?: readonly string[];
  defaultLocale?: string;
}

interface LanguagePreference {
  range: string;
  q: number;
  order: number;
}

function parseLanguagePreferences(value: string | null | undefined): LanguagePreference[] {
  if (!value?.trim()) return [];
  return value.split(',').flatMap((part, order) => {
    const [rawRange, ...params] = part.split(';');
    const range = rawRange.trim().toLowerCase();
    if (!range) return [];
    const rawQ = params.find((param) => param.trim().toLowerCase().startsWith('q='));
    const parsedQ = rawQ ? Number(rawQ.trim().slice(2)) : 1;
    const q = Number.isFinite(parsedQ) ? Math.max(0, Math.min(1, parsedQ)) : 0;
    return [{ range, q, order }];
  });
}

function lookupLocale(range: string, available: readonly string[]): string | null {
  if (range === '*') return available[0] ?? null;
  let candidate = range;
  while (candidate) {
    const match = available.find((locale) => locale.toLowerCase() === candidate);
    if (match) return match;
    const cut = candidate.lastIndexOf('-');
    if (cut === -1) break;
    candidate = candidate.slice(0, cut);
  }
  return null;
}

function readCookieLocale(cookie: string | null | undefined): string | null {
  for (const pair of cookie?.split(';') ?? []) {
    const [name, ...value] = pair.trim().split('=');
    if (name === 'blog_lang') return value.join('=').trim() || null;
  }
  return null;
}

/** Resolve a blog language using query, cookie, and weighted Accept-Language. */
export function resolveRequestLocale(options: RequestLocaleOptions = {}): string {
  const available = options.availableLocales?.length
    ? [...options.availableLocales]
    : Object.keys(blog.copy);
  const fallback = options.defaultLocale ?? blog.locale.default;
  const resolve = (value: string | null | undefined): string | null => {
    if (!value?.trim()) return null;
    return lookupLocale(value.trim().toLowerCase(), available);
  };
  const explicit = resolve(options.query);
  if (explicit) return explicit;
  const cookie = resolve(readCookieLocale(options.cookie));
  if (cookie) return cookie;
  const accepted = parseLanguagePreferences(options.acceptLanguage)
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q || a.order - b.order);
  for (const entry of accepted) {
    const match = lookupLocale(entry.range, available);
    if (match) return match;
  }
  return resolve(fallback) ?? available[0] ?? fallback;
}

function parseQ(value: string | undefined): number {
  if (!value) return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(1, Math.max(0, parsed));
}

function parseAccept(accept: string | null): AcceptEntry[] {
  if (!accept?.trim()) return [];

  return accept
    .split(',')
    .map((part, order): AcceptEntry | null => {
      const [rawMediaType, ...rawParams] = part.split(';');
      const mediaType = rawMediaType.trim().toLowerCase();
      if (!mediaType || !mediaType.includes('/')) return null;

      const qParam = rawParams
        .map((param) => param.trim())
        .find((param) => param.toLowerCase().startsWith('q='));
      const q = parseQ(qParam?.slice(2).trim());

      return { mediaType, q, order };
    })
    .filter((entry): entry is AcceptEntry => Boolean(entry));
}

function specificityFor(mediaType: string, expected: string): number | null {
  if (mediaType === expected) return 2;

  const [type] = expected.split('/');
  if (mediaType === `${type}/*`) return 1;
  if (mediaType === '*/*') return 0;

  return null;
}

function qualityFor(entries: AcceptEntry[], expected: string): number {
  let best: { q: number; specificity: number; order: number } | null = null;

  for (const entry of entries) {
    const specificity = specificityFor(entry.mediaType, expected);
    if (specificity == null) continue;

    if (
      !best ||
      specificity > best.specificity ||
      (specificity === best.specificity && entry.order < best.order)
    ) {
      best = { q: entry.q, specificity, order: entry.order };
    }
  }

  return best?.q ?? 0;
}

export function prefersMarkdown(accept: string | null): boolean {
  const entries = parseAccept(accept);
  const explicitMarkdown = entries.some((entry) => entry.mediaType === 'text/markdown' && entry.q > 0);

  if (!explicitMarkdown) return false;

  const markdownQ = qualityFor(entries, 'text/markdown');
  const htmlQ = qualityFor(entries, 'text/html');

  return markdownQ > 0 && markdownQ >= htmlQ;
}

export function estimateMarkdownTokens(markdown: string): number {
  if (!markdown) return 0;
  return Math.ceil(markdown.length / 4);
}
