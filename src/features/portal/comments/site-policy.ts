import * as React from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  AdminCommentSiteMode,
  AdminCommentSitePolicy,
  AdminCommentSitePolicyRequest,
  AdminCommentSitePolicyResponse,
  CommentsMode,
} from '@bunizao/contracts';
import { toastManager } from '@/components/coss/toast';
import { ApiError, MISSING_ROUTE_MESSAGE, apiGet, apiSend, describeError, isMissingRoute } from '../app/api';
import { forgetUndo, registerUndo } from '../app/undo';
import { CACHE_NOTE } from './cache-note';

/* The owner's two standing site-wide switches: a mode every post is at
   least as strict as (open < read-only < off), and a rule that every
   anonymous comment waits for a confirmed email, as in a lockdown with no
   end. Home and Post modes set them, the Comments header shows each one
   that is on with its way back, and the palette runs the transitions that
   apply. A change shows in the frame it is made, with a receipt and Undo
   (Z where the screen binds it), and rolls back with the reason when
   site-api refuses it.

   The key sits outside `commentKeys.all`, so an act on a comment never
   refetches it. Nothing polls it: only the owner changes it. */

export const SITE_POLICY_KEY = ['site-policy'] as const;

const PATH = 'admin/comments/site-policy';

const sitePolicyOptions = {
  queryKey: SITE_POLICY_KEY,
  queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<AdminCommentSitePolicyResponse>(PATH, undefined, signal),
  staleTime: 60_000,
  // A site-api without the route answers 404 or 405 every time.
  retry: (count: number, error: unknown) => !isMissingRoute(error) && count < 2,
};

/** Warmed with the screens that draw it, so its lines are there on
    arrival instead of pushing the list down after. */
export function prefetchSitePolicy(client: QueryClient): Promise<unknown> {
  // A missing route is the controls' to say, never the screen's to fail on.
  return client.query({ ...sitePolicyOptions, staleTime: 'static' }).catch(() => undefined);
}

export function useSitePolicy() {
  return useQuery(sitePolicyOptions);
}

const MODE_ORDER: readonly CommentsMode[] = ['open', 'readonly', 'off'];

/** What readers of one post get under the site's floor: the stricter of
    the two. Null when the post's own mode is unknown. */
export function underSiteMode(own: CommentsMode | null, floor: AdminCommentSiteMode | null | undefined): CommentsMode | null {
  if (!own) return null;
  return floor && MODE_ORDER.indexOf(floor) > MODE_ORDER.indexOf(own) ? floor : own;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** `14:02` today, `09-27 14:02` before: model.ts's `stamp`, kept apart so
    the palette's chunk does not pull the comment model in. */
export function sinceText(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const date = new Date(iso);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return date.toDateString() === new Date(now).toDateString() ? time : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

/* What readers get, one line each, for the controls' captions. */

export function modeCaption(policy: AdminCommentSitePolicy, now = Date.now()): string {
  const since = policy.modeSince ? `Since ${sinceText(policy.modeSince, now)}, ` : '';
  if (policy.mode === 'readonly') return `${since}nobody can add a comment`;
  if (policy.mode === 'off') return `${since}comment sections are hidden`;
  return 'Each post follows its own mode';
}

export function emailCaption(policy: AdminCommentSitePolicy, now = Date.now()): string {
  if (!policy.requireEmail) return 'An email stays optional';
  const since = policy.requireEmailSince ? `Since ${sinceText(policy.requireEmailSince, now)}, ` : '';
  return `${since}anonymous comments wait for an email`;
}

/** Why a change did not land. site-api's 503 names what is missing (its
    table, before the migration), so its own words are shown. */
export function describeSitePolicyError(error: unknown): string {
  if (isMissingRoute(error)) return MISSING_ROUTE_MESSAGE;
  if (error instanceof ApiError && error.status === 503 && error.message && error.message !== error.code) return error.message;
  return describeError(error);
}

function guess(before: AdminCommentSitePolicy, change: AdminCommentSitePolicyRequest): AdminCommentSitePolicy {
  const now = new Date().toISOString();
  const mode = change.mode === undefined ? before.mode : change.mode;
  const requireEmail = change.requireEmail ?? before.requireEmail;
  return {
    mode,
    modeSince: mode === null ? null : mode === before.mode ? before.modeSince : now,
    requireEmail,
    requireEmailSince: !requireEmail ? null : before.requireEmail ? before.requireEmailSince : now,
  };
}

function receipt(change: AdminCommentSitePolicyRequest): { title: string; description?: string } {
  if (change.mode === 'readonly') return { title: 'Comments are read-only everywhere', description: CACHE_NOTE };
  if (change.mode === 'off') return { title: 'Comments are off everywhere', description: CACHE_NOTE };
  if (change.mode === null) return { title: 'Comments reopened everywhere', description: `Each post follows its own mode again. ${CACHE_NOTE}` };
  if (change.requireEmail) {
    return { title: 'A confirmed email is required everywhere', description: 'Anonymous comments wait for their writer’s email. Signed-in readers post as usual.' };
  }
  return { title: 'An email is optional again', description: 'Anonymous comments go through moderation as before.' };
}

/* The last request wins: two quick changes answer out of order and only
   the later one's answer may land. */
let requestCount = 0;

/** One change to the switches, drawn at once. Only one field changes per
    call, so Undo puts back exactly that one. */
export function useSetSitePolicy() {
  const client = useQueryClient();
  return React.useCallback(
    async function set(change: AdminCommentSitePolicyRequest, options: { quiet?: boolean } = {}): Promise<void> {
      const before = client.getQueryData<AdminCommentSitePolicyResponse>(SITE_POLICY_KEY)?.policy;
      // Nothing is drawn to change until the switches are read.
      if (!before) return;
      if ((change.mode === undefined || change.mode === before.mode) && (change.requireEmail === undefined || change.requireEmail === before.requireEmail)) return;
      const ticket = ++requestCount;
      await client.cancelQueries({ queryKey: SITE_POLICY_KEY });
      client.setQueryData<AdminCommentSitePolicyResponse>(SITE_POLICY_KEY, { policy: guess(before, change) });

      const back: AdminCommentSitePolicyRequest = change.mode !== undefined ? { mode: before.mode } : { requireEmail: before.requireEmail };
      let toastId: string | null = null;
      if (!options.quiet) {
        const undo = (): void => {
          if (toastId) forgetUndo(toastId);
          void set(back, { quiet: true });
        };
        toastId = toastManager.add({
          ...receipt(change),
          timeout: 6000,
          actionProps: { children: 'Undo', onClick: undo },
          onRemove: (): void => {
            if (toastId) forgetUndo(toastId);
          },
        });
        registerUndo(toastId, undo);
      }

      try {
        const response = await apiSend<AdminCommentSitePolicyResponse>('PUT', PATH, change);
        if (ticket === requestCount) client.setQueryData(SITE_POLICY_KEY, response);
      } catch (error) {
        // A later change drew on top of this guess, so what stands now is
        // site-api's to say.
        if (ticket === requestCount) client.setQueryData<AdminCommentSitePolicyResponse>(SITE_POLICY_KEY, { policy: before });
        else void client.invalidateQueries({ queryKey: SITE_POLICY_KEY });
        if (toastId) {
          forgetUndo(toastId);
          toastManager.close(toastId);
        }
        toastManager.add({
          type: 'error',
          title: change.mode !== undefined ? 'Comments everywhere did not change' : 'The email rule did not change',
          description: describeSitePolicyError(error),
        });
      }
    },
    [client],
  );
}
