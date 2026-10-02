import * as React from 'react';
import { keepPreviousData, queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ReaderMe, ReaderMeResult } from '@bunizao/contracts/comments';
import type { MoodAiConfig, MoodIngestHealth, MoodSearchResult } from '@bunizao/contracts/mood';
import type { GhostAdminPostSummary } from '@/features/posts/server/ghost-admin';
import { toastManager } from '@/components/coss/toast';
import { ApiError, apiGet, apiSend, apiUrl, describeError } from '../app/api';
import { forgetUndo, registerUndo } from '../app/undo';

/* Reads and writes for the tool screens. Every failure becomes an Error
   whose message says what broke and what to do about it, so the screens can
   print it as is. */

export const toolKeys = {
  readerMe: ['tools', 'reader-me'] as const,
  ghostPosts: ['tools', 'ghost-posts'] as const,
  notifyPreview: (params: NotifyPreviewParams) => ['tools', 'notify-preview', params] as const,
  moodHealth: ['tools', 'mood', 'health'] as const,
  moodConfig: ['tools', 'mood', 'ai-config'] as const,
  moodSearch: (query: string) => ['tools', 'mood', 'search', query] as const,
};

/** A 5xx or a dropped connection may pass on retry; a missing key or
    binding will not. */
function retryTransient(count: number, error: unknown): boolean {
  const status = error instanceof ApiError ? error.status : 0;
  return count < 1 && (status === 0 || status === 502 || status === 504);
}

/** An ApiError whose message is already the sentence to print. */
class ReadableError extends ApiError {}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  return (await response.json().catch(() => null)) as Record<string, unknown> | null;
}

/* Settings: who the blog thinks this browser is. The reader session lives
   on the blog's own route, not the admin API. */

const readerOptions = queryOptions({
  queryKey: toolKeys.readerMe,
  queryFn: async ({ signal }): Promise<ReaderMe | null> => {
    const response = await fetch('/api/v2/reader/me', { credentials: 'same-origin', signal });
    if (!response.ok) throw new ReadableError(response.status, null, `The blog answered HTTP ${response.status}.`);
    const result = (await readJson(response)) as ReaderMeResult | null;
    return result?.reader ?? null;
  },
  retry: false,
});

export function useReader() {
  return useQuery(readerOptions);
}

/** Warms the reader line; a cached answer is enough to draw. */
export function prefetchReader(client: QueryClient): Promise<unknown> {
  return client.query({ ...readerOptions, staleTime: 'static' });
}

/* Blog previews: Ghost posts, polled while the tab is visible. */

export interface GhostPostList {
  posts: GhostAdminPostSummary[];
  /** The demo list: previews frame the mock blog, not Ghost drafts. */
  demo: boolean;
}

const GHOST_ERRORS: Record<number, string> = {
  503: 'Ghost is not configured here. Set GHOST_ADMIN_API_KEY and PUBLIC_GHOST_URL, then restart the dev server.',
  504: 'Ghost did not answer in time. Try again in a moment.',
  502: 'Ghost refused the request. Check that the Admin API key is still valid, then try again.',
};

export const ghostPostsOptions = queryOptions({
  queryKey: toolKeys.ghostPosts,
  queryFn: async ({ signal }): Promise<GhostPostList> => {
    const response = await fetch(apiUrl('ghost-posts'), { headers: { accept: 'application/json' }, signal });
    const payload = await readJson(response);
    if (!response.ok) {
      const message = GHOST_ERRORS[response.status] ?? `The post list failed with HTTP ${response.status}. Try again.`;
      throw new ReadableError(response.status, null, message);
    }
    return {
      posts: (payload?.posts as GhostAdminPostSummary[] | undefined) ?? [],
      demo: response.headers.get('X-Portal-Demo') === '1',
    };
  },
  // Ghost has no push, so the list polls; react-query pauses it while the
  // tab is hidden and stops it while the last read failed.
  refetchInterval: (query) => (query.state.status === 'error' ? false : 5_000),
  retry: retryTransient,
  staleTime: 0,
});

export function useGhostPosts() {
  return useQuery(ghostPostsOptions);
}

/** Warms the post list; a list already in the cache is enough to draw. */
export function prefetchGhostPosts(client: QueryClient): Promise<unknown> {
  return client.query({ ...ghostPostsOptions, staleTime: 'static' });
}

/* Email templates: site-api's notify preview, one payload for every
   template, keyed by mode and sample. */

export type NotifyMode = 'daily' | 'every_5h';
export type NotifySample = 'live' | 'rich';

export interface NotifyPreviewParams {
  mode: NotifyMode;
  sample: NotifySample;
  timezone: string;
}

export const EMAIL_KEYS = ['subscribe', 'welcome', 'blog', 'mood', 'digest', 'cancel', 'changeEmail', 'emailChanged', 'deleteRecord'] as const;
export const PAGE_KEYS = ['confirmSuccess', 'confirmError', 'unsubscribeSuccess', 'unsubscribeError', 'deleteRecordConfirm', 'deleteRecordDone'] as const;

export type EmailKey = (typeof EMAIL_KEYS)[number];
export type PageKey = (typeof PAGE_KEYS)[number];

export interface NotifyPreview {
  generatedAt: string;
  mode: NotifyMode;
  sample: NotifySample;
  timezone: string;
  siteUrl?: string;
  source: { channelTitle: string; channelAvatarUrl?: string; latestPostId: string | null; digestPostIds: string[] };
  subjects: Record<EmailKey, string>;
  html: Record<EmailKey, string>;
  callbackPages: Record<PageKey, string>;
}

function notifyPreviewOptions(params: NotifyPreviewParams) {
  return queryOptions({
    queryKey: toolKeys.notifyPreview(params),
    queryFn: async ({ signal }) => {
      try {
        return await apiGet<NotifyPreview>('notify-preview', { ...params }, signal);
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          throw new ReadableError(
            error.status,
            error.code,
            'buxx.me refused the preview request at its edge. Run bun dev:api to preview against a local site-api, or use the deployed portal.',
          );
        }
        throw error;
      }
    },
    staleTime: 60_000,
    retry: retryTransient,
  });
}

export function useNotifyPreview(params: NotifyPreviewParams) {
  return useQuery({ ...notifyPreviewOptions(params), placeholderData: keepPreviousData });
}

export function prefetchNotifyPreview(client: QueryClient, params: NotifyPreviewParams): Promise<unknown> {
  return client.query({ ...notifyPreviewOptions(params), staleTime: 'static' });
}

/* Mood operations. */

const MOOD_ERRORS: Record<string, string> = {
  mood_database_unavailable: 'site-api has no mood database binding (MOOD_DB). Add it to the Worker config and deploy.',
  mood_health_failed: 'site-api could not read the mood archive. Try again; if it persists, check wrangler tail on site-api.',
  mood_search_failed: 'The archive search failed. Simplify the words and try again.',
  mood_ai_config_kv_unavailable: 'site-api has no KV namespace for the model config. Check the CACHE binding, then try again.',
  mood_ai_config_failed: 'site-api could not save the model config. Try again in a moment.',
  invalid_mood_ai_model: 'A model name is empty. Pick a model and try again.',
  invalid_ai_model: 'The model name is empty. Pick a model and try again.',
  missing_ai_api_key: 'site-api has no AI_API_KEY. Set it with wrangler secret put AI_API_KEY, then test again.',
};

/** The sentence a screen prints for a failed mood or model call. */
export function explain(error: unknown): string {
  if (error instanceof ReadableError) return error.message;
  if (error instanceof ApiError && error.code) {
    if (MOOD_ERRORS[error.code]) return MOOD_ERRORS[error.code];
    if (error.code === 'ai_model_test_failed') {
      const detail = error.message && error.message !== error.code ? `${error.message}. ` : '';
      return `${detail}Check the model name against the gateway, or try again in a moment.`;
    }
  }
  return describeError(error);
}

/** An error whose message is the explained sentence, for LoadError. */
export function explained(error: unknown): Error {
  return new Error(explain(error));
}

const moodHealthOptions = queryOptions({
  queryKey: toolKeys.moodHealth,
  queryFn: ({ signal }) => apiGet<MoodIngestHealth>('admin/mood/health', undefined, signal),
  retry: retryTransient,
});

const moodConfigOptions = queryOptions({
  queryKey: toolKeys.moodConfig,
  queryFn: ({ signal }) => apiGet<MoodAiConfig>('admin/mood/ai-config', undefined, signal),
  retry: retryTransient,
});

function moodSearchOptions(trimmed: string) {
  return queryOptions({
    queryKey: toolKeys.moodSearch(trimmed),
    queryFn: ({ signal }) => apiGet<MoodSearchResult[]>('admin/mood/search', { q: trimmed }, signal),
    enabled: trimmed.length > 0,
    staleTime: 60_000,
    retry: retryTransient,
  });
}

/** Ingest health, polled every 5 minutes. Home shows it on every visit, and
    ingest drift is measured in posts and hours, not seconds. The coverage
    half is cached for 15 minutes by site-api anyway; the Mood screen's
    refresh button, focus and mount cover the rest. */
export function useMoodHealth() {
  return useQuery({ ...moodHealthOptions, refetchInterval: 5 * 60_000 });
}

export function useMoodConfig() {
  return useQuery(moodConfigOptions);
}

export function useMoodSearch(query: string) {
  return useQuery({ ...moodSearchOptions(query.trim()), placeholderData: keepPreviousData });
}

/** Warms what the mood screen draws first: health, models, and the search
    the URL names. Cached data is enough, however old: the screen draws it
    at once and refreshes it in the background. */
export function prefetchMood(client: QueryClient, query: string): Promise<unknown> {
  const trimmed = query.trim();
  return Promise.all([
    client.query({ ...moodHealthOptions, staleTime: 'static' }),
    client.query({ ...moodConfigOptions, staleTime: 'static' }),
    trimmed ? client.query({ ...moodSearchOptions(trimmed), staleTime: 'static' }) : undefined,
  ]);
}

export type ModelSlot = 'primary' | 'fallback';

async function putMoodConfig(next: Pick<MoodAiConfig, 'primary' | 'fallback'>): Promise<MoodAiConfig> {
  // apiSend has no PUT, and this is the one route that needs it.
  const response = await fetch(apiUrl('admin/mood/ai-config'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(next),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const code = typeof payload?.error === 'string' ? payload.error : null;
    throw new ApiError(response.status, code, typeof payload?.message === 'string' ? payload.message : code ?? `HTTP ${response.status}`);
  }
  return payload as unknown as MoodAiConfig;
}

// Writes go out one at a time, so an undo can never land before the change
// it undoes.
let writes: Promise<unknown> = Promise.resolve();

/** Sets one model slot: the screen changes in this frame, the write follows,
    and the toast offers Undo. A failed write puts the old value back. */
export function useSetMoodModel() {
  const client = useQueryClient();
  return React.useCallback(
    (slot: ModelSlot, model: string) => {
      const before = client.getQueryData<MoodAiConfig>(toolKeys.moodConfig);
      if (!before || before[slot] === model) return;
      const label = slot === 'primary' ? 'Primary' : 'Fallback';

      const write = (config: MoodAiConfig, onFail: () => void): void => {
        client.setQueryData(toolKeys.moodConfig, config);
        const pair = { primary: config.primary, fallback: config.fallback };
        writes = writes.then(
          () =>
            putMoodConfig(pair).then(
              (saved) => {
                // A newer local change may already be on screen; only settle
                // the value this write was for.
                const current = client.getQueryData<MoodAiConfig>(toolKeys.moodConfig);
                if (current && current.primary === saved.primary && current.fallback === saved.fallback) {
                  client.setQueryData(toolKeys.moodConfig, saved);
                }
              },
              (error: unknown) => {
                onFail();
                toastManager.add({ type: 'error', title: `${label} model was not saved`, description: explain(error) });
              },
            ),
          () => undefined,
        );
      };

      const next = { ...before, [slot]: model };
      write(next, () => client.setQueryData(toolKeys.moodConfig, before));
      const undo = (): void => write(before, () => client.setQueryData(toolKeys.moodConfig, next));
      const toastId: string = toastManager.add({
        type: 'success',
        title: `${label} model is now ${model}`,
        timeout: 5000,
        actionProps: { children: 'Undo', onClick: undo },
        onRemove: () => forgetUndo(toastId),
      });
      registerUndo(toastId, undo);
    },
    [client],
  );
}

export interface ModelTest {
  model: string;
  state: 'running' | 'ok' | 'failed';
  ms: number | null;
  reply: string | null;
  error: string | null;
}

/** Test results by model name, kept for the screen's life. */
export function useModelTests(): [Record<string, ModelTest>, (model: string) => void] {
  const [tests, setTests] = React.useState<Record<string, ModelTest>>({});
  const run = React.useCallback((model: string) => {
    const started = performance.now();
    setTests((current) => ({ ...current, [model]: { model, state: 'running', ms: null, reply: null, error: null } }));
    apiSend<{ model: string; text: string }>('POST', 'admin/ai/test', { model }).then(
      (result) => {
        const ms = Math.round(performance.now() - started);
        setTests((current) => ({ ...current, [model]: { model, state: 'ok', ms, reply: result.text, error: null } }));
      },
      (error: unknown) => {
        const ms = Math.round(performance.now() - started);
        setTests((current) => ({ ...current, [model]: { model, state: 'failed', ms, reply: null, error: explain(error) } }));
      },
    );
  }, []);
  return [tests, run];
}
