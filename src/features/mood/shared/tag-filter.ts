// Mood tag filter helpers. Mirrors site-api's `normalizeMoodTag` contract:
// trim, strip a leading '#', lowercase, and restrict to a conservative slug
// alphabet so hostile input can never reach a URL or query param.

const MOOD_TAG_SLUG_PATTERN = /^[a-z0-9_]{1,64}$/;

export function isMoodTagSlug(value: string): boolean {
  return MOOD_TAG_SLUG_PATTERN.test(value);
}

// Returns '' when the input does not normalize to a valid slug.
export function normalizeMoodTagSlug(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/^#/, '').toLowerCase();
  return isMoodTagSlug(normalized) ? normalized : '';
}

export function getMoodTagHref(tag: string): string {
  const slug = normalizeMoodTagSlug(tag);
  return slug ? `/mood?tag=${slug}` : '/mood';
}
