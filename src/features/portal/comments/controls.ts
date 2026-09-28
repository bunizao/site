import * as React from 'react';
import { useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import type { AdminCommentLockResponse, AdminCommentPinResponse } from '@bunizao/contracts';
import { toastManager } from '@/components/coss/toast';
import type { PortalComment, PortalComments } from '@/features/admin/server/portal-client';
import { ApiError, apiSend, describeError } from '../app/api';
import { forgetUndo, registerUndo } from '../app/undo';
import { CACHE_NOTE } from '../moderation/modes-data';
import { commentKeys } from './data';
import { stamp } from './model';

/* The owner's pin and thread lock. Each shows in the frame it is asked
   for (every cached list patched in place, no row moves), is sent at once,
   and offers Undo, which sends the inverse once the act has landed. Both
   live on the thread root: a post has at most one pin, and a lock refuses
   new reader replies under its root (the owner's own still publish). */

type Controls = Partial<Pick<PortalComment, 'pinnedAt' | 'lockedAt'>>;
type Patch = ReadonlyMap<string, Controls>;
type ListData = InfiniteData<PortalComments, number>;

/** Write fields onto rows in every cached list. Rows without a patch keep
    their object, so only the patched rows re-render. */
function patchRows(client: QueryClient, patch: Patch): void {
  if (patch.size === 0) return;
  for (const [key, data] of client.getQueriesData<ListData>({ queryKey: commentKeys.lists() })) {
    if (!data?.pages.some((page) => page.comments.some((row) => patch.has(row.id)))) continue;
    client.setQueryData<ListData>(key, {
      ...data,
      pages: data.pages.map((page) =>
        page.comments.some((row) => patch.has(row.id))
          ? { ...page, comments: page.comments.map((row) => (patch.has(row.id) ? { ...row, ...patch.get(row.id) } : row)) }
          : page),
    });
  }
}

/** A row from any cached list, or null when none has loaded it. */
function cachedRow(client: QueryClient, id: string): PortalComment | null {
  for (const [, data] of client.getQueriesData<ListData>({ queryKey: commentKeys.lists() })) {
    for (const page of data?.pages ?? []) {
      const row = page.comments.find((comment) => comment.id === id);
      if (row) return row;
    }
  }
  return null;
}

function cachedRows(client: QueryClient): PortalComment[] {
  return client
    .getQueriesData<ListData>({ queryKey: commentKeys.lists() })
    .flatMap(([, data]) => data?.pages.flatMap((page) => page.comments) ?? []);
}

/** site-api's rule: only a published root can be the post's pin. */
export function canPin(comment: PortalComment): boolean {
  return comment.parentId === null && comment.status === 'published';
}

/** The row that holds the thread's lock: the comment itself when it is a
    root, else its root from `rows`, when loaded. */
export function lockHolder(comment: PortalComment, rows: readonly PortalComment[]): PortalComment | null {
  if (comment.parentId === null) return comment;
  return rows.find((row) => row.id === comment.parentId) ?? null;
}

function samePost(a: PortalComment, b: PortalComment): boolean {
  return a.postId === b.postId && (a.surface ?? null) === (b.surface ?? null);
}

function postName(comment: PortalComment): string {
  return comment.postTitle ?? comment.postSlug ?? comment.postId;
}

/** Why a pin or lock did not change, in words that say what to do. */
function controlError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'comment_not_pinnable') return 'Only a published first comment can be pinned. Approve it first, or pin the comment it answers.';
    if (error.code === 'comment_not_lockable') return 'It answers a comment on Telegram, so there is no thread here to lock.';
  }
  return describeError(error);
}

interface Landed {
  /** site-api's word on the rows, applied unless the act was undone. */
  patch: Patch;
  /** Sends the inverse; null when the act changed nothing to undo. */
  inverse: (() => Promise<Patch>) | null;
  /** Replaces the receipt when there is nothing to undo. */
  already?: string;
}

interface Act {
  title: string;
  description: string;
  failed: string;
  patch: Patch;
  before: Patch;
  send: () => Promise<Landed>;
}

/** `show` paints a patch on the rows on screen in the frame it is made
    (the screen's stable view); the cache's own notice arrives a task later. */
export function useCommentControls(show?: (patch: Patch) => void) {
  const client = useQueryClient();
  const showRef = React.useRef(show);
  showRef.current = show;

  const run = React.useCallback(
    (act: Act): void => {
      const settle = (): void => void client.invalidateQueries({ queryKey: ['activity', 'comment'] });
      const apply = (patch: Patch): void => {
        patchRows(client, patch);
        showRef.current?.(patch);
      };
      apply(act.patch);
      const request = act.send();

      let undone = false;
      const undo = (): void => {
        undone = true;
        apply(act.before);
        void request
          .then(
            (landed) =>
              landed.inverse?.().then(
                (patch) => apply(patch),
                (error) => {
                  // The act stands: show what the server holds.
                  apply(landed.patch);
                  toastManager.add({ type: 'error', title: 'Undo failed', description: controlError(error) });
                },
              ),
            // The act's own failure is reported below.
            () => undefined,
          )
          .finally(settle);
      };

      const toastId: string = toastManager.add({
        type: 'success',
        title: act.title,
        description: act.description,
        timeout: 5000,
        actionProps: { children: 'Undo', onClick: undo },
        onRemove: () => forgetUndo(toastId),
      });
      registerUndo(toastId, undo);

      request.then(
        (landed) => {
          if (!undone) apply(landed.patch);
          if (!landed.inverse) {
            forgetUndo(toastId);
            toastManager.close(toastId);
            if (!undone) toastManager.add({ type: 'info', title: landed.already ?? act.title, description: CACHE_NOTE });
          }
          settle();
        },
        (error) => {
          forgetUndo(toastId);
          toastManager.close(toastId);
          if (undone) return;
          apply(act.before);
          toastManager.add({ type: 'error', title: act.failed, description: controlError(error) });
        },
      );
    },
    [client],
  );

  /** Pin this root to the top of its post, or unpin it. */
  const pin = React.useCallback(
    (comment: PortalComment): void => {
      const on = !comment.pinnedAt;
      if (on && !canPin(comment)) {
        toastManager.add({
          type: 'info',
          title: 'Only a published first comment can be pinned',
          description: comment.parentId ? 'Pin the comment this one answers.' : 'Approve it first, then press P.',
        });
        return;
      }
      // The post's pin a loaded row shows: the new one takes its place.
      const previous = on ? cachedRows(client).find((row) => row.id !== comment.id && row.pinnedAt && samePost(row, comment)) : undefined;
      const path = (id: string) => `admin/comments/${encodeURIComponent(id)}/pin`;
      const pinned = (response: AdminCommentPinResponse): Patch =>
        new Map<string, Controls>([[response.comment.id, { pinnedAt: response.comment.pinnedAt }], ...(response.replaced ? [[response.replaced, { pinnedAt: null }] as const] : [])]);

      run({
        title: on ? `Pinned to the top of “${postName(comment)}”` : `Unpinned from “${postName(comment)}”`,
        description: previous ? `It replaces ${previous.author}’s pin. ${CACHE_NOTE}` : CACHE_NOTE,
        failed: on ? 'The comment was not pinned' : 'The comment was not unpinned',
        patch: new Map<string, Controls>([[comment.id, { pinnedAt: on ? new Date().toISOString() : null }], ...(previous ? [[previous.id, { pinnedAt: null }] as const] : [])]),
        before: new Map<string, Controls>([[comment.id, { pinnedAt: comment.pinnedAt ?? null }], ...(previous ? [[previous.id, { pinnedAt: previous.pinnedAt }] as const] : [])]),
        send: async () => {
          if (!on) {
            const response = await apiSend<AdminCommentPinResponse>('DELETE', path(comment.id));
            return { patch: pinned(response), inverse: () => apiSend<AdminCommentPinResponse>('PUT', path(comment.id)).then(pinned) };
          }
          const response = await apiSend<AdminCommentPinResponse>('PUT', path(comment.id));
          const replaced = response.replaced;
          return {
            patch: pinned(response),
            // Undo gives the pin back to the comment that had it, if any.
            inverse: replaced
              ? () => apiSend<AdminCommentPinResponse>('PUT', path(replaced)).then(pinned)
              : () => apiSend<AdminCommentPinResponse>('DELETE', path(comment.id)).then(pinned),
          };
        },
      });
    },
    [client, run],
  );

  /** Lock or unlock replies under the comment's thread root. */
  const lock = React.useCallback(
    (comment: PortalComment): void => {
      const rootId = comment.parentId ?? comment.id;
      const root = comment.parentId ? cachedRow(client, rootId) : comment;
      const on = !root?.lockedAt;
      const pressedAt = Date.now();
      const path = (id: string) => `admin/comments/${encodeURIComponent(id)}/lock`;
      const locked = (response: AdminCommentLockResponse): Patch => new Map([[response.comment.id, { lockedAt: response.comment.lockedAt }]]);

      run({
        title: on ? 'Replies locked' : 'Replies unlocked',
        description: `${on ? 'Readers can no longer reply under' : 'Readers can reply again under'} ${root ? `${root.author}’s comment` : 'this thread'}. ${CACHE_NOTE}`,
        failed: on ? 'Replies were not locked' : 'Replies were not unlocked',
        patch: new Map([[rootId, { lockedAt: on ? new Date(pressedAt).toISOString() : null }]]),
        before: new Map([[rootId, { lockedAt: root?.lockedAt ?? null }]]),
        send: async () => {
          const response = await apiSend<AdminCommentLockResponse>(on ? 'PUT' : 'DELETE', path(comment.id));
          const at = response.comment.lockedAt;
          // A root not loaded looked unlocked; one locked well before this
          // press was locked already, and Undo must not unlock it.
          const already = on && !root && at !== null && Date.parse(at) < pressedAt - 60_000;
          return {
            patch: locked(response),
            inverse: already ? null : () => apiSend<AdminCommentLockResponse>(on ? 'DELETE' : 'PUT', path(response.comment.id)).then(locked),
            already: already && at ? `Replies were already locked, since ${stamp(at)}` : undefined,
          };
        },
      });
    },
    [client, run],
  );

  return { pin, lock };
}
