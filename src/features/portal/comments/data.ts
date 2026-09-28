import * as React from 'react';
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import {
  ADMIN_COMMENT_REJECT_REASONS,
  type AdminCommentAction,
  type AdminCommentActionResponse,
  type AdminCommentActionResult,
  type AdminCommentBulkResponse,
  type AdminCommentModelFilter,
  type AdminCommentQueueSort,
  type AdminCommentQueueWindow,
  type AdminCommentRejectReason,
  type AdminCommentReplyRequest,
  type AdminCommentReplyResponse,
  type AdminSourceKeyType,
  type AdminSourceProfile,
} from '@bunizao/contracts';
import type { CommentSurface } from '@bunizao/contracts/comments';
import type { PortalComment, PortalComments, PortalCommentStatus } from '@/features/admin/server/portal-client';
import { toastManager } from '@/components/coss/toast';
import { ApiError, apiGet, apiSend, describeError, isMissingRoute, needsSiteApiUpdate } from '../app/api';
import { shareRowsById } from '../app/share-rows';
import { forgetUndo, registerUndo } from '../app/undo';
import { REASON_LABELS } from './model';

export type StatusFilter = PortalCommentStatus | 'all';
/** One act on comments. `reject` carries a reason. */
export type Verdict = AdminCommentAction;
export type RejectReason = AdminCommentRejectReason;
export type CommentSort = AdminCommentQueueSort;
export type CommentModel = AdminCommentModelFilter;
export type ReasonFilter = 'ok' | RejectReason;

/** Menu order, and the order of the 1-5 keys in the reject menu. */
export const REJECT_REASONS: readonly RejectReason[] = ADMIN_COMMENT_REJECT_REASONS;
export const REASON_FILTERS: readonly ReasonFilter[] = ['ok', ...ADMIN_COMMENT_REJECT_REASONS];

/** Most rows one act may carry: site-api's cap on /admin/comments/bulk. */
export const MAX_ACT_IDS = 20;

/** Tab order, and the order of the 1-5 keys. The log opens on All. */
export const STATUS_FILTERS: readonly StatusFilter[] = ['all', 'held', 'published', 'rejected', 'deleted'];

export const STATUS_LABELS: Record<StatusFilter, string> = {
  held: 'Held',
  published: 'Published',
  rejected: 'Rejected',
  deleted: 'Deleted',
  all: 'All',
};

/** The created-at windows the filter menu offers, as the URL spells them. */
export const RANGE_DAYS = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 } as const;
export type CommentRange = keyof typeof RANGE_DAYS;

/** site-api searches and risk-sorts this far back unless a range says. */
export const SEARCH_DAYS = 30;

export interface CommentFilter {
  status: StatusFilter;
  postId?: string | null;
  key?: AdminSourceKeyType | null;
  value?: string | null;
  /** Author and text, matched by site-api. */
  q?: string | null;
  surface?: CommentSurface | null;
  reason?: ReasonFilter | null;
  model?: CommentModel | null;
  range?: CommentRange | null;
  /** Null is newest first. */
  sort?: CommentSort | null;
}

export type ListFilter = Required<CommentFilter>;

/** Every field present and null when unset, so Home's Held and the screen's
    Held are one cache entry. A search site-api would refuse (under two or
    over a hundred characters) is no search. */
export function listFilter(filter: CommentFilter): ListFilter {
  const q = filter.q?.trim() ?? '';
  return {
    status: filter.status,
    postId: filter.postId || null,
    key: filter.key || null,
    value: filter.value || null,
    q: q.length >= 2 ? q.slice(0, 100) : null,
    surface: filter.surface || null,
    reason: filter.reason || null,
    model: filter.model || null,
    range: filter.range || null,
    sort: filter.sort && filter.sort !== 'newest' ? filter.sort : null,
  };
}

/** A filter only site-api P2 reads. An older one ignores the parameters and
    answers unfiltered, which must not pass for a filtered answer. */
function needsP2(filter: ListFilter): boolean {
  return Boolean(filter.q || filter.surface || filter.reason || filter.model || filter.range || filter.sort);
}

const PAGE_SIZE = 50;
const DAY_MS = 86_400_000;

export const commentKeys = {
  all: ['comments'] as const,
  lists: () => ['comments', 'list'] as const,
  list: (filter: ListFilter) => ['comments', 'list', filter] as const,
  counts: () => ['comments', 'counts'] as const,
  source: (type: string, value: string) => ['comments', 'source', type, value] as const,
};

type ListPage = PortalComments & { window?: AdminCommentQueueWindow | null };

/* What the site-api behind the proxy can do, learned from the first queue
   page: P2 sends `window`, older builds do not. Null until a page lands.
   Acts only P2 has (reject, restore, bulk, reply, lockdown) are refused
   here when it is known to be missing, rather than sent to a build that
   would misroute them. */
let backendHasP2: boolean | null = null;

function noteBackend(page: ListPage): void {
  backendHasP2 = 'window' in page;
}

/** True once a queue page showed an older site-api. */
export function backendIsBehind(): boolean {
  return backendHasP2 === false;
}

const shareRows = shareRowsById<PortalComment>('comments', (row) => row.id);

function listOptions(input: CommentFilter) {
  const filter = listFilter(input);
  return {
    queryKey: commentKeys.list(filter),
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }: { pageParam: number; signal: AbortSignal }) => {
      const page = await apiGet<ListPage>(
        'admin/comments',
        {
          status: filter.status,
          postId: filter.postId,
          key: filter.key,
          value: filter.value,
          q: filter.q,
          surface: filter.surface,
          reason: filter.reason,
          model: filter.model,
          sort: filter.sort,
          // A minute inside the range, so the clock never makes it wider than
          // site-api's 90-day cap.
          from: filter.range ? new Date(Date.now() - RANGE_DAYS[filter.range] * DAY_MS + 60_000).toISOString() : null,
          limit: PAGE_SIZE,
          offset: pageParam,
        },
        signal,
      );
      noteBackend(page);
      if (backendHasP2 === false && needsP2(filter)) throw needsSiteApiUpdate();
      return page;
    },
    getNextPageParam: (last: ListPage) => last.nextOffset ?? undefined,
    // A row that leaves the list keeps every other row's object.
    structuralSharing: shareRows,
  };
}

/** Link intent and arrival (app/lazy-screen.ts): the first page only. */
export function prefetchCommentList(client: QueryClient, filter: CommentFilter): Promise<unknown> {
  return client.infiniteQuery({ ...listOptions(filter), staleTime: 'static' });
}

/** How often the status counts refresh. Every caller of
    `commentKeys.counts()` polls at this rate: observers of one key poll at
    the fastest interval any of them asks for. Each poll reads the whole
    comments summary, and a held comment can wait a minute. */
export const COUNTS_POLL_MS = 60_000;

/** The status counts as one comparable value. A new comment, or one moved
    outside this tab, changes it. */
function countsMark(page: ListPage | undefined): string | null {
  if (!page) return null;
  const { held, published, rejected, deleted } = page.summary.byStatus;
  return `${held}/${published}/${rejected}/${deleted}`;
}

export function useCommentList(filter: CommentFilter) {
  const list = useInfiniteQuery({
    ...listOptions(filter),
    // A new search, sort or tab keeps the rows it replaces on screen until
    // its own arrive; the screen dims them meanwhile.
    placeholderData: keepPreviousData,
    // Focus is covered by the counts below, which refetch on it too.
    refetchOnWindowFocus: false,
  });

  /* New work lands in `all` and `held`. The counts query (the sidebar
     badge's poll) notices it; the list refetches when those
     counts move away from the ones its own first page carried. Polling the
     list itself refetched every loaded page -- 50 rows each, with their
     actor lookups -- twice a minute whether or not anything had arrived.
     The stable view holds new rows behind a pill, so a refetch never moves
     what is on screen. */
  const watches = filter.status === 'all' || filter.status === 'held';
  const latest = useQuery({
    queryKey: commentKeys.counts(),
    queryFn: fetchCounts,
    select: countsMark,
    refetchInterval: COUNTS_POLL_MS,
    enabled: watches,
  }).data;
  const listed = React.useRef<string | null>(null);
  listed.current = list.isPlaceholderData ? null : countsMark(list.data?.pages[0]);
  const { refetch } = list;
  // Keyed on the counts alone: a list that lands newer than the counts
  // waits for the next poll instead of refetching until they agree.
  React.useEffect(() => {
    if (!watches || !latest || !listed.current || latest === listed.current) return;
    // Joins a refetch already running (an act's settle) rather than restarting it.
    void refetch({ cancelRefetch: false });
  }, [watches, latest, refetch]);

  return list;
}

/** Warm the other status lists once the screen is idle, so switching
    filters paints rows from cache instead of a skeleton. Only lists never
    loaded: one already cached paints the same, and revalidates when its
    tab opens. Refreshing all five on every visit cost five queue reads
    each time the screen was opened. */
export function usePrefetchStatuses(enabled: boolean): void {
  const client = useQueryClient();
  React.useEffect(() => {
    if (!enabled) return;
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 400));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => {
      for (const status of STATUS_FILTERS) {
        // A failed warm-up is the list's to report if that status opens.
        client.infiniteQuery({ ...listOptions({ status, postId: null, key: null, value: null }), staleTime: 'static' }).catch(() => {});
      }
    });
    return () => cancel(handle);
  }, [client, enabled]);
}

/* Status counts for the sidebar badge and the status control. `limit=0`
   answers the summary block without a row or its actor lookups; an older
   site-api clamps it to one row, which is the same answer. Every caller of
   `commentKeys.counts()` must send the same request. */
async function fetchCounts({ signal }: { signal: AbortSignal }): Promise<ListPage> {
  const page = await apiGet<ListPage>('admin/comments', { status: 'held', limit: 0 }, signal);
  noteBackend(page);
  return page;
}

export function useCommentCounts() {
  return useQuery({
    queryKey: commentKeys.counts(),
    queryFn: fetchCounts,
    select: (data) => ({ ...data.summary.byStatus, oldestHeldAt: data.summary.oldestHeldAt }),
    refetchInterval: COUNTS_POLL_MS,
  });
}

/** Posts the picker offers: the summary's top posts. */
export function useTopPosts() {
  return useQuery({
    queryKey: commentKeys.counts(),
    queryFn: fetchCounts,
    select: (data) => data.summary.topPosts,
    refetchInterval: COUNTS_POLL_MS,
  });
}

function sourceOptions(type: AdminSourceKeyType, value: string) {
  return {
    queryKey: commentKeys.source(type, value),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      apiGet<AdminSourceProfile>(`admin/sources/${encodeURIComponent(type)}/${encodeURIComponent(value)}`, undefined, signal),
    staleTime: 30_000,
  };
}

/** Everything one key has done, for the pivot line. Loaded beside the list,
    never before it. */
export function useSourceProfile(type: AdminSourceKeyType | null, value: string | null) {
  return useQuery({
    ...sourceOptions(type ?? ('' as AdminSourceKeyType), value ?? ''),
    enabled: Boolean(type && value),
  });
}

export function prefetchSourceProfile(client: QueryClient, type: AdminSourceKeyType, value: string): Promise<unknown> {
  return client.query({ ...sourceOptions(type, value), staleTime: 'static' });
}

/* Acts. Each one changes the cache in the frame it is asked for, sends,
   and offers an undo that sends the inverse act. Delete is sent at once
   too: its undo is a restore, which site-api keeps possible for 30 days,
   so the server holds the truth from the first frame and nothing waits on
   a closing tab to be flushed. */

/** Days site-api keeps a deleted row restorable. */
export const RESTORE_DAYS = 30;

const DONE_RESULT: Record<Verdict, AdminCommentActionResult> = {
  approve: 'approved',
  hide: 'hidden',
  reject: 'rejected',
  delete: 'deleted',
  restore: 'restored',
};

/** The acts every site-api knows; the others came with P2. */
const LEGACY_ACTS: ReadonlySet<Verdict> = new Set<Verdict>(['approve', 'hide', 'delete']);

export const NEXT_STATUS: Record<Exclude<Verdict, 'restore'>, PortalCommentStatus> = {
  approve: 'published',
  hide: 'held',
  reject: 'rejected',
  delete: 'deleted',
};

/** Where an act puts a row. A restore returns it to where it was before
    the delete, which the row does not carry; delete keeps the last
    verdict's action, so that is the guess until site-api answers. */
export function nextStatus(comment: PortalComment, verdict: Verdict): PortalCommentStatus {
  if (verdict !== 'restore') return NEXT_STATUS[verdict];
  if (comment.moderationAction === 'publish') return 'published';
  if (comment.moderationAction === 'reject') return 'rejected';
  return 'held';
}

/** Milliseconds left to restore a deleted row; null when it cannot be. */
export function restoreLeft(comment: PortalComment, now = Date.now()): number | null {
  if (comment.status !== 'deleted' || !comment.restorableUntil) return null;
  const left = Date.parse(comment.restorableUntil) - now;
  return left > 0 ? left : null;
}

export function canApply(comment: PortalComment, verdict: Verdict): boolean {
  switch (verdict) {
    case 'approve':
      return comment.status === 'held' || comment.status === 'rejected';
    case 'hide':
      return comment.status === 'published';
    case 'reject':
      return comment.status === 'held' || comment.status === 'published';
    case 'delete':
      return comment.status !== 'deleted';
    case 'restore':
      return restoreLeft(comment) !== null;
  }
}

/** The act that puts every row back where it was, or null when none does:
    nothing returns a rejected row to Held. Undoing an approve from
    Rejected lands in Held, which the receipt says. */
function inverseOf(verdict: Verdict, before: readonly PortalCommentStatus[]): Verdict | null {
  switch (verdict) {
    case 'approve':
      return 'hide';
    case 'hide':
      return 'approve';
    case 'reject':
      return before.every((status) => status === 'published') ? 'approve' : null;
    case 'delete':
      return backendHasP2 === false ? null : 'restore';
    case 'restore':
      return 'delete';
  }
}

function receiptOf(verdict: Verdict, reason: RejectReason | undefined): string {
  if (verdict === 'reject') return reason ? `Rejected as ${REASON_LABELS[reason].toLowerCase()}` : 'Rejected';
  return {
    approve: 'Approved and published',
    hide: 'Unpublished and moved back to Held',
    delete: 'Deleted',
    restore: 'Restored',
  }[verdict];
}

const PAST: Record<Verdict, string> = {
  approve: 'approved',
  hide: 'unpublished',
  reject: 'rejected',
  delete: 'deleted',
  restore: 'restored',
};

function isUnchanged(result: AdminCommentActionResult): boolean {
  return result === 'not_available' || result === 'not_restorable';
}

/** Why site-api left a row as it was, as the row's mark says it. */
function unchangedLine(outcome: Outcome): string {
  if (outcome.result === 'not_restorable') return 'Not restored: past its 30 days, or removed by its writer or a ban';
  return outcome.status ? 'Not changed: someone moved it first' : 'Not changed: it is gone';
}

/** Where rows someone else moved first are now: `Deleted (2), Published (1)`. */
function whereNow(outcomes: readonly Outcome[]): string {
  const counts = new Map<string, number>();
  for (const outcome of outcomes) {
    const label = outcome.status ? STATUS_LABELS[outcome.status] : 'Gone';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, n]) => `${label} (${n})`).join(', ');
}

/** The receipt for a partial or failed act on `count` rows: `3 approved,
    1 already elsewhere`, and a line saying where those are now. */
export function unchangedReceipt(verdict: Verdict, count: number, unchanged: readonly Outcome[]): { title: string; description: string } {
  const elsewhere = unchanged.filter((outcome) => outcome.result === 'not_available');
  const stuck = unchanged.length - elsewhere.length;
  const done = count - unchanged.length;
  const title = [
    done > 0 ? `${done} ${PAST[verdict]}` : `None of the ${count} changed`,
    elsewhere.length > 0 && `${elsewhere.length} already elsewhere`,
    stuck > 0 && `${stuck} past restoring`,
  ].filter(Boolean).join(', ');
  const description = [
    elsewhere.length > 0 && `Someone moved ${elsewhere.length > 1 ? 'them' : 'it'} first: now ${whereNow(elsewhere)}.`,
    stuck > 0 && `Past ${RESTORE_DAYS} days, or removed by the writer or a ban.`,
  ].filter(Boolean).join(' ');
  return { title, description };
}

/** A row's place after site-api answered. A changed row takes the act's
    restore window; one site-api left as it was keeps none the portal can
    vouch for, so its restore waits on the refetch. */
function landedPatch(row: PortalComment, outcome: Outcome & { status: PortalCommentStatus }): RowPatch {
  if (!isUnchanged(outcome.result)) return patchOf(row, outcome.status);
  if (row.restorableUntil === undefined) return { status: outcome.status };
  const keeps = outcome.result === 'not_available' && outcome.status === row.status;
  return { status: outcome.status, restorableUntil: keeps ? row.restorableUntil : null };
}

type ListData = InfiniteData<ListPage, number>;
type RowPatch = Pick<PortalComment, 'status'> & Partial<Pick<PortalComment, 'restorableUntil'>>;

/** Move rows in every cached list: in place where the list shows the new
    status, out of it where it does not. */
function patchLists(client: QueryClient, patches: ReadonlyMap<string, RowPatch>): void {
  if (patches.size === 0) return;
  for (const [key, data] of client.getQueriesData<ListData>({ queryKey: commentKeys.lists() })) {
    if (!data) continue;
    const status = (key[2] as ListFilter | undefined)?.status ?? 'all';
    client.setQueryData<ListData>(key, {
      ...data,
      pages: data.pages.map((page) => {
        const comments = page.comments.flatMap((row) => {
          const patch = patches.get(row.id);
          if (!patch) return [row];
          return status === 'all' || status === patch.status ? [{ ...row, ...patch }] : [];
        });
        return { ...page, comments, total: page.total - (page.comments.length - comments.length) };
      }),
    });
  }
}

/** A row's new status, with the restore window that goes with it. A row
    from a pre-P2 site-api has no window at all and keeps none. */
function patchOf(row: PortalComment, status: PortalCommentStatus): RowPatch {
  if (row.restorableUntil === undefined) return { status };
  const until = status === 'deleted' ? new Date(Date.now() + RESTORE_DAYS * DAY_MS).toISOString() : null;
  return { status, restorableUntil: until };
}

/** The comment a ban deletes, moved in every cached list as D moves it.
    The ban's operation restores it, not a row restore, so it carries no
    restore window. Returns what puts it back. */
export function patchBanDeleted(client: QueryClient, row: PortalComment): () => void {
  patchLists(client, new Map([[row.id, row.restorableUntil === undefined ? { status: 'deleted' } : { status: 'deleted', restorableUntil: null }]]));
  return () => patchLists(client, new Map([[row.id, { status: row.status, restorableUntil: row.restorableUntil }]]));
}

/** What site-api said of one row: the act's result, and where the row is
    after the call (null when no row has that id). */
export interface Outcome {
  id: string;
  result: AdminCommentActionResult;
  status: PortalCommentStatus | null;
}

async function sendOne(id: string, verdict: Verdict, reason?: RejectReason): Promise<Outcome> {
  try {
    const response = await apiSend<Partial<AdminCommentActionResponse>>('POST', `admin/comments/${encodeURIComponent(id)}`, { action: verdict, reason });
    // A pre-P2 site-api answers `{ result }` alone.
    return { id, result: response.result ?? DONE_RESULT[verdict], status: response.comment?.status ?? null };
  } catch (error) {
    if (!(error instanceof ApiError) || isMissingRoute(error)) throw error;
    // A pre-P2 site-api knows three acts and calls any other invalid.
    if (error.status === 400 && error.code === 'invalid_action') throw needsSiteApiUpdate();
    if (error.code === 'comment_not_restorable') return { id, result: 'not_restorable', status: 'deleted' };
    if (error.status === 404 || error.status === 409) return { id, result: 'not_available', status: null };
    throw error;
  }
}

/** One request for a selection on P2; one per row on an older site-api,
    which has no bulk route and knows only approve, hide and delete. */
async function sendAct(ids: readonly string[], verdict: Verdict, reason?: RejectReason): Promise<Outcome[]> {
  if (backendHasP2 === false && !LEGACY_ACTS.has(verdict)) throw needsSiteApiUpdate();
  if (ids.length === 1 || backendHasP2 === false) return Promise.all(ids.map((id) => sendOne(id, verdict, reason)));
  const response = await apiSend<AdminCommentBulkResponse>('POST', 'admin/comments/bulk', { ids, action: verdict, reason });
  return response.results;
}

/** A row site-api left as it was: where it is now (null when no row has
    that id any more) and the line saying why. */
export interface UnchangedRow {
  status: PortalCommentStatus | null;
  line: string;
}

/** Rows site-api left as they were that still belong in the view filtered
    by `filter`; the others are elsewhere now, and stay out of it. */
export function staysIn(unchanged: ReadonlyMap<string, UnchangedRow>, filter: StatusFilter): string[] {
  return [...unchanged].flatMap(([id, row]) => (row.status && (filter === 'all' || row.status === filter) ? [id] : []));
}

export interface ModerateOptions {
  /** Required by `reject`. */
  reason?: RejectReason;
  /** Put rows back in the view where they were: every row after an undo or
      a failed request. */
  onRevert?: (ids: readonly string[]) => void;
  /** Rows site-api left as they were. The caches already hold each one
      where site-api says it is; the view decides whether that is here. */
  onUnchanged?: (rows: ReadonlyMap<string, UnchangedRow>) => void;
}

export function useModerate() {
  const client = useQueryClient();

  const settle = React.useCallback(() => {
    void client.invalidateQueries({ queryKey: commentKeys.all });
    void client.invalidateQueries({ queryKey: ['activity', 'comment'] });
  }, [client]);

  /** Apply one act to one comment or up to MAX_ACT_IDS, optimistically,
      with undo. Nothing here waits on the network before the cache
      changes; site-api's per-row answer corrects it after. */
  return React.useCallback(
    (rows: readonly PortalComment[], verdict: Verdict, options: ModerateOptions = {}) => {
      if (rows.length === 0) return;
      const { reason, onRevert, onUnchanged } = options;
      const count = rows.length;
      const ids = rows.map((row) => row.id);
      const byId = new Map(rows.map((row) => [row.id, row]));

      const putBack = (subset: ReadonlySet<string>): void => {
        patchLists(client, new Map(rows.filter((row) => subset.has(row.id)).map((row) => [row.id, { status: row.status, restorableUntil: row.restorableUntil }])));
        onRevert?.([...subset]);
      };

      patchLists(client, new Map(rows.map((row) => [row.id, patchOf(row, nextStatus(row, verdict))])));
      const request = sendAct(ids, verdict, reason);

      const inverse = inverseOf(verdict, rows.map((row) => row.status));
      let undone = false;
      // The rows the act changed, once site-api said: only those go back on
      // an undo, as the rest are already where site-api put them.
      let changedIds: ReadonlySet<string> | null = null;
      const undo = inverse
        ? (): void => {
            undone = true;
            putBack(changedIds ?? new Set(ids));
            void request
              .then(
                (outcomes) => {
                  const changed = outcomes.filter((outcome) => !isUnchanged(outcome.result)).map((outcome) => outcome.id);
                  if (changed.length === 0) return;
                  return sendAct(changed, inverse).then(
                    (back) => {
                      const stuck = back.filter((outcome) => isUnchanged(outcome.result)).length;
                      if (stuck === 0) return;
                      toastManager.add({
                        type: 'error',
                        title: stuck === changed.length ? 'Undo did not apply' : `${stuck} of ${changed.length} were not undone`,
                        description: 'Someone moved them first. The list has been refreshed.',
                      });
                    },
                    (error) => toastManager.add({ type: 'error', title: 'Undo failed', description: describeError(error) }),
                  );
                },
                // The act's own failure is reported where it lands, below.
                () => undefined,
              )
              .finally(settle);
          }
        : null;

      const title = count === 1 ? receiptOf(verdict, reason) : `${receiptOf(verdict, reason)}: ${count} comments`;
      const description =
        verdict === 'delete'
          ? inverse
            ? `Press Z or Undo to restore. Deleted keeps it restorable for ${RESTORE_DAYS} days.`
            : 'This site-api cannot restore deleted comments, so there is no undo.'
          : verdict === 'approve' && rows.some((row) => row.status === 'rejected')
            ? 'Undo moves it to Held, not back to Rejected.'
            : verdict === 'reject' && !inverse
              ? 'Nothing returns it to Held. Approve it from Rejected to publish it.'
              : undefined;
      const toastId: string = toastManager.add({
        type: 'success',
        title,
        description,
        timeout: verdict === 'delete' ? 6000 : 5000,
        actionProps: undo ? { children: 'Undo', onClick: undo } : undefined,
        onRemove: () => forgetUndo(toastId),
      });
      if (undo) registerUndo(toastId, undo);

      request.then(
        (outcomes) => {
          const unchanged = outcomes.filter((outcome) => isUnchanged(outcome.result));
          changedIds = new Set(outcomes.filter((outcome) => !isUnchanged(outcome.result)).map((outcome) => outcome.id));
          if (!undone) {
            // Every row where site-api says it is, changed or not: a
            // restore's guess can be wrong, and a row someone moved first
            // lands where they put it.
            patchLists(
              client,
              new Map(
                outcomes.flatMap((outcome): Array<[string, RowPatch]> => {
                  const row = byId.get(outcome.id);
                  return row && outcome.status ? [[outcome.id, landedPatch(row, { ...outcome, status: outcome.status })]] : [];
                }),
              ),
            );
            if (unchanged.length > 0) {
              onUnchanged?.(new Map(unchanged.map((outcome) => [outcome.id, { status: outcome.status, line: unchangedLine(outcome) }])));
            }
          }
          if (unchanged.length > 0) {
            const done = count - unchanged.length;
            if (done === 0) {
              forgetUndo(toastId);
              toastManager.close(toastId);
              const only = unchanged[0];
              toastManager.add({
                type: 'error',
                ...(count > 1
                  ? unchangedReceipt(verdict, count, unchanged)
                  : {
                      title: 'The comment was not changed',
                      description:
                        only.result === 'not_restorable'
                          ? `It cannot be restored: past its ${RESTORE_DAYS} days, or removed by its writer or a ban.`
                          : only.status
                            ? `Someone moved it first: it is ${STATUS_LABELS[only.status]} now.`
                            : 'Someone already handled it, probably from Telegram. The list has been refreshed.',
                    }),
              });
            } else {
              toastManager.update(toastId, { type: 'warning', ...unchangedReceipt(verdict, count, unchanged) });
            }
          }
          settle();
        },
        (error) => {
          forgetUndo(toastId);
          toastManager.close(toastId);
          if (!undone) putBack(new Set(ids));
          toastManager.add({
            type: 'error',
            title: count > 1 ? `${count} comments were not updated` : 'The comment was not updated',
            description: describeError(error),
          });
          settle();
        },
      );
    },
    [client, settle],
  );
}

/* The owner's replies, in the thread from the moment they are sent. Each
   carries a replyId made once for its draft and sent on every try:
   site-api makes it the reply's id, so a retry after a lost answer gets
   the first reply back instead of posting a second. A failed reply stays
   in the thread, marked, until the owner retries, edits or discards it. */

export interface OwnerReply {
  key: string;
  /** The thread root it joins. */
  rootId: string;
  /** The comment answered; a retry answers it again. */
  targetId: string;
  /** The UUID sent on every try of this reply. */
  replyId: string;
  /** The row site-api wrote, once it answered. */
  id: string | null;
  body: string;
  sentAt: string;
  state: 'sending' | 'sent' | 'failed';
  error: string | null;
  /** site-api already holds another write under this replyId: an earlier
      try published other text. A retry cannot help; an edit sends a new
      id. */
  collided: boolean;
}

let replies: readonly OwnerReply[] = [];
const replyListeners = new Set<() => void>();

function setReplies(next: readonly OwnerReply[]): void {
  replies = next;
  for (const listener of replyListeners) listener();
}

function patchReply(key: string, patch: Partial<OwnerReply>): void {
  setReplies(replies.map((reply) => (reply.key === key ? { ...reply, ...patch } : reply)));
}

export function discardReply(key: string): void {
  setReplies(replies.filter((reply) => reply.key !== key));
}

export function threadRoot(comment: PortalComment): string {
  return comment.parentId ?? comment.id;
}

export function useOwnerReplies(rootId: string): readonly OwnerReply[] {
  const all = React.useSyncExternalStore(
    (listener) => {
      replyListeners.add(listener);
      return () => replyListeners.delete(listener);
    },
    () => replies,
    () => replies,
  );
  return React.useMemo(() => all.filter((reply) => reply.rootId === rootId), [all, rootId]);
}

const REPLY_ERRORS: Record<string, string> = {
  target_unavailable: 'Only a published comment can be answered. Approve it first.',
  invalid_body: 'A reply is 1 to 2000 characters.',
  owner_identity_unavailable: 'You have no reader profile yet, so the reply would lose the owner badge. Use “Write as the owner…” in the ⋯ menu once, then retry.',
  owner_not_configured: 'Owner replies are not configured in site-api.',
  reply_id_collision: 'An earlier try of this reply was published with other text, so this one was not. Check the thread; Edit sends it as a new reply.',
};

/* Retrying sends the same replyId, so a try that may have written the row
   can be sent again without posting it twice. */
const SAFE_RETRY = 'Retry is safe: it cannot post the reply twice.';

/** The line a failed reply shows. */
function replyError(error: unknown): string {
  if (!(error instanceof ApiError)) return `No answer from the server. ${SAFE_RETRY}`;
  if (error.code && REPLY_ERRORS[error.code]) return REPLY_ERRORS[error.code];
  if (error.status >= 500 && !isMissingRoute(error)) return `site-api failed (${error.code ?? error.status}). ${SAFE_RETRY}`;
  return describeError(error);
}

/** Send and retry a reply as the owner. The thread shows it from the first
    frame; each promise settles once site-api answered, either way. */
export function useReply() {
  const client = useQueryClient();
  const post = React.useCallback(
    async (reply: OwnerReply): Promise<void> => {
      try {
        if (backendHasP2 === false) throw needsSiteApiUpdate();
        const request: AdminCommentReplyRequest = { body: reply.body, replyId: reply.replyId };
        const response = await apiSend<AdminCommentReplyResponse>('POST', `admin/comments/${encodeURIComponent(reply.targetId)}/reply`, request);
        patchReply(reply.key, { state: 'sent', id: response.comment.id, error: null });
        void client.invalidateQueries({ queryKey: commentKeys.all });
      } catch (error) {
        const collided = error instanceof ApiError && error.code === 'reply_id_collision';
        patchReply(reply.key, { state: 'failed', error: replyError(error), collided });
      }
    },
    [client],
  );
  const send = React.useCallback(
    (target: PortalComment, body: string, replyId: string): Promise<void> => {
      const reply: OwnerReply = {
        key: `reply-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        rootId: threadRoot(target),
        targetId: target.id,
        replyId,
        id: null,
        body,
        sentAt: new Date().toISOString(),
        state: 'sending',
        error: null,
        collided: false,
      };
      setReplies([...replies.slice(-49), reply]);
      return post(reply);
    },
    [post],
  );
  const retry = React.useCallback(
    (reply: OwnerReply): Promise<void> => {
      patchReply(reply.key, { state: 'sending', error: null });
      return post(reply);
    },
    [post],
  );
  return { send, retry };
}
