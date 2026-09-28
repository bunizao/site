import * as React from 'react';
import { useIsFetching, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import type { AuditEntry, BroadcastRecord, NotifyGateDecision, NotifyGateStatus } from '@bunizao/contracts';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/coss/alert-dialog';
import { Button } from '@/components/coss/button';
import { Input } from '@/components/coss/input';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/coss/menu';
import { Popover, PopoverDescription, PopoverPopup, PopoverTitle, PopoverTrigger } from '@/components/coss/popover';
import { Skeleton } from '@/components/coss/skeleton';
import { activityActorName } from '@/features/admin/activity-copy';
import type { PortalActivityEntry, PortalActivityEvent, PortalComment } from '@/features/admin/server/portal-client';
import type { MoodIngestHealth } from '@bunizao/contracts/mood';
import { cn } from '@/lib/utils';
import { describeError, isMissingRoute } from '../app/api';
import { Link } from '../app/router';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { useSubscriberCounts } from '../audience/data';
import { prefetchCommentList, useCommentCounts, useCommentList, type CommentFilter } from '../comments/data';
import {
  LOCKDOWN_SPANS,
  activeLockdown,
  lockdownEnds,
  lockdownWho,
  prefetchLockdown,
  useLockdown,
  useLockdownActions,
  useNow,
} from '../comments/Lockdown';
import { absoluteTime, isAwaitingEmail, relativeTime } from '../comments/model';
import { emailCaption, modeCaption, prefetchSitePolicy, useSitePolicy } from '../comments/site-policy';
import { RequireEmailSwitch, SiteModeSwitch } from '../comments/SitePolicy';
import { useMoodHealth } from '../tools/data';
import { ALL_ACTIVITY, flattenFeed, prefetchActivityFeed, useActivityFeed } from '../activity/data';
import { entryTarget, targetTitle } from '../activity/model';
import { Dot, PRESSABLE, type Tone } from '../activity/table';
import { denseDays } from '../analytics/charts';
import { DEFAULT_RANGE, prefetchSummary, useSummary } from '../analytics/data';
import { formatCount, lastUtcDays } from '../analytics/format';
import { prefetchHomeReads, useAudit, useBroadcasts, useCommentDaily, useNotifyGate, useOldestHeld, useReleaseGate } from './data';

/* Home answers one question: does anything need me? Then, more quietly:
   how the week went, whether the systems are well, what just happened.

   Space groups things, not rules: one reading column and no dividers
   between rows. A line has at most two text styles, what it says and a
   muted detail. Colour appears only where something is held or failing.
   A line with a verb carries that one action; a line that only opens
   something is a link with a chevron, not a button. */

const HELD: CommentFilter = { status: 'held', postId: null, key: null, value: null };
const BROADCAST_WINDOW_MS = 14 * 86_400_000;

/** Every read Home draws on arrival (see app/lazy-screen.ts). */
export function prefetch(client: QueryClient): Promise<unknown> {
  return Promise.all([
    prefetchHomeReads(client),
    prefetchCommentList(client, HELD),
    prefetchSummary(client, DEFAULT_RANGE),
    prefetchActivityFeed(client, ALL_ACTIVITY),
    prefetchLockdown(client),
    prefetchSitePolicy(client),
  ]);
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

/** Rows bleed their hover background past the column, so their text lines
    up with the section headings. */
const BLEED = '-mx-3 rounded-lg px-3';
const PRESS = cn(PRESSABLE, 'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset');
/** A small button that grows to a full 44px on touch. */
const SMALL_BUTTON = 'h-8 sm:h-8 pointer-coarse:h-11';

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "just now", "7 minutes ago", "yesterday", "19 days ago". */
function ago(iso: string, now = Date.now()): string {
  const seconds = (Date.parse(iso) - now) / 1000;
  const size = Math.abs(seconds);
  if (size < 60) return 'just now';
  if (size < 3_600) return RELATIVE.format(Math.trunc(seconds / 60), 'minute');
  if (size < 86_400) return RELATIVE.format(Math.trunc(seconds / 3_600), 'hour');
  return RELATIVE.format(Math.trunc(seconds / 86_400), 'day');
}

function listWords(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

interface Read {
  what: string;
  query: { isError: boolean; data: unknown; error: unknown; isFetching: boolean; refetch: () => Promise<unknown> };
}

/** Reads whose first load failed: they have nothing to show at all. */
const failedReads = (reads: readonly Read[]): Read[] => reads.filter(({ query }) => query.isError && query.data === undefined);

/** A two-line item: a sentence, a muted detail under it, one action. */
const ITEM = cn('grid grid-cols-[0.5rem_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5', BLEED);
/** A phone puts the action under the sentence rather than squeezing both. */
const ITEM_STACKED = 'max-sm:grid-cols-[0.5rem_minmax(0,1fr)]';
const ACTION_SLOT = 'max-sm:col-start-2 max-sm:mt-3 max-sm:justify-self-start';

function ItemBody({ tone, title, detail }: { tone?: Tone | null; title: string; detail?: string | null }) {
  return (
    <>
      <span className="flex h-5 items-center self-start">{tone && <Dot tone={tone} />}</span>
      <span className="min-w-0">
        <span className="block text-[15px] leading-5 [overflow-wrap:anywhere]">{title}</span>
        {detail && <span className="mt-0.5 block text-[13px] text-muted-foreground leading-[18px]">{detail}</span>}
      </span>
    </>
  );
}

/** A section's failed first loads as one item with one retry, not a line
    per read: when site-api is down, every read fails for the same reason. */
function SectionError({ reads }: { reads: readonly Read[] }) {
  if (reads.length === 0) return null;
  return (
    <div role="alert" className={ITEM}>
      <ItemBody tone="danger" title={`Could not load ${listWords(reads.map((read) => read.what))}.`} detail={describeError(reads[0].query.error)} />
      {/* Quiet: when site-api is down every section says so, and four
          filled buttons would shout it. */}
      <Button
        size="sm"
        variant="ghost"
        className={cn(SMALL_BUTTON, '-me-3 px-3 text-sm')}
        loading={reads.some(({ query }) => query.isFetching)}
        onClick={() => {
          for (const { query } of reads) void query.refetch();
        }}
      >
        Try again
      </Button>
    </div>
  );
}

/** A section: the lead one has a heading that reads first, the others a
    small muted one, so the eye lands on what needs the owner. */
function Block({ id, title, lead = false, action, children }: {
  id: string;
  title: string;
  lead?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-2 flex min-h-8 items-center gap-3">
        <h2 id={id} className={lead ? 'font-medium text-lg' : 'font-medium text-muted-foreground text-sm'}>
          {title}
        </h2>
        {action && <span className="ms-auto flex items-center">{action}</span>}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Needs you                                                           */
/* ------------------------------------------------------------------ */

/** A secondary button's look, for the label inside a row link: the row is
    the target, the label says what it does. */
const ACTION_LOOK = cn(
  'inline-flex items-center rounded-lg bg-secondary px-3 font-medium text-base text-secondary-foreground sm:text-sm',
  SMALL_BUTTON,
);

/** The comment open inside the Held queue, so the next key after a verdict
    (J, K) walks the rest of the queue rather than every comment. */
const heldLink = (id: string): string => `/comments?status=held&c=${encodeURIComponent(id)}`;

function LinkItem({ to, tone, title, detail, action }: {
  to: string;
  tone?: Tone | null;
  title: string;
  detail?: string | null;
  /** The verb, when the row does more than open a screen. */
  action?: string;
}) {
  return (
    <li>
      <Link to={to} className={cn(ITEM, PRESS, action && ITEM_STACKED)}>
        <ItemBody tone={tone} title={title} detail={detail} />
        {action ? (
          <span aria-hidden className={cn(ACTION_LOOK, ACTION_SLOT)}>
            {action}
          </span>
        ) : (
          <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
        )}
      </Link>
    </li>
  );
}

function ItemSkeletons() {
  return (
    <div aria-hidden className="flex flex-col gap-1">
      {[0, 1].map((index) => (
        <div key={index} className={cn(ITEM, ITEM_STACKED)}>
          <span />
          <span className="flex flex-col gap-2.5 py-1">
            <Skeleton className="h-3.5 w-56 max-w-full" />
            <Skeleton className="h-3 w-32" />
          </span>
          <Skeleton className={cn('h-8 w-28 rounded-lg', ACTION_SLOT)} />
        </div>
      ))}
    </div>
  );
}

const DECISIONS: Record<NotifyGateDecision, { menu: string; title: (n: number) => string; body: string; confirm: (n: number) => string }> = {
  digest: {
    menu: 'Send as one digest',
    title: (n) => `Send ${n} held ${n === 1 ? 'post' : 'posts'} as one digest?`,
    body: 'Mood subscribers get one email now. A sent email cannot be recalled.',
    confirm: () => 'Send digest',
  },
  individual: {
    menu: 'Send each post',
    title: (n) => `Send ${n} held ${n === 1 ? 'post' : 'posts'} one by one?`,
    body: 'Mood subscribers get one email per post, now. A sent email cannot be recalled.',
    confirm: (n) => `Send ${n} ${n === 1 ? 'email' : 'emails'}`,
  },
  drop: {
    menu: 'Drop, wait for next digest',
    title: (n) => `Drop ${n} held ${n === 1 ? 'post' : 'posts'}?`,
    body: 'No email goes out now. The posts stay on the site and reach subscribers in their next regular digest.',
    confirm: () => 'Drop',
  },
};

function hoursUntil(iso: string, hours: number): string {
  const left = Date.parse(iso) + hours * 3_600_000 - Date.now();
  if (left <= 0) return 'auto digest due now';
  const h = Math.floor(left / 3_600_000);
  const m = Math.round((left % 3_600_000) / 60_000);
  return `auto digest in ${h ? `${h}h ` : ''}${m}m`;
}

/** The one line with a real button: Send digest, and the other two ways
    to release in its menu. Both confirm first. */
function GateItem({ gate, onDecide }: { gate: NotifyGateStatus; onDecide: (decision: NotifyGateDecision) => void }) {
  const count = gate.heldPostIds.length;
  const detail = gate.heldSince
    ? `Held ${ago(gate.heldSince)}, ${hoursUntil(gate.heldSince, gate.config.autoReleaseAfterHours)}`
    : null;
  return (
    <li className={cn(ITEM, ITEM_STACKED)}>
      <ItemBody tone="attention" title={`${count} mood ${count === 1 ? 'post' : 'posts'} held by the notify gate`} detail={detail} />
      <span className={cn('flex', ACTION_SLOT)}>
        <Button size="sm" variant="secondary" className={cn(SMALL_BUTTON, 'rounded-e-none px-3')} onClick={() => onDecide('digest')}>
          Send digest
        </Button>
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="sm"
                variant="secondary"
                className={cn(SMALL_BUTTON, 'w-8 rounded-s-none border-s-background px-0 pointer-coarse:w-11')}
                aria-label="Other ways to release"
              />
            }
          >
            <ChevronDown aria-hidden />
          </MenuTrigger>
          <MenuPopup align="end">
            {(['individual', 'drop'] as const).map((decision) => (
              <MenuItem key={decision} className="pointer-coarse:min-h-11" onClick={() => onDecide(decision)}>
                {DECISIONS[decision].menu}
              </MenuItem>
            ))}
          </MenuPopup>
        </Menu>
      </span>
    </li>
  );
}

interface Trouble {
  key: string;
  to: string;
  tone: Tone | null;
  title: string;
  detail: string | null;
}

/** Broadcasts that failed in the last two weeks, and any still sending. */
function broadcastItems(rows: readonly BroadcastRecord[]): Trouble[] {
  const since = Date.now() - BROADCAST_WINDOW_MS;
  return rows.flatMap((row): Trouble[] => {
    const base = { key: row.id, to: `/broadcasts/${encodeURIComponent(row.id)}` };
    const when = row.sentAt ? `Sent ${ago(row.sentAt)}` : `Created ${ago(row.createdAt)}`;
    if (row.status === 'sending') {
      return [{ ...base, tone: null, title: `Broadcast sending: ${row.subject}`, detail: `Started ${ago(row.sentAt ?? row.createdAt)}` }];
    }
    if (Date.parse(row.sentAt ?? row.createdAt) < since) return [];
    if (row.status === 'failed') return [{ ...base, tone: 'danger', title: `Broadcast failed: ${row.subject}`, detail: when }];
    if (row.failedCount > 0) {
      const title = `${formatCount(row.failedCount)} of ${formatCount(row.recipientCount)} emails failed: ${row.subject}`;
      return [{ ...base, tone: 'danger', title, detail: when }];
    }
    return [];
  });
}

function heldSplit(rows: readonly PortalComment[]) {
  const review = rows.filter((row) => !isAwaitingEmail(row));
  const awaiting = rows.filter(isAwaitingEmail);
  // Rows are newest first, so the last one of each kind is its oldest.
  return { review, awaiting, oldestReview: review[review.length - 1] ?? null, oldestAwaiting: awaiting[awaiting.length - 1] ?? null };
}

function NeedsYou() {
  const counts = useCommentCounts();
  const heldList = useCommentList(HELD);
  const held = counts.data?.held;
  const complete = heldList.data ? !heldList.hasNextPage : false;
  const oldestHeld = useOldestHeld(complete ? 0 : held);
  const gate = useNotifyGate();
  const broadcasts = useBroadcasts();
  const mood = useMoodHealth();
  const release = useReleaseGate();
  const [confirm, setConfirm] = React.useState<NotifyGateDecision | null>(null);
  const [confirmCount, setConfirmCount] = React.useState(0);

  const rows = React.useMemo(() => heldList.data?.pages.flatMap((page) => page.comments) ?? [], [heldList.data]);
  const split = React.useMemo(() => heldSplit(rows), [rows]);
  const fromBroadcasts = React.useMemo(() => broadcastItems(broadcasts.data ?? []), [broadcasts.data]);
  // A stalled ingest is the owner's to look at: said here, not only in Systems.
  const moodTrouble = mood.data ? moodState(mood.data).trouble : null;

  const items: React.ReactNode[] = [];

  if (held && held > 0) {
    if (complete) {
      if (split.review.length > 0 && split.oldestReview) {
        const n = split.review.length;
        items.push(
          <LinkItem
            key="held"
            to={heldLink(split.oldestReview.id)}
            tone="attention"
            title={`${n} held ${n === 1 ? 'comment' : 'comments'} to review`}
            detail={`Oldest ${ago(split.oldestReview.createdAt)}`}
            action="Review oldest"
          />,
        );
      }
    } else {
      const oldest = oldestHeld.data;
      items.push(
        <LinkItem
          key="held"
          to={oldest ? heldLink(oldest.id) : '/comments?status=held'}
          tone="attention"
          title={`${formatCount(held)} held comments`}
          detail={counts.data?.oldestHeldAt ? `Oldest ${ago(counts.data.oldestHeldAt)}` : null}
          action={oldest ? 'Review oldest' : 'Review'}
        />,
      );
    }
  }

  if (gate.data?.state === 'held' && gate.data.heldPostIds.length > 0) {
    const data = gate.data;
    items.push(
      <GateItem
        key="gate"
        gate={data}
        onDecide={(decision) => {
          setConfirmCount(data.heldPostIds.length);
          setConfirm(decision);
        }}
      />,
    );
  }

  // Failures first, then what is only in progress or waiting on someone else.
  const trouble = [...fromBroadcasts, ...(moodTrouble ? [moodTrouble] : [])];
  for (const item of [...trouble.filter((entry) => entry.tone), ...trouble.filter((entry) => !entry.tone)]) {
    items.push(<LinkItem key={item.key} to={item.to} tone={item.tone} title={item.title} detail={item.detail} />);
  }

  if (complete && split.awaiting.length > 0 && split.oldestAwaiting) {
    const n = split.awaiting.length;
    items.push(
      <LinkItem
        key="awaiting"
        to={heldLink(split.oldestAwaiting.id)}
        title={`${n} ${n === 1 ? 'comment waits' : 'comments wait'} on the writer's email`}
        detail={`Oldest ${ago(split.oldestAwaiting.createdAt)}`}
      />,
    );
  }

  const failed = failedReads([
    { what: 'held comments', query: counts },
    { what: 'the notify gate', query: gate },
    { what: 'broadcasts', query: broadcasts },
  ]);
  const loading = counts.isPending || gate.isPending || broadcasts.isPending || (Boolean(held) && heldList.isPending);

  return (
    <Block id="needs-you" title="Needs you" lead>
      {items.length > 0 && <ul className="flex flex-col gap-1 pointer-coarse:gap-2">{items}</ul>}
      {loading && items.length === 0 && <ItemSkeletons />}
      {!loading && items.length === 0 && failed.length === 0 && <p className="py-2.5 text-[15px] leading-5">Nothing needs you right now.</p>}
      <SectionError reads={failed} />

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogPopup>
          {confirm && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{DECISIONS[confirm].title(confirmCount)}</AlertDialogTitle>
                <AlertDialogDescription>{DECISIONS[confirm].body}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button
                  autoFocus
                  variant={confirm === 'drop' ? 'destructive' : 'default'}
                  onClick={() => {
                    release(confirm);
                    setConfirm(null);
                  }}
                >
                  {DECISIONS[confirm].confirm(confirmCount)}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogPopup>
      </AlertDialog>
    </Block>
  );
}

/* ------------------------------------------------------------------ */
/* Systems                                                             */
/* ------------------------------------------------------------------ */

/* Lines that are always there, so nothing below moves when one of them
   changes, in two groups. Comments everywhere: the site-wide mode, the
   email rule and the lockdown, each with its switch. Then the mood archive
   against the live channel, and signups still waiting on their email.
   A healthy line is a name and a muted value. A line that needs a look,
   or a switch that is on, gets a dot and a value in full strength. */

const SYSTEM = cn('grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-2 text-sm', BLEED);

function SystemText({ label, tone, value }: { label: string; tone?: Tone | null; value: React.ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
      <span className="shrink-0 sm:w-44">{label}</span>
      <span className={cn('flex min-w-0 items-center gap-2', tone ? 'text-foreground' : 'text-muted-foreground')}>
        {tone && <Dot tone={tone} />}
        <span className="min-w-0 [overflow-wrap:anywhere]">{value}</span>
      </span>
    </span>
  );
}

function LinkSystem({ to, label, tone, value }: { to: string; label: string; tone?: Tone | null; value: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className={cn(SYSTEM, PRESS)}>
        <SystemText label={label} tone={tone} value={value} />
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </Link>
    </li>
  );
}

const valueSkeleton = <Skeleton className="my-1 h-3 w-32" />;

/** The site-wide mode and the email rule. One click each, no confirm:
    the receipt carries Undo. */
function SiteSystems({ query }: { query: ReturnType<typeof useSitePolicy> }) {
  const captionId = React.useId();
  const policy = query.data?.policy;
  if (query.isPending) {
    return (
      <>
        <li className={SYSTEM} aria-busy>
          <SystemText label="Comments everywhere" value={valueSkeleton} />
        </li>
        <li className={SYSTEM} aria-busy>
          <SystemText label="Require a confirmed email" value={valueSkeleton} />
        </li>
      </>
    );
  }
  if (!policy) {
    // A failed read is the section's error line; a missing route is said here.
    return (
      <li className={SYSTEM}>
        <SystemText label="Comments everywhere" value={isMissingRoute(query.error) ? 'Unavailable, needs the updated site-api' : 'Not loaded'} />
      </li>
    );
  }
  return (
    <>
      {/* A phone puts the three choices under the line, full width. */}
      <li className={cn(SYSTEM, 'max-sm:grid-cols-1 max-sm:gap-y-2')}>
        <SystemText label="Comments everywhere" tone={policy.mode ? 'attention' : null} value={modeCaption(policy)} />
        <SiteModeSwitch policy={policy} className="max-sm:flex max-sm:w-full max-sm:[&>button]:flex-1 pointer-coarse:h-10" />
      </li>
      <li>
        {/* The whole line toggles it. */}
        <label className={cn(SYSTEM, PRESS, 'cursor-pointer')}>
          <SystemText
            label="Require a confirmed email"
            tone={policy.requireEmail ? 'attention' : null}
            value={<span id={captionId}>{emailCaption(policy)}</span>}
          />
          <RequireEmailSwitch policy={policy} describedBy={captionId} />
        </label>
      </li>
    </>
  );
}

function LockdownSystem({ query, emailRequired }: { query: ReturnType<typeof useLockdown>; emailRequired: boolean }) {
  const { engage, lift } = useLockdownActions();
  const now = useNow(30_000);
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const lockdown = activeLockdown(query.data, now);

  const run = async (send: () => Promise<string | null>): Promise<void> => {
    setError(null);
    setError(await send());
  };

  const label = 'Comment lockdown';
  if (query.isPending) {
    return (
      <li className={SYSTEM} aria-busy>
        <SystemText label={label} value={valueSkeleton} />
      </li>
    );
  }
  if (query.isError && !query.data) {
    // A failed read is the section's error line; a missing route is said here.
    return (
      <li className={SYSTEM}>
        <SystemText label={label} value={isMissingRoute(query.error) ? 'Unavailable, needs the updated site-api' : 'Not loaded'} />
      </li>
    );
  }

  // The email rule already asks what a lockdown would, and never ends.
  if (emailRequired && !lockdown && !error) {
    return (
      <li className={SYSTEM}>
        <SystemText label={label} value="Email already required everywhere" />
      </li>
    );
  }

  const value = error ? `Not changed: ${error}` : lockdown ? `On, ${lockdownWho(lockdown)}, ${lockdownEnds(lockdown, now)}` : 'Off';
  return (
    <li className={SYSTEM}>
      <SystemText label={label} tone={error ? 'danger' : lockdown ? 'attention' : null} value={value} />
      {lockdown ? (
        <Button size="sm" variant="secondary" className={cn(SMALL_BUTTON, 'px-3')} onClick={() => void run(lift)}>
          Lift
        </Button>
      ) : (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) setError(null);
          }}
        >
          {/* Quiet while comments are open: a switch for a bad day, not a call to act. */}
          <PopoverTrigger render={<Button size="sm" variant="ghost" className={cn(SMALL_BUTTON, '-me-1 px-3 text-muted-foreground text-sm hover:text-foreground')} />}>
            Lock down…
          </PopoverTrigger>
          <PopoverPopup align="end" className="w-80">
            <PopoverTitle className="text-sm">Lock down comments</PopoverTitle>
            <PopoverDescription className="text-[13px]">
              Until it ends, every anonymous comment waits for its writer to confirm an email. Signed-in readers are not affected.
            </PopoverDescription>
            <Input
              size="sm"
              className="mt-3"
              maxLength={200}
              value={note}
              aria-label="Note, optional"
              placeholder="Note, optional: why"
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {LOCKDOWN_SPANS.map((span) => (
                <Button
                  key={span.minutes}
                  size="xs"
                  variant="outline"
                  className="pointer-coarse:h-11"
                  aria-label={`Lock down for ${span.label}`}
                  onClick={() => {
                    setOpen(false);
                    const text = note;
                    setNote('');
                    void run(() => engage(span.minutes, text));
                  }}
                >
                  {span.short}
                </Button>
              ))}
            </div>
          </PopoverPopup>
        </Popover>
      )}
    </li>
  );
}

/* The mood screen's thresholds (tools/MoodScreen.tsx): site-api ingests
   every 15 minutes, so 20 minutes behind is one late run and an hour is a
   stall. */
const MOOD_LATE_S = 20 * 60;
const MOOD_STALLED_S = 60 * 60;

/** The archive's state for its Systems line, and, when it has stalled or
    is empty, the item Needs you shows for it. */
function moodState(health: MoodIngestHealth): { tone: Tone | null; value: string; trouble: Trouble | null } {
  const { lastIngested, liveLatest, drift } = health;
  const trouble = (title: string, detail: string): Trouble => ({ key: 'mood', to: '/mood', tone: 'danger', title, detail });
  if (!lastIngested) {
    return { tone: 'danger', value: 'Empty, nothing ingested yet', trouble: trouble('The mood archive is empty', 'Nothing has been ingested yet') };
  }
  const last = `last ingested ${ago(lastIngested.datetime)}`;
  if (!liveLatest) return { tone: null, value: `Drift unknown, the live channel did not answer; ${last}`, trouble: null };
  const behind = Math.max(0, drift.messages ?? 0);
  const seconds = drift.seconds ?? 0;
  const posts = `${behind} ${behind === 1 ? 'post' : 'posts'} behind, ${last}`;
  if (behind > 0 && seconds > MOOD_STALLED_S) return { tone: 'danger', value: `Stalled, ${posts}`, trouble: trouble('Mood ingest has stalled', posts) };
  if (behind > 0 && seconds > MOOD_LATE_S) return { tone: 'attention', value: posts, trouble: null };
  return { tone: null, value: `Current, ${last}`, trouble: null };
}

function MoodSystem({ query }: { query: ReturnType<typeof useMoodHealth> }) {
  const state = query.data ? moodState(query.data) : null;
  const value = state ? state.value : query.isPending ? valueSkeleton : 'Not loaded';
  return <LinkSystem to="/mood" label="Mood archive" tone={state?.tone} value={value} />;
}

function Systems() {
  const site = useSitePolicy();
  const lockdown = useLockdown();
  const mood = useMoodHealth();
  const signups = useSubscriberCounts();
  const pending = signups.data?.pendingCount;
  const failed = failedReads([
    // A site-api without a comment route is not a failure; its line says so.
    ...(isMissingRoute(site.error) ? [] : [{ what: 'the comment switches', query: site }]),
    ...(isMissingRoute(lockdown.error) ? [] : [{ what: 'the comment lockdown', query: lockdown }]),
    { what: 'mood ingest', query: mood },
    { what: 'subscriber counts', query: signups },
  ]);
  // Four lines of "Not loaded" over the error line would say it five
  // times. A missing comment route is not a failure, so its line stays.
  const blank = failed.length === 4;

  return (
    <Block id="systems" title="Systems">
      {!blank && (
        <>
          <ul aria-label="Comments everywhere" className="flex flex-col">
            <SiteSystems query={site} />
            <LockdownSystem query={lockdown} emailRequired={Boolean(site.data?.policy.requireEmail)} />
          </ul>
          {/* Twice the space between two groups as between two lines. */}
          <ul className="mt-8 flex flex-col">
            <MoodSystem query={mood} />
            <LinkSystem
              to="/subscribers?status=pending"
              label="Unconfirmed signups"
              value={pending !== undefined ? (pending === 0 ? 'None' : formatCount(pending)) : signups.isPending ? valueSkeleton : 'Not loaded'}
            />
          </ul>
        </>
      )}
      <SectionError reads={failed} />
    </Block>
  );
}

/* ------------------------------------------------------------------ */
/* Last 7 days                                                         */
/* ------------------------------------------------------------------ */

function sum(values: ReadonlyArray<number | null>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

/** The last 7 UTC days against the 7 before, in words. Today is only part
    of a day, so the week before is cut at the same time of day: without
    that, every morning would read as a drop. Small counts compare as a
    difference, since "up 50%" from 2 to 3 says more than it means. Null
    when a day of either week is unknown. */
function weekTrend(values: ReadonlyArray<number | null>, now = Date.now()): string | null {
  if (values.length < 14 || values.some((value) => value === null)) return null;
  const days = values.slice(-14) as number[];
  const dayPart = (now % 86_400_000) / 86_400_000;
  const current = sum(days.slice(7));
  const previous = sum(days.slice(0, 6)) + days[6] * dayPart;
  if (previous < 20) {
    const difference = current - Math.round(previous);
    if (difference === 0) return 'Same as the week before';
    return `${formatCount(Math.abs(difference))} ${difference > 0 ? 'more' : 'fewer'} than the week before`;
  }
  const change = Math.round(((current - previous) / previous) * 100);
  if (Math.abs(change) < 3) return 'About the same as the week before';
  return `${change > 0 ? 'Up' : 'Down'} ${Math.abs(change)}% on the week before`;
}

/** One figure: its name, the 7-day total, and its trend. A phone lays the
    three out as rows, the total on the right. */
function Figure({ to, label, values, loading }: { to: string; label: string; values: ReadonlyArray<number | null> | null; loading: boolean }) {
  const week = values?.slice(-7) ?? [];
  const partial = week.some((value) => value === null);
  return (
    <li>
      <Link
        to={to}
        className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-2.5 sm:block sm:py-3', BLEED, PRESS)}
      >
        <span className="text-muted-foreground text-sm sm:block">{label}</span>
        <span className="row-span-2 text-end text-2xl tabular-nums tracking-tight sm:mt-1 sm:block sm:text-start sm:text-[28px] sm:leading-9">
          {values ? `${partial ? '≥' : ''}${formatCount(sum(week))}` : loading ? <Skeleton className="my-2 h-6 w-20" /> : '–'}
        </span>
        <span className="text-[13px] text-muted-foreground sm:mt-0.5 sm:block">
          {values ? (weekTrend(values) ?? 'Too little history to compare') : loading ? <Skeleton className="my-1 h-3 w-36" /> : 'Not loaded'}
        </span>
      </Link>
    </li>
  );
}

/** New subscribers per UTC day from the newest 100 audit events. Days older
    than the oldest event in a full page are unknown, not zero. */
function confirmationsByDay(events: readonly AuditEntry[], days: readonly string[]): Array<number | null> {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.eventType !== 'subscription_confirmed') continue;
    const day = event.createdAt.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const truncated = events.length >= 100;
  const covered = truncated ? events[events.length - 1].createdAt.slice(0, 10) : '';
  return days.map((day) => (truncated && day < covered ? null : counts.get(day) ?? 0));
}

function LastWeek() {
  const views = useSummary(DEFAULT_RANGE);
  const comments = useCommentDaily();
  const audit = useAudit();
  const days = lastUtcDays(14);

  const viewValues = views.data ? denseDays(views.data.daily, DEFAULT_RANGE).slice(-14).map((point) => point.views) : null;
  const commentValues = comments.data
    ? days.map((day) => comments.data.find((entry) => entry.date === day)?.count ?? 0)
    : null;
  const subscriberValues = audit.data ? confirmationsByDay(audit.data, days) : null;
  const failed = failedReads([
    { what: 'views', query: views },
    { what: 'comments', query: comments },
    { what: 'new subscribers', query: audit },
  ]);

  return (
    <Block id="last-week" title="Last 7 days">
      {/* With nothing loaded, the error line alone says so. */}
      {failed.length < 3 && (
        <ul className="grid sm:grid-cols-3 sm:gap-8">
          <Figure to="/analytics" label="Views" values={viewValues} loading={views.isPending} />
          <Figure to="/comments/insights" label="Comments" values={commentValues} loading={comments.isPending} />
          <Figure to="/subscribers" label="New subscribers" values={subscriberValues} loading={audit.isPending} />
        </ul>
      )}
      <SectionError reads={failed} />
    </Block>
  );
}

/* ------------------------------------------------------------------ */
/* Recent activity                                                     */
/* ------------------------------------------------------------------ */

const RECENT = 6;

/* What the actor did, written to run into the title of the post it landed
   on: "Priya liked Why I stopped using ORMs". The Activity screen has the
   emoji, the verdict's reason and the reader. */
const ACTS: Record<PortalActivityEvent, string> = {
  'comment.create': 'commented on',
  'comment.edit': 'edited a comment on',
  'comment.remove': 'withdrew a comment on',
  'comment.moderate': 'ruled on a comment on',
  'comment.approve': 'approved a comment on',
  'comment.hide': 'hid a comment on',
  'comment.delete': 'deleted a comment on',
  'reaction.add': 'liked',
  'reaction.remove': 'took back a like on',
};

const VERDICT_ACTS: Record<string, string> = {
  held: 'held a comment on',
  published: 'let a comment through on',
  rejected: 'rejected a comment on',
};

function actPhrase(entry: PortalActivityEntry): string {
  if (entry.event === 'comment.moderate') return VERDICT_ACTS[entry.status ?? ''] ?? ACTS[entry.event];
  if (entry.targetType === 'comment' && entry.event === 'reaction.add') return 'liked a comment on';
  if (entry.targetType === 'comment' && entry.event === 'reaction.remove') return 'took back a like on a comment on';
  return ACTS[entry.event];
}

const RECENT_ROW = cn('grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-2 text-sm', BLEED);

/** Who did what, where, and when: two text styles, no symbols. The whole
    row is the link to its target, so the target is the row's height. */
function RecentRow({ entry }: { entry: PortalActivityEntry }) {
  const target = entryTarget(entry);
  const content = (
    <>
      <span className="min-w-0 truncate max-sm:line-clamp-2 max-sm:whitespace-normal">
        {activityActorName(entry)} <span className="text-muted-foreground">{actPhrase(entry)}</span> {targetTitle(entry)}
        {target?.external && <span className="sr-only"> (opens the public site)</span>}
      </span>
      <time dateTime={entry.createdAt} title={absoluteTime(entry.createdAt)} className="whitespace-nowrap text-[13px] text-muted-foreground tabular-nums">
        {relativeTime(entry.createdAt).replace('just now', 'now')}
      </time>
    </>
  );
  return (
    <li>
      {!target ? (
        <div className={RECENT_ROW}>{content}</div>
      ) : target.external ? (
        <a href={target.to} target="_blank" rel="noreferrer" title="Opens the public site" className={cn(RECENT_ROW, PRESS)}>
          {content}
        </a>
      ) : (
        <Link to={target.to} className={cn(RECENT_ROW, PRESS)}>
          {content}
        </Link>
      )}
    </li>
  );
}

function Recent() {
  const feed = useActivityFeed(ALL_ACTIVITY, { live: false });
  const entries = React.useMemo(() => flattenFeed(feed.data).slice(0, RECENT), [feed.data]);

  return (
    <Block
      id="recent"
      title="Recent activity"
      action={
        <Button size="sm" variant="ghost" render={<Link to="/activity" />} className={cn(SMALL_BUTTON, '-me-3 px-3 text-muted-foreground text-sm hover:text-foreground')}>
          View all
        </Button>
      }
    >
      {feed.isPending ? (
        <div aria-hidden className="flex flex-col">
          {Array.from({ length: RECENT }, (_, index) => (
            <div key={index} className="flex min-h-11 items-center gap-4 py-2">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="ms-auto h-3 w-8" />
            </div>
          ))}
        </div>
      ) : feed.isError && !feed.data ? (
        <SectionError reads={[{ what: 'recent activity', query: feed }]} />
      ) : entries.length === 0 ? (
        <p className="py-2.5 text-muted-foreground text-sm">Nothing yet. Comments and likes show up here as they happen.</p>
      ) : (
        <ol className="flex flex-col">
          {entries.map((entry) => (
            <RecentRow key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </Block>
  );
}

/* ------------------------------------------------------------------ */

function RefreshButton() {
  const client = useQueryClient();
  const fetching = useIsFetching() > 0;
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      className="ms-auto pointer-coarse:size-11"
      aria-label="Refresh everything on this screen"
      onClick={() => void client.invalidateQueries({ refetchType: 'active' })}
    >
      <RefreshCw aria-hidden className={cn(fetching && 'motion-safe:animate-spin')} />
    </Button>
  );
}

export default function HomeScreen() {
  return (
    <div className="flex h-svh flex-col">
      <ScreenHeader title="Home">
        <RefreshButton />
      </ScreenHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* One reading column; sections are grouped by the space between them. */}
        <div className="mx-auto flex w-full max-w-[44rem] flex-col gap-10 px-4 pt-6 pb-16 sm:gap-12 sm:px-6 sm:pt-10">
          <NeedsYou />
          <LastWeek />
          <Systems />
          <Recent />
        </div>
      </div>
    </div>
  );
}
