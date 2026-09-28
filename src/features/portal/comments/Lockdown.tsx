import * as React from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AdminCommentLockdown, AdminCommentLockdownResponse } from '@bunizao/contracts';
import { Button } from '@/components/coss/button';
import { cn } from '@/lib/utils';
import { Dot, SMALL, STATUS_LINE, statusLinePx } from '../activity/table';
import { MISSING_ROUTE_MESSAGE, apiGet, apiSend, describeError, isMissingRoute } from '../app/api';
import { backendIsBehind } from './data';
import { stamp } from './model';

/* The site-wide comment lockdown: while it lasts, every anonymous comment
   waits for its writer to confirm an email. site-api engages it by itself,
   for an hour, when a flood starts; the owner engages it from Home and
   lifts it from there or the Comments header. Its key sits outside
   `commentKeys.all`, so an act on a comment never refetches it. */

export const LOCKDOWN_KEY = ['lockdown'] as const;

/** site-api's own words for a lockdown engaged without a note. */
const NO_NOTE = 'engaged by the owner';

const lockdownOptions = {
  queryKey: LOCKDOWN_KEY,
  queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<AdminCommentLockdownResponse>('admin/comments/lockdown', undefined, signal),
  staleTime: 20_000,
  // A site-api without the route answers 404 or 405 every time.
  retry: (count: number, error: unknown) => !isMissingRoute(error) && count < 2,
};

/** Warmed with the screens that draw it, so its line is there on arrival
    instead of pushing the list down after. */
export function prefetchLockdown(client: QueryClient): Promise<unknown> {
  // A missing route is the line's to say, never the screen's to fail on.
  return client.query({ ...lockdownOptions, staleTime: 'static' }).catch(() => undefined);
}

export function useLockdown() {
  return useQuery({ ...lockdownOptions, refetchInterval: 60_000 });
}

/** The clock, re-read every `everyMs`, for lines that count down. */
export function useNow(everyMs: number): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** The lockdown in force now, or null. One that ran out stays in KV until
    site-api next reads it, so the end time decides. */
export function activeLockdown(data: AdminCommentLockdownResponse | undefined, now: number): AdminCommentLockdown | null {
  const lockdown = data?.lockdown ?? null;
  return lockdown && Date.parse(lockdown.until) > now ? lockdown : null;
}

/** `by you: a note`, `by you`, or `automatic: more than 8 anonymous…`. */
export function lockdownWho(lockdown: AdminCommentLockdown): string {
  if (lockdown.by === 'auto') return `automatic: ${lockdown.reason}`;
  return lockdown.reason && lockdown.reason !== NO_NOTE ? `by you: ${lockdown.reason}` : 'by you';
}

function left(ms: number): string {
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  if (ms < 172_800_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

/** `ends 14:32, in 42m`; the date too when it is not today. */
export function lockdownEnds(lockdown: AdminCommentLockdown, now: number): string {
  const until = new Date(lockdown.until);
  const today = until.toDateString() === new Date(now).toDateString();
  const at = today ? stamp(lockdown.until).slice(6) : stamp(lockdown.until);
  return `ends ${at}, in ${left(until.getTime() - now)}`;
}

export const LOCKDOWN_SPANS = [
  { label: '1 hour', short: '1h', minutes: 60 },
  { label: '6 hours', short: '6h', minutes: 360 },
  { label: '24 hours', short: '24h', minutes: 1440 },
  { label: '7 days', short: '7d', minutes: 10_080 },
] as const;

/** Engage and lift, drawn at once. Each resolves to the line to show when
    it failed, else null. */
export function useLockdownActions() {
  const client = useQueryClient();

  const run = React.useCallback(
    async (next: AdminCommentLockdown | null, send: () => Promise<AdminCommentLockdownResponse>): Promise<string | null> => {
      // An older site-api would route these to a comment id and answer
      // something misleading, so they are not sent at all.
      if (backendIsBehind() || isMissingRoute(client.getQueryState(LOCKDOWN_KEY)?.error)) return MISSING_ROUTE_MESSAGE;
      const before = client.getQueryData<AdminCommentLockdownResponse>(LOCKDOWN_KEY);
      await client.cancelQueries({ queryKey: LOCKDOWN_KEY });
      client.setQueryData<AdminCommentLockdownResponse>(LOCKDOWN_KEY, { lockdown: next });
      try {
        client.setQueryData<AdminCommentLockdownResponse>(LOCKDOWN_KEY, await send());
        return null;
      } catch (error) {
        if (before) client.setQueryData(LOCKDOWN_KEY, before);
        else void client.resetQueries({ queryKey: LOCKDOWN_KEY });
        return describeError(error);
      }
    },
    [client],
  );

  const engage = React.useCallback(
    (minutes: number, note: string) => {
      const now = Date.now();
      const text = note.trim();
      return run(
        { reason: text || NO_NOTE, since: new Date(now).toISOString(), until: new Date(now + minutes * 60_000).toISOString(), by: 'owner' },
        () => apiSend<AdminCommentLockdownResponse>('POST', 'admin/comments/lockdown', { minutes, note: text || undefined }),
      );
    },
    [run],
  );

  const lift = React.useCallback(
    () => run(null, () => apiSend<AdminCommentLockdownResponse>('DELETE', 'admin/comments/lockdown')),
    [run],
  );

  return { engage, lift };
}

/** The Comments header's lockdown line: only while one is in force. Its
    arrival or departure mid-session moves the list's scroll offset by its
    own height, so the rows on screen stay where they were. */
export function LockdownLine({ scrollRef }: { scrollRef: React.RefObject<HTMLElement | null> }) {
  const query = useLockdown();
  const { lift } = useLockdownActions();
  const now = useNow(30_000);
  const [error, setError] = React.useState<string | null>(null);
  const lockdown = activeLockdown(query.data, now);
  const shown = Boolean(lockdown || error);

  const wasShown = React.useRef(shown);
  React.useLayoutEffect(() => {
    if (wasShown.current === shown) return;
    wasShown.current = shown;
    const node = scrollRef.current;
    if (!node || node.scrollTop <= 0) return;
    node.scrollTop += shown ? statusLinePx() : -statusLinePx();
  }, [shown, scrollRef]);

  if (!shown) return null;
  return (
    <div role="status" className={STATUS_LINE}>
      <span className="flex shrink-0 items-center gap-2">
        <Dot tone={error ? 'danger' : 'attention'} />
        <span className="font-medium">Lockdown</span>
      </span>
      <span
        className={cn('min-w-0 flex-1 truncate', error ? 'text-[hsl(var(--portal-danger))]' : 'text-muted-foreground')}
        title={lockdown ? 'Anonymous comments wait for their writer to confirm an email until it ends.' : undefined}
      >
        {error
          ? `Not lifted: ${error}`
          : lockdown && (
              <>
                {lockdownWho(lockdown)}
                <span className="font-mono text-xs tabular-nums"> · {lockdownEnds(lockdown, now)}</span>
                {' · anonymous comments wait for an email'}
              </>
            )}
      </span>
      {lockdown ? (
        <Button
          size="sm"
          variant="outline"
          className={cn(SMALL, 'shrink-0 pointer-coarse:h-9')}
          onClick={async () => {
            setError(null);
            setError(await lift());
          }}
        >
          Lift
        </Button>
      ) : (
        <Button size="sm" variant="ghost" className={cn(SMALL, 'shrink-0')} onClick={() => setError(null)}>
          Dismiss
        </Button>
      )}
    </div>
  );
}
