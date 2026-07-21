// Pure mood-search helpers shared by the site-wide ⌘K palette. The old inline
// hero search panel is gone; its FTS plumbing lives here as small, DOM-light
// functions so the palette (and the browser test harness) can reuse it without
// pulling in any UI. Snippets arrive HTML-escaped server-side except for <mark>
// tags; callers must re-verify that allowlist (isSafeSnippetHtml) before ever
// using innerHTML, so a compromised response can never inject other markup.

// Public search endpoint. Mirrors MOOD_SEARCH_PATH in @bunizao/contracts/routes
// ('/v2/mood/search'), inlined so this module builds dependency-free for the
// browser test harness (precedent: image-srcset.ts, commit 40f864a8).
export const MOOD_SEARCH_ENDPOINT = '/api/v2/mood/search';

export const MOOD_MIN_QUERY_LENGTH = 2;
export const MOOD_MAX_QUERY_LENGTH = 64;

export interface MoodSearchResultData {
  id: string;
  datetime: string;
  snippet: string;
  tags: string[];
  sentiment_label?: string | null;
}

// A snippet is safe to inject as HTML only when its sole tags are <mark>/</mark>.
// Strip those, then any remaining '<' means the server sent unexpected markup.
export function isSafeSnippetHtml(snippet: string): boolean {
  if (typeof snippet !== 'string') return false;
  return !snippet.replace(/<\/?mark>/gi, '').includes('<');
}

export function formatMoodResultTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface SearchMoodsOptions {
  signal?: AbortSignal;
  limit?: number;
}

// Fetch ranked mood results for a query. Returns [] for too-short queries and
// throws on transport/HTTP failure so callers can show their own error state.
export async function searchMoods(
  rawQuery: string,
  options: SearchMoodsOptions = {},
): Promise<MoodSearchResultData[]> {
  const query = rawQuery.trim().slice(0, MOOD_MAX_QUERY_LENGTH);
  if (query.length < MOOD_MIN_QUERY_LENGTH) return [];

  const limit = options.limit ?? 6;
  const url = `${MOOD_SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}&limit=${limit}`;
  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) throw new Error(`Mood search failed (${response.status})`);
  const payload = (await response.json()) as { results?: MoodSearchResultData[] };
  return Array.isArray(payload.results) ? payload.results : [];
}
