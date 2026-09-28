import * as React from 'react';
import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  AdminCommentModeListResult,
  AdminCommentModeResponse,
  AdminCommentModeState,
  CommentSurface,
  CommentsMode,
} from '@bunizao/contracts';
import { toastManager } from '@/components/coss/toast';
import { ApiError, MISSING_ROUTE_MESSAGE, apiGet, apiSend, describeError, isMissingRoute } from '../app/api';
import { shareRowsById } from '../app/share-rows';
import { forgetUndo, registerUndo } from '../app/undo';
import type { Tone } from './ui';

/* Per-post comment modes: the owner's override beside what the post's
   tags give. A set or clear shows in the frame it is clicked, with Undo;
   the server's answer then replaces the guess. Readers with a cookie see
   the change at once, the edge cache serves everyone else within about
   90 seconds, and every place a mode changes says so. Post modes and the
   comment pane both draw from here, so the two stay in step. */

export const CACHE_NOTE = 'Changes reach cookie-less readers within about 90s.';

export const MODE_LABELS: Record<CommentsMode, string> = { open: 'Open', readonly: 'Read-only', off: 'Off' };
export const MODE_TONE: Record<CommentsMode, Tone> = { open: 'neutral', readonly: 'warning', off: 'neutral' };

/** The override switch: None hands the post back to its tags. */
export type ModeChoice = CommentsMode | 'none';
export const MODE_CHOICES = [
  { value: 'none', label: 'None' },
  { value: 'open', label: MODE_LABELS.open },
  { value: 'readonly', label: MODE_LABELS.readonly },
  { value: 'off', label: MODE_LABELS.off },
] as const satisfies ReadonlyArray<{ value: ModeChoice; label: string }>;

export const modeKeys = {
  all: ['comment-modes'] as const,
  list: ['comment-modes', 'list'] as const,
  one: (surface: CommentSurface, postId: string) => ['comment-modes', 'one', surface, postId] as const,
};

export function modeId(state: Pick<AdminCommentModeState, 'surface' | 'postId'>): string {
  return `${state.surface}:${state.postId}`;
}

const listOptions = queryOptions({
  queryKey: modeKeys.list,
  queryFn: ({ signal }) => apiGet<AdminCommentModeListResult>('admin/comment-modes', undefined, signal),
  // A focus refetch would drop rows cleared on this visit from under the
  // pointer; the list refreshes when the screen is next opened.
  refetchOnWindowFocus: false,
  // A cleared override keeps every other row's object.
  structuralSharing: shareRowsById<AdminCommentModeState>('modes', modeId),
});

export function useModeOverrides() {
  return useQuery(listOptions);
}

export function prefetchModeOverrides(client: QueryClient): Promise<unknown> {
  return client.query({ ...listOptions, staleTime: 'static' }).catch(() => null);
}

function oneOptions(surface: CommentSurface, postId: string) {
  return queryOptions({
    queryKey: modeKeys.one(surface, postId),
    queryFn: ({ signal }) =>
      apiGet<AdminCommentModeResponse>(`admin/comment-modes/${surface}/${encodeURIComponent(postId)}`, undefined, signal).then((response) => response.mode),
    staleTime: 60_000,
  });
}

/** One post's state, for a search result. A cached answer shows even
    while `enabled` is false. */
export function useModeState(surface: CommentSurface, postId: string, enabled: boolean) {
  return useQuery({ ...oneOptions(surface, postId), enabled });
}

/** Why a post's mode could not be read or changed, in words. */
export function describeModeError(error: unknown): string {
  if (isMissingRoute(error)) return MISSING_ROUTE_MESSAGE;
  if (error instanceof ApiError) {
    if (error.code === 'post_not_found') return 'No published post has this id.';
    if (error.code === 'post_lookup_unavailable') return 'Ghost did not answer, so the post could not be checked. Try again in a moment.';
    if (error.code === 'invalid_post') return 'That is not a post id.';
  }
  return describeError(error);
}

function guessOf(state: AdminCommentModeState, mode: CommentsMode | null): AdminCommentModeState {
  return { ...state, override: mode, effectiveMode: mode ?? state.tagMode, updatedAt: mode ? new Date().toISOString() : null };
}

/** Writes a state into the list (in place, or appended) and its own entry.
    A cleared row stays in the list until the screen drops it on leave. */
function write(client: QueryClient, state: AdminCommentModeState): void {
  const id = modeId(state);
  client.setQueryData<AdminCommentModeListResult>(modeKeys.list, (data) => {
    if (!data) return data;
    const at = data.modes.findIndex((entry) => modeId(entry) === id);
    if (at < 0) return state.override ? { modes: [...data.modes, state] } : data;
    const modes = data.modes.slice();
    modes[at] = state;
    return { modes };
  });
  client.setQueryData(modeKeys.one(state.surface, state.postId), state);
}

/** Drops rows whose override was cleared, for the next visit. */
export function pruneCleared(client: QueryClient): void {
  client.setQueryData<AdminCommentModeListResult>(modeKeys.list, (data) =>
    data && data.modes.some((entry) => !entry.override) ? { modes: data.modes.filter((entry) => entry.override) } : data,
  );
}

/* The last request per post wins: two quick changes answer out of order
   and only the later one may land. */
const latestRequest = new Map<string, number>();
let requestCount = 0;

export function useSetMode() {
  const client = useQueryClient();
  return React.useCallback(
    async function set(state: AdminCommentModeState, mode: CommentsMode | null, options: { quiet?: boolean } = {}): Promise<void> {
      if (state.override === mode) return;
      const id = modeId(state);
      const ticket = ++requestCount;
      latestRequest.set(id, ticket);
      const name = state.title ?? state.postId;
      await client.cancelQueries({ queryKey: modeKeys.all });
      write(client, guessOf(state, mode));

      let toastId: string | null = null;
      if (!options.quiet) {
        const undo = (): void => {
          if (toastId) forgetUndo(toastId);
          void set(guessOf(state, mode), state.override, { quiet: true });
        };
        toastId = toastManager.add({
          title: mode ? `${MODE_LABELS[mode]} on “${name}”` : `“${name}” follows its ${state.surface === 'mood' ? 'site default' : 'tags'} again`,
          description: CACHE_NOTE,
          timeout: 6000,
          actionProps: { children: 'Undo', onClick: undo },
          onRemove: (): void => {
            if (toastId) forgetUndo(toastId);
          },
        });
        registerUndo(toastId, undo);
      }

      try {
        const path = `admin/comment-modes/${state.surface}/${encodeURIComponent(state.postId)}`;
        const response = mode
          ? await apiSend<AdminCommentModeResponse>('PUT', path, { mode })
          : await apiSend<AdminCommentModeResponse>('DELETE', path);
        if (latestRequest.get(id) === ticket) write(client, response.mode);
      } catch (error) {
        if (latestRequest.get(id) !== ticket) return;
        write(client, state);
        if (toastId) toastManager.close(toastId);
        toastManager.add({ type: 'error', title: `The mode of “${name}” did not change`, description: describeModeError(error) });
      }
    },
    [client],
  );
}
