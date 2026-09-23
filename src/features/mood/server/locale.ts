import { blog } from '@/data/site';

/* Which language the mood zone answers in.

   The blog used to negotiate this too, and the helper lived with the rest of
   its Accept-Language code. It now serves translations at /blog/<locale>/<slug>
   -- the URL says the language, so nothing is negotiated -- which leaves /mood
   and /mood/[id] as the only pages that still ask. So the code lives here, next
   to the surface that uses it.

   Order is deliberate: an explicit ?lang beats the reader's stored choice, which
   beats what their browser asks for. */

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

/** Match a language range against what we have, widening `zh-Hant-TW` to `zh`. */
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

/** Resolve a language using query, cookie, and weighted Accept-Language. */
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
