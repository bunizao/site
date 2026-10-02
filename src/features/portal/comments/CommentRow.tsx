import * as React from 'react';
import { BadgeCheck, Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortalComment, PortalCommentStatus } from '@/features/admin/server/portal-client';
import { CELLS, LINE, SPACED } from '../activity/table';
import { href } from '../app/router';
import { StatusDot, TOUCH_TARGET } from '../moderation/ui';
import { STATUS_LABELS } from './data';
import {
  deviceShort,
  fingerprintPivot,
  ipPivot,
  locationShort,
  pivotHref,
  shortHandle,
  stamp,
  writerPivot,
  type Pivot,
} from './model';
import { useSwipe, type SwipeDirection } from './swipe';

/* One comment, one line (a table row at 1280px and up) or two (a list item
   below). No avatars, no chips: time, status, who, what, and the keys that
   say where it came from. The writer, fingerprint and IP values are links
   that pivot the same screen; anywhere else on the row opens the detail. */

const STATUS_DOT: Record<PortalCommentStatus, string> = {
  held: 'bg-warning',
  published: 'bg-muted-foreground',
  rejected: 'bg-muted-foreground',
  deleted: 'bg-muted-foreground',
};

export function StatusMark({ status, className }: { status: PortalCommentStatus; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[status])} />
      <span className={cn('truncate', status === 'held' ? 'text-foreground' : 'text-muted-foreground')}>
        {STATUS_LABELS[status]}
      </span>
    </span>
  );
}

/** In place of the status after an act site-api left this row out of:
    the word says so, the title says why. */
function FailedMark({ line, className }: { line: string; className?: string }) {
  return (
    <span title={line} className={cn('inline-flex min-w-0 items-center gap-1.5 text-[hsl(var(--portal-danger))]', className)}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[hsl(var(--portal-danger))]" />
      <span className="truncate">Not changed</span>
      <span className="sr-only">: {line}</span>
    </span>
  );
}

/** The owner's pin and reply lock, a dot and a word each, in front of the
    comment's text: the row gains no column and stays one line. */
export function ControlMarks({ pinned, locked, className }: { pinned: boolean; locked: boolean; className?: string }) {
  if (!pinned && !locked) return null;
  return (
    <span className={cn('me-2 inline-flex items-center gap-2 text-muted-foreground text-xs', className)}>
      {pinned && <StatusDot tone="neutral">Pinned</StatusDot>}
      {locked && <StatusDot tone="neutral">Locked</StatusDot>}
    </span>
  );
}

/** The marks as words for a row's accessible name. */
export function controlWords(comment: Pick<PortalComment, 'pinnedAt' | 'lockedAt'>): string {
  return `${comment.pinnedAt ? ', pinned' : ''}${comment.lockedAt ? ', replies locked' : ''}`;
}

/** Who a reply answers, in words: "to Léa", or "reply" when the parent is
    not loaded. */
export function replyWords(replyTo: string | null): string {
  return replyTo ? `to ${replyTo}` : 'reply';
}

export function OwnerBadge({ className }: { className?: string }) {
  return (
    <span className={cn('shrink-0 rounded-sm border px-1 font-medium text-[11px] text-muted-foreground leading-4', className)}>
      Owner
    </span>
  );
}

/** Columns, narrowest container first. Hidden cells take no track.
    Location and device wait for a 1280px log, which a 1440px screen with
    the sidebar open is not: nine columns there left the comment a third of
    the row and read as a spreadsheet. The pane has both. */
export const LOG_COLUMNS =
  '[--log-cols:6.75rem_6.5rem_8.5rem_minmax(0,1fr)_5.5rem] ' +
  '@min-[58rem]/log:[--log-cols:6.75rem_6.5rem_8.5rem_minmax(0,1fr)_9rem_5.5rem_8rem] ' +
  '@min-[80rem]/log:[--log-cols:6.75rem_6.5rem_8.5rem_minmax(0,1fr)_9rem_5.5rem_8rem_7rem_8rem]';

/* While a selection is on, the screen marks the log `group/sel` with
   data-selecting, and the checkbox column comes and goes by CSS alone:
   starting or ending a selection re-renders no row. */
export const LOG_GRID = 'grid grid-cols-(--log-cols) group-data-selecting/sel:grid-cols-[2.5rem_var(--log-cols)]';
export const WHILE_SELECTING = 'hidden group-data-selecting/sel:flex';

export const MID = 'hidden @min-[58rem]/log:block';
export const WIDE = 'hidden @min-[80rem]/log:block';

export interface CommentRowProps {
  comment: PortalComment;
  layout: 'table' | 'stack';
  active: boolean;
  checked: boolean;
  /** Why the last act left this row unchanged, while it stays marked. */
  failed: string | null;
  /** Author of the comment this one replies to, when known. */
  replyTo: string | null;
  swipe: boolean;
  tabbable: boolean;
  onOpen: (comment: PortalComment) => void;
  onCheck: (comment: PortalComment, checked: boolean, range: boolean) => void;
  onPivot: (event: React.MouseEvent<HTMLAnchorElement>, comment: PortalComment, pivot: Pivot) => void;
  onSwipe: (comment: PortalComment, direction: SwipeDirection) => void;
  onLongPress: (comment: PortalComment) => void;
}

function PivotLink({
  comment,
  pivot,
  label,
  className,
  children,
  onPivot,
}: {
  comment: PortalComment;
  pivot: Pivot | null;
  label: string;
  className?: string;
  children: React.ReactNode;
  onPivot: CommentRowProps['onPivot'];
}) {
  if (!pivot) return <span className={className}>{children}</span>;
  return (
    <a
      href={href(pivotHref(pivot.type, pivot.value))}
      data-astro-prefetch="false"
      tabIndex={-1}
      title={`All comments with ${label} ${pivot.value}`}
      className={cn(
        'relative z-10 min-w-0 truncate underline-offset-[3px] outline-none hover:underline active:text-[hsl(var(--portal-accent))]',
        className,
      )}
      onClick={(event) => onPivot(event, comment, pivot)}
    >
      {children}
    </a>
  );
}

function SwipeLayers({ canApprove }: { canApprove: boolean }) {
  return (
    <>
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 hidden items-center gap-2 ps-4 font-medium text-sm group-data-[swipe=right]/row:flex',
          canApprove
            ? 'bg-[hsl(var(--success)/0.22)] text-foreground group-data-armed/row:bg-success group-data-armed/row:text-[hsl(var(--background))]'
            : 'bg-muted text-muted-foreground',
        )}
      >
        <Check className="size-4" />
        {canApprove ? 'Approve' : 'Already published'}
      </div>
      <div
        aria-hidden
        className="absolute inset-0 hidden items-center justify-end gap-2 bg-[hsl(var(--destructive)/0.22)] pe-4 font-medium text-foreground text-sm group-data-[swipe=left]/row:flex group-data-armed/row:bg-destructive group-data-armed/row:text-destructive-foreground"
      >
        Delete
        <Trash2 className="size-4" />
      </div>
    </>
  );
}

export const CommentRow = React.memo(function CommentRow({
  comment,
  layout,
  active,
  checked,
  failed,
  replyTo,
  swipe,
  tabbable,
  onOpen,
  onCheck,
  onPivot,
  onSwipe,
  onLongPress,
}: CommentRowProps) {
  const actor = comment.actor;
  const canApprove = comment.status === 'held' || comment.status === 'rejected';
  const canDelete = comment.status !== 'deleted';
  const gesture = useSwipe({
    allow: { right: canApprove, left: canDelete },
    onSwipe: (direction) => onSwipe(comment, direction),
    onLongPress: () => onLongPress(comment),
  });
  const writer = writerPivot(actor);
  const fingerprint = fingerprintPivot(actor);
  const ip = ipPivot(actor);
  const time = stamp(comment.createdAt);
  const deleted = comment.status === 'deleted';
  // site-api's rule for the public owner badge, so the row marks exactly
  // what readers see marked.
  const owner = comment.byAuthor === true;

  const open = (
    <button
      type="button"
      tabIndex={tabbable ? 0 : -1}
      data-row-button
      className="absolute inset-0 z-0 cursor-default outline-none transition-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-accent"
      aria-label={`${comment.author}, ${STATUS_LABELS[comment.status]}${controlWords(comment)}, ${time}`}
      aria-current={active ? 'true' : undefined}
      onClick={() => onOpen(comment)}
    />
  );

  const box = (
    <input
      type="checkbox"
      checked={checked}
      aria-label={`Select comment by ${comment.author}`}
      className="relative z-10 size-4 cursor-pointer accent-[hsl(var(--portal-accent))]"
      onChange={() => {}}
      onClick={(event) => onCheck(comment, event.currentTarget.checked, event.shiftKey)}
    />
  );

  const rowClass = cn(
    'group/row relative scroll-mt-9 overflow-hidden bg-background',
    SPACED,
    'data-active:before:absolute data-active:before:inset-y-0 data-active:before:start-0 data-active:before:z-20 data-active:before:w-0.5 data-active:before:bg-[hsl(var(--portal-accent))]',
    swipe && 'touch-pan-y select-none [-webkit-touch-callout:none]',
  );
  const slideClass = 'relative bg-background group-data-active/row:bg-accent group-data-checked/row:bg-[hsl(var(--portal-accent)/0.12)]';

  if (layout === 'stack') {
    return (
      <div
        role="listitem"
        id={`row-${comment.id}`}
        data-row-id={comment.id}
        data-active={active || undefined}
        data-checked={checked || undefined}
        className={rowClass}
        {...(swipe ? gesture.rowProps : {})}
      >
        {swipe && <SwipeLayers canApprove={canApprove} />}
        <div ref={gesture.slideRef} className={cn(slideClass, 'flex gap-3 px-3 py-3')}>
          {open}
          <label className={cn(TOUCH_TARGET, 'z-10 items-center', WHILE_SELECTING)}>{box}</label>
          <div className="pointer-events-none relative min-w-0 flex-1 text-sm">
            <div className="flex items-center gap-2 leading-5">
              <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">{time}</span>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="max-w-full shrink-0 truncate font-medium text-foreground">{comment.author}</span>
                {comment.verified && <BadgeCheck aria-label="Verified" className="size-3.5 shrink-0 text-muted-foreground" />}
                {owner && <OwnerBadge />}
                {comment.parentId && <span className="truncate text-muted-foreground">{replyWords(replyTo)}</span>}
              </span>
              {failed ? (
                <FailedMark line={failed} className="ms-auto shrink-0 text-xs" />
              ) : (
                <StatusMark status={comment.status} className="ms-auto shrink-0 text-xs" />
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 leading-5">
              <span className={cn('min-w-0 flex-1 truncate', deleted ? 'text-muted-foreground' : 'text-foreground')}>
                <ControlMarks pinned={Boolean(comment.pinnedAt)} locked={Boolean(comment.lockedAt)} />
                {comment.body}
              </span>
              {fingerprint && (
                <span className="shrink-0 font-mono text-muted-foreground text-xs" title={`${fingerprint.label} ${fingerprint.value}`}>
                  {shortHandle(fingerprint.value)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="row"
      id={`row-${comment.id}`}
      data-row-id={comment.id}
      data-active={active || undefined}
      data-checked={checked || undefined}
      className={rowClass}
      {...(swipe ? gesture.rowProps : {})}
    >
      {swipe && <SwipeLayers canApprove={canApprove} />}
      <div
        ref={gesture.slideRef}
        className={cn(slideClass, LOG_GRID, LINE, CELLS, 'items-center text-[13px] leading-5')}
      >
        <div role="cell" className={cn('items-center justify-center', WHILE_SELECTING)}>
          <label className={cn(TOUCH_TARGET, 'z-10 flex')}>{box}</label>
        </div>
        <div role="cell" className="font-mono text-muted-foreground text-xs tabular-nums">
          {open}
          {/* Hovering the time swaps it for a checkbox; the rest of the row
              keeps opening the comment. Touch selects by long press instead.
              While selecting, the first column holds the checkbox and the
              time is plain text the row's button reaches through. */}
          <label className="group/time relative z-10 -mx-3 grid h-11 cursor-pointer items-center px-3 [grid-template-areas:'x'] pointer-coarse:pointer-events-none group-data-selecting/sel:pointer-events-none">
            <time dateTime={comment.createdAt} className="[grid-area:x] pointer-fine:group-hover/time:invisible">
              {time}
            </time>
            <span className="invisible flex items-center [grid-area:x] pointer-fine:group-hover/time:visible">{box}</span>
          </label>
        </div>
        <div role="cell" className={cn('relative', !failed && 'pointer-events-none')}>
          {failed ? <FailedMark line={failed} /> : <StatusMark status={comment.status} />}
        </div>
        <div role="cell" className="flex items-center gap-1.5">
          <PivotLink comment={comment} pivot={writer} label={writer?.type === 'email' ? 'email' : 'session'} onPivot={onPivot} className="max-w-full shrink-0 truncate font-medium text-foreground">
            {comment.author}
          </PivotLink>
          {comment.verified && <BadgeCheck aria-label="Verified" className="pointer-events-none relative size-3.5 shrink-0 text-muted-foreground" />}
          {owner && <OwnerBadge className="pointer-events-none relative" />}
          {comment.parentId && (
            <span className="pointer-events-none relative min-w-0 truncate text-muted-foreground">{replyWords(replyTo)}</span>
          )}
        </div>
        <div role="cell" className={cn('pointer-events-none relative', deleted ? 'text-muted-foreground' : 'text-foreground')}>
          <ControlMarks pinned={Boolean(comment.pinnedAt)} locked={Boolean(comment.lockedAt)} />
          {comment.body}
        </div>
        <div role="cell" className={cn('pointer-events-none relative text-muted-foreground', MID)} title={comment.postTitle ?? comment.postId}>
          {comment.postTitle ?? comment.postSlug ?? comment.postId}
        </div>
        <div role="cell" className="font-mono text-muted-foreground text-xs">
          <PivotLink comment={comment} pivot={fingerprint} label={fingerprint?.label.toLowerCase() ?? 'fingerprint'} onPivot={onPivot}>
            {fingerprint ? shortHandle(fingerprint.value) : ''}
          </PivotLink>
        </div>
        <div role="cell" className={cn('font-mono text-muted-foreground text-xs', MID)}>
          <PivotLink comment={comment} pivot={ip} label="IP address" onPivot={onPivot}>
            {actor.ip ?? (actor.keys.ip ? shortHandle(actor.keys.ip) : '')}
          </PivotLink>
        </div>
        <div role="cell" className={cn('pointer-events-none relative text-muted-foreground', WIDE)}>
          {locationShort(actor)}
        </div>
        <div role="cell" className={cn('pointer-events-none relative text-muted-foreground', WIDE)}>
          {deviceShort(actor)}
        </div>
      </div>
    </div>
  );
});
