// Mood feed search panel. Toggles an inline search bar in the hero area,
// debounces queries, fetches the archive FTS endpoint, and renders ranked
// results linking to detail pages. Snippets arrive HTML-escaped server-side
// except for <mark> tags; we re-verify that allowlist before ever using
// innerHTML, so a compromised response can never inject other markup.

import { getMoodDetailHref } from '@/features/mood/shared/feed-anchor';

// Public search endpoint. Mirrors MOOD_SEARCH_PATH in @bunizao/contracts/routes
// ('/v2/mood/search'), inlined so this module builds dependency-free for the
// browser test harness (precedent: image-srcset.ts, commit 40f864a8).
const MOOD_SEARCH_ENDPOINT = '/api/v2/mood/search';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 64;
const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_RESULT_LIMIT = 10;

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

function formatResultTime(value: string): string {
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

export function buildResultRow(data: MoodSearchResultData): HTMLAnchorElement {
  const row = document.createElement('a');
  row.className = 'mood-search-result';
  row.href = getMoodDetailHref(data.id);

  const time = document.createElement('time');
  time.className = 'mood-search-result-time';
  if (data.datetime) time.dateTime = data.datetime;
  time.textContent = formatResultTime(data.datetime);
  row.appendChild(time);

  const snippet = document.createElement('p');
  snippet.className = 'mood-search-result-snippet';
  const raw = typeof data.snippet === 'string' ? data.snippet : '';
  if (isSafeSnippetHtml(raw)) {
    snippet.innerHTML = raw;
  } else {
    snippet.textContent = raw;
  }
  row.appendChild(snippet);

  const tags = Array.isArray(data.tags) ? data.tags.filter((tag) => typeof tag === 'string' && tag) : [];
  if (tags.length) {
    const tagsEl = document.createElement('p');
    tagsEl.className = 'mood-search-result-tags';
    tagsEl.textContent = tags.map((tag) => `#${tag}`).join(' ');
    row.appendChild(tagsEl);
  }

  return row;
}

export function initMoodSearchPanel(): void {
  const root = document.querySelector('[data-mood-search]');
  if (!root) return;

  const toggle = root.querySelector('[data-mood-search-toggle]') as HTMLButtonElement | null;
  const panel = root.querySelector('[data-mood-search-panel]') as HTMLElement | null;
  const input = root.querySelector('[data-mood-search-input]') as HTMLInputElement | null;
  const results = root.querySelector('[data-mood-search-results]') as HTMLElement | null;
  const status = root.querySelector('[data-mood-search-status]') as HTMLElement | null;
  const closeButton = root.querySelector('[data-mood-search-close]') as HTMLButtonElement | null;
  if (!toggle || !panel || !input || !results || !status) return;

  let debounceTimer: number | undefined;
  let activeController: AbortController | null = null;

  const setStatus = (text: string): void => {
    status.textContent = text;
  };

  const clearDebounce = (): void => {
    if (debounceTimer !== undefined) {
      window.clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
  };

  const abortActive = (): void => {
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
  };

  const renderResults = (items: MoodSearchResultData[]): void => {
    results.replaceChildren();
    if (!items.length) {
      setStatus('No results');
      return;
    }
    setStatus('');
    const fragment = document.createDocumentFragment();
    items.forEach((item) => fragment.appendChild(buildResultRow(item)));
    results.appendChild(fragment);
  };

  const runSearch = async (rawQuery: string): Promise<void> => {
    const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);
    if (query.length < MIN_QUERY_LENGTH) {
      abortActive();
      results.replaceChildren();
      setStatus('');
      return;
    }

    abortActive();
    const controller = new AbortController();
    activeController = controller;
    results.replaceChildren();
    setStatus('Searching…');

    try {
      const url = `${MOOD_SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}&limit=${SEARCH_RESULT_LIMIT}`;
      const response = await fetch(url, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(`Search failed (${response.status})`);
      const payload = (await response.json()) as { results?: MoodSearchResultData[] };
      if (controller.signal.aborted) return;
      renderResults(Array.isArray(payload.results) ? payload.results : []);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      results.replaceChildren();
      setStatus('Search is unavailable right now');
    } finally {
      if (activeController === controller) activeController = null;
    }
  };

  const open = (): void => {
    if (!panel.hidden) return;
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    input.focus();
  };

  const close = (): void => {
    clearDebounce();
    abortActive();
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    input.value = '';
    results.replaceChildren();
    setStatus('');
    toggle.focus();
  };

  toggle.addEventListener('click', () => {
    if (panel.hidden) open();
    else close();
  });

  closeButton?.addEventListener('click', close);

  input.addEventListener('input', () => {
    clearDebounce();
    const value = input.value;
    debounceTimer = window.setTimeout(() => {
      debounceTimer = undefined;
      void runSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      clearDebounce();
      void runSearch(input.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
}
