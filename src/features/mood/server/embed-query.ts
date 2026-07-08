import {
  isValidCursor,
  readBooleanFlag,
  readEnumQuery,
  readIntQuery,
} from '@/lib/http/query';

const MOOD_EMBED_THEMES = ['auto', 'light', 'dark'] as const;
const MOOD_EMBED_DENSITIES = ['regular', 'compact'] as const;
const MOOD_EMBED_FONTS = ['mono', 'system'] as const;

export interface MoodEmbedQuery {
  theme: (typeof MOOD_EMBED_THEMES)[number];
  idParam: string;
  count: number;
  frame: boolean;
  density: (typeof MOOD_EMBED_DENSITIES)[number];
  font: (typeof MOOD_EMBED_FONTS)[number];
  originParam: string | null;
  hasRefreshParam: boolean;
  refresh: number | null;
  showLink: boolean;
}

export function readMoodEmbedQuery(url: URL): MoodEmbedQuery {
  const idParam = (url.searchParams.get('id') ?? '').trim();
  const refreshRaw = readIntQuery(url, 'refresh');

  return {
    theme: readEnumQuery(url, 'theme', MOOD_EMBED_THEMES, 'auto'),
    idParam,
    count: idParam ? 1 : Math.min(10, Math.max(1, readIntQuery(url, 'count') ?? 1)),
    frame: readBooleanFlag(url, 'frame', true),
    density: readEnumQuery(url, 'density', MOOD_EMBED_DENSITIES, 'regular'),
    font: readEnumQuery(url, 'font', MOOD_EMBED_FONTS, 'mono'),
    originParam: url.searchParams.get('origin'),
    hasRefreshParam: url.searchParams.has('refresh'),
    refresh: refreshRaw !== null
      ? Math.max(30, Math.min(3600, refreshRaw))
      : null,
    showLink: readBooleanFlag(url, 'link', true),
  };
}

export function normalizeMoodEmbedCacheSearch(url: URL): string | null {
  if (url.searchParams.has('refresh')) return null;
  if (url.searchParams.has('origin')) return null;

  const query = readMoodEmbedQuery(url);
  const normalized = new URLSearchParams();

  if (query.idParam) {
    if (!isValidCursor(query.idParam)) return null;
    normalized.set('id', query.idParam);
  } else if (query.count !== 1) {
    normalized.set('count', String(query.count));
  }

  if (query.theme !== 'auto') normalized.set('theme', query.theme);
  if (!query.frame) normalized.set('frame', 'false');
  if (query.density !== 'regular') normalized.set('density', query.density);
  if (query.font !== 'mono') normalized.set('font', query.font);
  if (!query.showLink) normalized.set('link', 'false');

  const search = normalized.toString();
  return search ? `?${search}` : '';
}
