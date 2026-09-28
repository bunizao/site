import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { commentAnchorToken } from '@bunizao/contracts/comments';
import {
  Ban,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  CornerDownLeft,
  ExternalLink,
  EyeOff,
  Filter,
  Link2,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pin,
  PinOff,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/coss/button';
import { Kbd } from '@/components/coss/kbd';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/coss/menu';
import { Skeleton } from '@/components/coss/skeleton';
import { toastManager } from '@/components/coss/toast';
import { cn } from '@/lib/utils';
import type { PortalActivity, PortalActivityEntry, PortalComment } from '@/features/admin/server/portal-client';
import { SMALL } from '../activity/table';
import { apiGet } from '../app/api';
import { href, navigate } from '../app/router';
import { HashValue, TOUCH_TARGET } from '../moderation/ui';
import { ControlMarks, OwnerBadge, StatusMark } from './CommentRow';
import { canPin, lockHolder } from './controls';
import {
  RESTORE_DAYS,
  canApply,
  discardReply,
  restoreLeft,
  threadRoot,
  useOwnerReplies,
  useReply,
  type OwnerReply,
  type RejectReason,
  type Verdict,
} from './data';
import {
  absoluteTime,
  commentPublicUrl,
  decisionOf,
  fingerprintRecord,
  fullStamp,
  identityDetail,
  isHash,
  pivotHref,
  stamp,
  writerPivot,
  type Pivot,
  type RecordRow,
} from './model';
import { PostModeLine } from './PostMode';
import { RejectMenu } from './RejectMenu';

/* The detail of one comment, flat: a header line, the actions, the text,
   then every fact about the writer as label/value rows under plain section
   headings. Nothing folds, nothing nests; the panel scrolls. It renders
   from the list row alone, so opening it never waits on the network; only
   History loads, in its own section. */

function useAnchorToken(id: string): string | null {
  // Kept with its comment's id, so another comment reads null at once,
  // without a render of the whole pane spent clearing it.
  const [anchor, setAnchor] = React.useState<{ id: string; token: string } | null>(null);
  React.useEffect(() => {
    let live = true;
    void commentAnchorToken(id).then((token) => live && setAnchor({ id, token }));
    return () => {
      live = false;
    };
  }, [id]);
  return anchor?.id === id ? anchor.token : null;
}

function copy(text: string, what: string): void {
  void navigator.clipboard?.writeText(text).then(
    () => toastManager.add({ title: `${what} copied`, timeout: 1500 }),
    () => toastManager.add({ type: 'error', title: 'Copy failed', description: 'Select the value and copy it by hand.' }),
  );
}

/** A pivot link: plain click stays on this screen, a modified click opens
    a new tab. `keep` is the comment left open across it: the panel's, which
    sits beside the filtered list; never the drawer's, which would cover it.
    A control of its own, not prose, so it gets the 44px touch target. */
function PivotAnchor({ pivot, keep, children, className }: {
  pivot: Pivot;
  keep: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const to = pivotHref(pivot.type, pivot.value, keep);
  return (
    <a
      href={href(to)}
      data-astro-prefetch="false"
      className={cn(
        TOUCH_TARGET,
        'rounded-sm underline decoration-[hsl(var(--muted-foreground))] underline-offset-[3px] outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring active:text-[hsl(var(--portal-accent))]',
        className,
      )}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-10">
      <h3 className="pb-1 font-medium text-muted-foreground text-sm">{title}</h3>
      {children}
    </div>
  );
}

/** A narrow pane wraps an address after its @, not mid-word. */
function EmailBreak({ value }: { value: string }) {
  const at = value.indexOf('@');
  if (at <= 0) return <>{value}</>;
  return <>{value.slice(0, at + 1)}<wbr />{value.slice(at + 1)}</>;
}

function Row({ row, keep }: { row: RecordRow; keep: string | null }) {
  const count = row.count;
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-start gap-x-3 py-2 text-[13px] leading-5 last:pb-0">
      <dt className="text-muted-foreground" title={row.explain}>{row.label}</dt>
      {/* Mono for a value only: "Not recorded" is a word, not a key. */}
      <dd className={cn('min-w-0 break-words', row.value ? 'text-foreground' : 'text-muted-foreground', row.value && row.mono && 'font-mono text-xs leading-5 tabular-nums')}>
        {row.value && row.mono && isHash(row.value) ? <HashValue key={row.value} value={row.value} /> : row.value ? <EmailBreak value={row.value} /> : 'Not recorded'}
        {row.banned && (
          <span className="ms-2 inline-flex items-center gap-1 whitespace-nowrap font-sans text-[hsl(var(--portal-danger))] text-xs">
            <Ban className="size-3" aria-hidden />
            Banned
          </span>
        )}
      </dd>
      <dd className="flex items-center gap-1 whitespace-nowrap text-xs">
        {row.pivot && count !== null && count > 1 && (
          <PivotAnchor pivot={row.pivot} keep={keep} className="tabular-nums">
            {count} comments
          </PivotAnchor>
        )}
        {row.pivot && count === 1 && <span className="text-muted-foreground">only this</span>}
        {row.pivot && count === null && (
          <PivotAnchor pivot={row.pivot} keep={keep}>
            Show all
          </PivotAnchor>
        )}
        {row.value && row.mono && (
          // A plain button: thirty coss Buttons cost a visible slice of every j.
          <button
            type="button"
            aria-label={`Copy ${row.label.toLowerCase()}`}
            className="relative inline-flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:bg-accent pointer-coarse:after:absolute pointer-coarse:after:size-11"
            onClick={() => copy(row.value!, row.label)}
          >
            <Copy className="size-3.5" aria-hidden />
          </button>
        )}
      </dd>
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  'comment.create': 'Written',
  'comment.edit': 'Edited',
  'comment.remove': 'Removed by the writer',
  'comment.moderate': 'Checked',
  'comment.approve': 'Approved',
  'comment.hide': 'Unpublished',
  'comment.delete': 'Deleted',
};

const ACTOR_LABELS = { reader: 'the writer', model: 'the checks', owner: 'you' } as const;

/** The owner's reject and restore log as `comment.moderate` (site-api
    reuses the event rather than rebuild the log table); the entry's note
    and status say which it was. */
function eventLabel(entry: PortalActivityEntry): string {
  if (entry.event === 'comment.moderate' && entry.actor === 'owner') {
    if (entry.note?.startsWith('Restored')) return 'Restored';
    if (entry.note?.startsWith('Rejected') || entry.status === 'rejected') return 'Rejected';
  }
  return EVENT_LABELS[entry.event] ?? entry.event;
}

function History({ commentId }: { commentId: string }) {
  const history = useQuery({
    queryKey: ['activity', 'comment', commentId],
    queryFn: ({ signal }) => apiGet<PortalActivity>('admin/activity', { targetType: 'comment', targetId: commentId, limit: 20 }, signal),
    staleTime: 15_000,
  });
  if (history.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading history" className="flex flex-col gap-2 py-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (history.isError) {
    return (
      <p className="py-1.5 text-[13px] text-muted-foreground">
        History did not load.{' '}
        <button type="button" className="text-foreground underline underline-offset-2" onClick={() => void history.refetch()}>
          Try again
        </button>
      </p>
    );
  }
  if (history.data.entries.length === 0) return <p className="py-2 text-[13px] text-muted-foreground">Nothing recorded yet.</p>;
  return (
    <ol className="flex flex-col">
      {history.data.entries.map((entry) => (
        <li key={entry.id} className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-x-3 py-2 text-[13px] leading-5 last:pb-0">
          <time className="font-mono text-muted-foreground text-xs leading-5 tabular-nums" dateTime={entry.createdAt}>
            {fullStamp(entry.createdAt)}
          </time>
          <span>
            {eventLabel(entry)}
            <span className="text-muted-foreground">
              {' '}by {ACTOR_LABELS[entry.actor]}
              {entry.source !== 'web' ? ` via ${entry.source}` : ''}
              {entry.reason && entry.reason !== 'ok' ? ` · ${entry.reason.replace(/_/g, ' ')}` : ''}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A deleted row's restore window, in words. Nothing for a pre-P2 row,
    which carries no window at all. */
function RestoreLine({ comment }: { comment: PortalComment }) {
  if (comment.status !== 'deleted' || comment.restorableUntil === undefined) return null;
  const left = restoreLeft(comment);
  if (left === null) {
    return (
      <p className="pt-6 text-[13px] text-muted-foreground">
        {comment.restorableUntil ? 'Cannot be restored: its 30 days are over.' : 'Cannot be restored: its writer removed it, or a ban purged it.'}
      </p>
    );
  }
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor(left / 3_600_000);
  return (
    <p className="pt-6 text-[13px] text-foreground">
      Restorable until <span className="font-mono text-xs tabular-nums">{stamp(comment.restorableUntil!)}</span>
      <span className="text-muted-foreground"> · {days >= 1 ? `${days} of ${RESTORE_DAYS} days left` : `${Math.max(1, hours)}h left`}</span>
    </p>
  );
}

const PRESSED = 'aria-pressed:bg-accent aria-pressed:text-[hsl(var(--portal-accent))]';

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const SEND_MOD = MAC ? '⌘' : 'Ctrl';
const REPLY_MAX = 2000;

/* Drafts survive walking the list with j and k, for this page's life. */
const drafts = new Map<string, string>();
/* A draft's replyId, made at its first send and kept while an edit brings
   it back, so a changed resend of a reply that did land is refused as a
   collision instead of posting a second one. */
const draftIds = new Map<string, string>();
/* The last `r` press the composer answered, so a remount does not take
   focus again for an old press. */
let lastFocusRequest = 0;

function ReplyBox({ comment, focusRequest, variant, locked }: {
  comment: PortalComment;
  focusRequest: number;
  variant: 'panel' | 'drawer';
  /** The thread refuses readers' replies; the owner's still publish. */
  locked: boolean;
}) {
  const { send: sendReply } = useReply();
  const [text, setText] = React.useState(() => drafts.get(comment.id) ?? '');
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (focusRequest <= lastFocusRequest) return;
    lastFocusRequest = focusRequest;
    ref.current?.focus({ preventScroll: false });
  }, [focusRequest]);

  const update = (value: string): void => {
    setText(value);
    if (value) drafts.set(comment.id, value);
    else drafts.delete(comment.id);
  };

  const send = (): void => {
    const body = text.trim();
    if (!body) return;
    const replyId = draftIds.get(comment.id) ?? crypto.randomUUID();
    draftIds.delete(comment.id);
    update('');
    void sendReply(comment, body, replyId);
  };

  return (
    <div className="pt-2">
      <textarea
        ref={ref}
        rows={2}
        maxLength={REPLY_MAX}
        value={text}
        aria-label={`Reply to ${comment.author} as the owner`}
        placeholder={`Reply to ${comment.author} as the owner`}
        aria-keyshortcuts="R"
        className="block w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-[14px] leading-5 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24"
        onChange={(event) => update(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            send();
          } else if (event.key === 'Escape') {
            // Leave the box, not the comment: the drawer and the page both
            // close on Escape otherwise.
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.blur();
            if (variant === 'panel') {
              document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(comment.id)}"] [data-row-button]`)?.focus({ preventScroll: true });
            }
          }
        }}
      />
      <div className="flex items-center gap-2 pt-2">
        <span className="min-w-0 flex-1 text-muted-foreground text-xs">
          {text.length > REPLY_MAX - 200
            ? `${REPLY_MAX - text.length} characters left`
            : locked
              ? 'Replies are locked for readers; yours still publishes, with the owner badge.'
              : 'Publishes at once, under your name with the owner badge.'}
        </span>
        <Button size="sm" disabled={!text.trim()} aria-keyshortcuts="Meta+Enter Control+Enter" className={cn(SMALL, 'shrink-0')} onClick={send}>
          Reply
          <Kbd className="pointer-coarse:hidden">
            {SEND_MOD}
            <CornerDownLeft aria-hidden className="mx-0! size-3" />
          </Kbd>
        </Button>
      </div>
    </div>
  );
}

function ThreadLine({ time, author, owner, body, state, onOpen, children }: {
  time: string;
  author: string;
  owner: boolean;
  body: string;
  state?: React.ReactNode;
  onOpen?: () => void;
  children?: React.ReactNode;
}) {
  const content = (
    <>
      <span className="flex items-center gap-2">
        <time className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">{stamp(time)}</time>
        <span className="truncate font-medium">{author}</span>
        {owner && <OwnerBadge />}
        {state}
      </span>
      <span className="line-clamp-2 whitespace-pre-wrap break-words text-foreground">{body}</span>
    </>
  );
  return (
    <li className="text-[13px] leading-5">
      {onOpen ? (
        <button type="button" className="flex w-full flex-col gap-1 rounded-sm py-2.5 text-start outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring active:bg-accent" onClick={onOpen}>
          {content}
        </button>
      ) : (
        <div className="flex flex-col gap-1 py-2.5">{content}</div>
      )}
      {children}
    </li>
  );
}

function PendingReply({ reply, onEdit }: { reply: OwnerReply; onEdit: () => void }) {
  const { retry } = useReply();
  return (
    <ThreadLine
      time={reply.sentAt}
      author="You"
      owner
      body={reply.body}
      state={
        reply.state === 'failed' ? (
          <span className="text-[hsl(var(--portal-danger))] text-xs">Not sent</span>
        ) : (
          <span className="text-muted-foreground text-xs">{reply.state === 'sending' ? 'Sending…' : 'Published'}</span>
        )
      }
    >
      {reply.state === 'failed' && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-1.5 text-[13px]">
          <span className="min-w-0 flex-1 text-[hsl(var(--portal-danger))]">{reply.error}</span>
          <span className="flex shrink-0 gap-1">
            {!reply.collided && (
              <Button size="sm" className={SMALL} variant="outline" onClick={() => void retry(reply)}>
                Retry
              </Button>
            )}
            <Button size="sm" className={SMALL} variant={reply.collided ? 'outline' : 'ghost'} onClick={onEdit}>
              Edit
            </Button>
            <Button size="sm" className={SMALL} variant="ghost" onClick={() => discardReply(reply.key)}>
              Discard
            </Button>
          </span>
        </p>
      )}
    </ThreadLine>
  );
}

/** The comment's thread as far as the log has loaded it, oldest first,
    then the owner's replies site-api has not listed yet; and the reply box
    when the comment can be answered. */
function ThreadSection({ comment, thread, focusRequest, variant, locked, onOpenComment }: {
  comment: PortalComment;
  thread: readonly PortalComment[];
  focusRequest: number;
  variant: 'panel' | 'drawer';
  locked: boolean;
  onOpenComment: (id: string) => void;
}) {
  const pending = useOwnerReplies(threadRoot(comment));
  const listed = new Set(thread.map((row) => row.id));
  const unlisted = pending.filter((reply) => !reply.id || !listed.has(reply.id));
  const [boxKey, setBoxKey] = React.useState(0);
  const canReply = comment.status === 'published';
  if (!canReply && thread.length === 0 && unlisted.length === 0) return null;

  // Back into the box with its replyId, unless site-api already refused
  // that id: then the edit goes out as a new reply.
  const edit = (reply: OwnerReply): void => {
    drafts.set(comment.id, reply.body);
    if (reply.collided) draftIds.delete(comment.id);
    else draftIds.set(comment.id, reply.replyId);
    discardReply(reply.key);
    setBoxKey((value) => value + 1);
  };

  return (
    <Section title={thread.length + unlisted.length > 0 ? 'Thread' : 'Reply'}>
      {thread.length + unlisted.length > 0 && (
        <ol className="flex flex-col">
          {thread.map((row) => (
            <ThreadLine
              key={row.id}
              time={row.createdAt}
              author={row.author}
              owner={row.byAuthor === true}
              body={row.body}
              state={row.status !== 'published' ? <StatusMark status={row.status} className="text-xs" /> : undefined}
              onOpen={() => onOpenComment(row.id)}
            />
          ))}
          {unlisted.map((reply) => (
            <PendingReply key={reply.key} reply={reply} onEdit={() => edit(reply)} />
          ))}
        </ol>
      )}
      {canReply ? (
        <ReplyBox key={`${comment.id}:${boxKey}`} comment={comment} focusRequest={focusRequest} variant={variant} locked={locked} />
      ) : (
        <p className="pt-2 text-[13px] text-muted-foreground">Only a published comment can be answered.</p>
      )}
    </Section>
  );
}

export interface CommentDetailProps {
  comment: PortalComment;
  variant: 'panel' | 'drawer';
  position: { index: number; total: number };
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  onAct: (comment: PortalComment, verdict: Verdict, reason?: RejectReason) => void;
  onBan: (comment: PortalComment) => void;
  /** Pin the root to the top of its post, or unpin it (P). */
  onPin: (comment: PortalComment) => void;
  /** Lock or unlock replies under the comment's thread (L). */
  onLock: (comment: PortalComment) => void;
  /** Author of the comment this one replies to, when known. */
  replyTo: string | null;
  /** Whether the reject menu is open for this comment (S opens it). */
  rejectOpen: boolean;
  onRejectOpenChange: (open: boolean) => void;
  /** Bumped by R to put the cursor in the reply box; 0 when not asked. */
  replyFocus: number;
  /** Loaded rows of the same thread, this one left out, oldest first. */
  thread: readonly PortalComment[];
  onOpenComment: (id: string) => void;
}

export function CommentDetail({
  comment,
  variant,
  position,
  onPrev,
  onNext,
  onClose,
  onAct,
  onBan,
  onPin,
  onLock,
  replyTo,
  rejectOpen,
  onRejectOpenChange,
  replyFocus,
  thread,
  onOpenComment,
}: CommentDetailProps) {
  const token = useAnchorToken(comment.id);
  const publicUrl = commentPublicUrl(comment, token);
  const decision = decisionOf(comment);
  const record = React.useMemo(() => fingerprintRecord(comment), [comment]);
  const writer = writerPivot(comment.actor);
  const writerCluster = writer ? comment.actor.cluster[writer.type === 'email' ? 'email' : 'session'] : null;
  const drawer = variant === 'drawer';
  // What a pivot or the post filter keeps open: see PivotAnchor.
  const keep = drawer ? null : comment.id;
  const postParams = new URLSearchParams({ status: 'all', post: comment.postId });
  if (keep) postParams.set('c', keep);
  const postFilter = `/comments?${postParams}`;
  const pinned = Boolean(comment.pinnedAt);
  // A reply shows its thread's lock when the log has its root; an unloaded
  // root reads as unlocked, and the lock's answer corrects it.
  const locked = Boolean(lockHolder(comment, thread)?.lockedAt);
  const pinnable = pinned || canPin(comment);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [comment.id]);

  const more = (
    <Menu>
      <MenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label="More actions" className={drawer ? 'w-11 flex-none!' : undefined} />}>
        <MoreHorizontal />
      </MenuTrigger>
      <MenuPopup align="end" className={drawer ? 'pointer-coarse:[&_[role^=menuitem]]:min-h-11' : undefined}>
        {drawer && (
          <>
            <MenuItem onClick={() => onBan(comment)}>
              <Ban />
              Ban…
            </MenuItem>
            <MenuSeparator />
            {pinnable && (
              <MenuItem onClick={() => onPin(comment)}>
                {pinned ? <PinOff /> : <Pin />}
                {pinned ? 'Unpin' : 'Pin to the top of the post'}
              </MenuItem>
            )}
            <MenuItem onClick={() => onLock(comment)}>
              {locked ? <LockOpen /> : <Lock />}
              {locked ? 'Unlock replies' : 'Lock replies'}
            </MenuItem>
            <MenuSeparator />
          </>
        )}
        <MenuItem onClick={() => copy(new URL(href(`/comments?c=${comment.id}`), location.origin).toString(), 'Portal link')}>
          <Link2 />
          Copy portal link
        </MenuItem>
        {publicUrl && (
          <MenuItem render={<a href={publicUrl} target="_blank" rel="noreferrer" />}>
            <ExternalLink />
            Open on the site
          </MenuItem>
        )}
        <MenuItem onClick={() => navigate(postFilter)}>
          <Filter />
          Show every comment on this post
        </MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => copy(comment.id, 'Comment id')}>
          <Copy />
          Copy comment id
        </MenuItem>
      </MenuPopup>
    </Menu>
  );

  const actions = (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 px-4',
        // A phone fits three acts and ⋯ by their words alone; Ban is in ⋯.
        drawer
          ? 'border-t py-2.5 pb-[max(env(safe-area-inset-bottom),0.625rem)] [&_button]:h-11 [&_button]:flex-1 max-sm:[&>button:not(:last-child)>svg]:hidden'
          : 'h-11 border-b',
      )}
    >
      {canApply(comment, 'approve') && (
        <Button size="sm" className={SMALL} aria-keyshortcuts="A" onClick={() => onAct(comment, 'approve')}>
          <Check />
          Approve
          <Kbd className="pointer-coarse:hidden">A</Kbd>
        </Button>
      )}
      {/* Only the first act shows its key: five keys do not fit 440px, and
          the rest are in each button's title and the shortcuts sheet (?). */}
      {canApply(comment, 'hide') && (
        <Button size="sm" className={SMALL} variant="outline" aria-keyshortcuts="U" title="Unpublish (U)" onClick={() => onAct(comment, 'hide')}>
          <EyeOff />
          Unpublish
        </Button>
      )}
      {canApply(comment, 'reject') && (
        <RejectMenu
          open={rejectOpen}
          onOpenChange={onRejectOpenChange}
          onPick={(reason) => onAct(comment, 'reject', reason)}
          suggested={comment.moderationReason}
          trigger={<Button size="sm" className={SMALL} variant="outline" aria-keyshortcuts="S" title="Reject with a reason (S)" data-reject-trigger />}
        >
          <XCircle />
          Reject…
        </RejectMenu>
      )}
      {canApply(comment, 'delete') && (
        <Button size="sm" className={SMALL} variant="destructive-outline" aria-keyshortcuts="D" title="Delete (D)" onClick={() => onAct(comment, 'delete')}>
          <Trash2 />
          Delete
        </Button>
      )}
      {canApply(comment, 'restore') && (
        <Button size="sm" className={SMALL} variant="outline" title="Restore to where it was before the delete" onClick={() => onAct(comment, 'restore')}>
          <RotateCcw />
          Restore
        </Button>
      )}
      {/* The icon acts sit apart, on the right, and hold their place: Ban is
          about the writer, pin and lock about the post. At 440px the words
          and the icons fill the bar exactly. */}
      {!drawer && (
        <span className="ms-auto flex shrink-0 items-center gap-0.5">
          <Button size="icon-sm" variant="ghost" aria-keyshortcuts="B" aria-label="Ban… (B)" title="Ban… (B)" onClick={() => onBan(comment)}>
            <Ban />
          </Button>
          {/* Toggles: the name stays, the pressed state and the title say
              which way the next press goes. */}
          {pinnable && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-keyshortcuts="P"
              aria-pressed={pinned}
              aria-label="Pin (P)"
              title={pinned ? 'Unpin (P)' : 'Pin to the top of the post (P)'}
              className={PRESSED}
              onClick={() => onPin(comment)}
            >
              <Pin />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-keyshortcuts="L"
            aria-pressed={locked}
            aria-label="Lock replies (L)"
            title={locked ? 'Unlock replies (L)' : 'Lock replies (L)'}
            className={PRESSED}
            onClick={() => onLock(comment)}
          >
            <Lock />
          </Button>
          {more}
        </span>
      )}
      {drawer && more}
    </div>
  );

  return (
    <article aria-labelledby={`detail-${comment.id}`} className="flex h-full min-h-0 flex-col bg-background">
      {/* The icon buttons grow to 44px on touch rather than take a wider
          hit area: the arrows sit side by side, and theirs would overlap. */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        {drawer && (
          <Button size="icon-sm" variant="ghost" aria-label="Close" className="-ms-2 pointer-coarse:-ms-3.5 pointer-coarse:size-11" onClick={onClose}>
            <X />
          </Button>
        )}
        <h2 id={`detail-${comment.id}`} className="flex min-w-0 items-center gap-1 font-medium text-sm">
          <span className="truncate">{comment.author}</span>
          {comment.verified && <BadgeCheck aria-label="Verified" className="size-3.5 shrink-0 text-muted-foreground" />}
          {comment.byAuthor === true && <OwnerBadge />}
        </h2>
        <StatusMark status={comment.status} className="shrink-0 text-[13px]" />
        <ControlMarks pinned={pinned} locked={locked} className="me-0 shrink-0 text-[13px]" />
        {/* The marks take the time's room: at 440px both would squeeze the
            name to a few letters, and the row and History keep the time. */}
        {!pinned && !locked && (
          <time
            dateTime={comment.createdAt}
            title={absoluteTime(comment.createdAt)}
            className={cn('shrink-0 font-mono text-muted-foreground text-xs tabular-nums', drawer && 'max-sm:hidden')}
          >
            {fullStamp(comment.createdAt).slice(0, 16)}
          </time>
        )}
        <span className="ms-auto flex shrink-0 items-center">
          <span className="me-1 min-w-[4.5ch] text-end text-muted-foreground text-xs tabular-nums">
            {position.index + 1}/{position.total}
          </span>
          <Button size="icon-sm" variant="ghost" aria-label="Previous comment (K)" className="pointer-coarse:size-11" disabled={!onPrev} onClick={onPrev ?? undefined}>
            <ChevronUp />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Next comment (J)" className="pointer-coarse:size-11" disabled={!onNext} onClick={onNext ?? undefined}>
            <ChevronDown />
          </Button>
          {!drawer && (
            <Button size="icon-sm" variant="ghost" aria-label="Close (Esc)" className="pointer-coarse:size-11" onClick={onClose}>
              <X />
            </Button>
          )}
        </span>
      </header>

      {!drawer && actions}

      <div ref={scrollRef} className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pt-4 pb-8">
        {comment.parentId && (
          <p className="pb-1 text-[13px] text-muted-foreground">Reply to {replyTo ?? 'another comment'}</p>
        )}
        <p className="whitespace-pre-wrap break-words text-[15px] text-foreground leading-relaxed">{comment.body}</p>
        <p className="pt-2 text-[13px] text-muted-foreground">
          On{' '}
          <a
            href={href(postFilter)}
            data-astro-prefetch="false"
            className="text-foreground underline decoration-[hsl(var(--muted-foreground))] underline-offset-[3px] hover:decoration-foreground"
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              navigate(postFilter);
            }}
          >
            {comment.postTitle ?? comment.postSlug ?? comment.postId}
          </a>
          {publicUrl && (
            <>
              {' · '}
              <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-foreground underline decoration-[hsl(var(--muted-foreground))] underline-offset-[3px] hover:decoration-foreground">
                open on site
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </>
          )}
          {comment.editedAt && ` · edited ${fullStamp(comment.editedAt).slice(0, 16)}`}
        </p>
        {decision && (
          <div className="pt-6 text-[13px]">
            <p className="text-foreground">{decision.summary}</p>
            {decision.detail && <p className="text-muted-foreground">{decision.detail}</p>}
          </div>
        )}
        <RestoreLine comment={comment} />
        <PostModeLine comment={comment} />

        <ThreadSection comment={comment} thread={thread} focusRequest={replyFocus} variant={variant} locked={locked} onOpenComment={onOpenComment} />

        <Section title="Writer">
          <dl>
            <Row row={{ id: 'name', label: 'Name', value: comment.author, pivot: null, count: null, held: null, banned: false, mono: false }} keep={keep} />
            <Row row={{ id: 'identity', label: 'Identity', value: identityDetail(comment.actor), pivot: null, count: null, held: null, banned: false, mono: false }} keep={keep} />
            {comment.actor.readerId && (
              <Row
                row={{
                  id: 'reader',
                  label: 'Reader id',
                  value: comment.actor.readerId,
                  pivot: null,
                  count: null,
                  held: null,
                  banned: false,
                  mono: true,
                }}
                keep={keep}
              />
            )}
            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 py-2 text-[13px] leading-5 last:pb-0">
              <dt className="text-muted-foreground">Other comments</dt>
              <dd>
                {writer && writerCluster && writerCluster.comments > 0 ? (
                  <PivotAnchor pivot={writer} keep={keep} className="tabular-nums">
                    {writerCluster.comments} more by this {writer.type === 'email' ? 'address' : 'session'}
                    {writerCluster.held > 0 ? `, ${writerCluster.held} held` : ''}
                  </PivotAnchor>
                ) : (
                  <span className="text-muted-foreground">
                    {writer ? `None from this ${writer.type === 'email' ? 'address' : 'session'} in 90 days` : 'Not recorded'}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </Section>

        {record.map((group) => (
          <Section key={group.title} title={group.title}>
            <dl>
              {group.rows.map((row) => (
                <Row key={row.id} row={row} keep={keep} />
              ))}
            </dl>
          </Section>
        ))}

        <Section title="History">
          <History commentId={comment.id} />
        </Section>
      </div>

      {drawer && actions}
    </article>
  );
}
