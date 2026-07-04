// Shared display formatting for blog dates. chl.ee renders "June 16, 2026";
// we match it with a fixed en-US, UTC format so SSG output is deterministic.

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatPostDate(isoDate: string): string {
  return DATE_FORMAT.format(new Date(isoDate));
}

// Compact "Apr 9" form for dense lists (tag-card post previews). Same fixed
// en-US/UTC contract as formatPostDate so SSG output stays deterministic.
const SHORT_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export function formatPostDateShort(isoDate: string): string {
  return SHORT_DATE_FORMAT.format(new Date(isoDate));
}

// Canonical blog paths, always with a trailing slash. The prerendered pages are
// directories (`/blog/slug/index.html`), so the slashless form costs a 307
// redirect at the edge before the HTML request even starts. Every internal
// link, RSS item, and sitemap entry goes through these so navigation never
// pays that round-trip.
export function postPath(slug: string): string {
  return `/blog/${slug}/`;
}

export function tagPath(slug: string): string {
  return `/blog/tag/${slug}/`;
}

// A `view-transition-name` must be a valid CSS custom-ident: it can't start with
// a digit and can't contain arbitrary characters. The `post-` prefix guarantees
// a letter lead; the replace strips anything a Ghost slug might smuggle in. The
// same name on the list row title and the article headline is what makes the
// clicked title morph across the cross-document navigation.
export function postTitleTransitionName(slug: string): string {
  return `post-${slug.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}
