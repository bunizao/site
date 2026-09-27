import * as React from 'react';
import { BadgeCheck, CornerDownRight, MailQuestion, Users } from 'lucide-react';
import { Checkbox } from '@/components/coss/checkbox';
import { cn } from '@/lib/utils';
import { initials, seedHue } from '@/features/comments/identity';
import type { PortalComment } from '@/features/admin/server/portal-client';
import { STATUS_LABELS, type StatusFilter } from './data';
import { identityStatus, isAwaitingEmail, reasonLabel, relativeTime } from './model';

export function WriterAvatar({ name, className }: { name: string; className?: string }) {
  const hue = seedHue(name);
  return (
    <span
      aria-hidden
      className={cn('inline-flex size-8 shrink-0 select-none items-center justify-center rounded-full font-medium text-xs', className)}
      style={{ background: `hsl(${hue} 32% 22%)`, color: `hsl(${hue} 60% 82%)` }}
    >
      {initials(name) || '?'}
    </span>
  );
}

const STATUS_DOT: Record<string, string> = {
  held: 'bg-warning',
  published: 'bg-success',
  rejected: 'bg-destructive',
  deleted: 'bg-muted-foreground',
};

export interface CommentRowProps {
  comment: PortalComment;
  filter: StatusFilter;
  active: boolean;
  checked: boolean;
  selecting: boolean;
  onOpen: (comment: PortalComment) => void;
  onCheck: (comment: PortalComment, checked: boolean, range: boolean) => void;
}

export const CommentRow = React.memo(function CommentRow({
  comment,
  filter,
  active,
  checked,
  selecting,
  onOpen,
  onCheck,
}: CommentRowProps) {
  const reason = reasonLabel(comment.moderationReason);
  const awaiting = isAwaitingEmail(comment);
  const verified = identityStatus(comment.actor) === 'verified';
  const others = comment.actor.cluster.session?.comments ?? 0;
  const shiftRef = React.useRef(false);

  return (
    <li
      id={`row-${comment.id}`}
      data-active={active || undefined}
      data-checked={checked || undefined}
      className={cn(
        'group/row relative flex gap-3 border-b border-border/60 px-4 py-3 transition-colors',
        'hover:bg-accent/40 data-checked:bg-info/8 data-active:bg-accent',
        'data-active:before:absolute data-active:before:inset-y-0 data-active:before:left-0 data-active:before:w-0.5 data-active:before:bg-ring',
      )}
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-label={`Open comment by ${comment.author}`}
        aria-current={active ? 'true' : undefined}
        onClick={() => onOpen(comment)}
      />
      <div className="relative z-10 flex w-8 shrink-0 flex-col items-center pt-0.5">
        <WriterAvatar
          name={comment.author}
          className={cn(selecting ? 'hidden' : 'group-hover/row:pointer-fine:hidden')}
        />
        <span
          className={cn('size-8 items-center justify-center', selecting ? 'flex' : 'hidden group-hover/row:pointer-fine:flex')}
          onPointerDownCapture={(event) => {
            shiftRef.current = event.shiftKey;
          }}
        >
          <Checkbox
            checked={checked}
            aria-label={`Select comment by ${comment.author}`}
            onCheckedChange={(value) => {
              onCheck(comment, value === true, shiftRef.current);
              shiftRef.current = false;
            }}
          />
        </span>
      </div>
      <div className="pointer-events-none relative z-0 min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm">
          {filter === 'all' && (
            <>
              <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[comment.status])} title={STATUS_LABELS[comment.status]} />
              <span className="sr-only">{STATUS_LABELS[comment.status]}:</span>
            </>
          )}
          <span className="truncate font-medium text-foreground">{comment.author}</span>
          {verified && <BadgeCheck aria-label="Verified" className="size-3.5 shrink-0 text-success" />}
          {comment.parentId && <CornerDownRight aria-label="Reply" className="size-3.5 shrink-0 text-muted-foreground" />}
          <time
            dateTime={comment.createdAt}
            className="ms-auto shrink-0 text-muted-foreground text-xs tabular-nums"
          >
            {relativeTime(comment.createdAt)}
          </time>
        </div>
        <p className="mt-0.5 line-clamp-2 break-words text-muted-foreground text-sm leading-snug">{comment.body}</p>
        <div className="mt-1.5 flex min-w-0 items-center gap-2 text-xs">
          <span className="min-w-0 truncate text-muted-foreground/80">{comment.postTitle ?? comment.postSlug ?? comment.postId}</span>
          {awaiting ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-info/16 px-1.5 py-px text-info-foreground">
              <MailQuestion className="size-3" aria-hidden />
              Awaiting email
            </span>
          ) : reason ? (
            <span
              className={cn(
                'shrink-0 rounded-sm px-1.5 py-px',
                comment.status === 'rejected' ? 'bg-destructive/16 text-destructive-foreground' : 'bg-warning/16 text-warning-foreground',
              )}
            >
              {reason}
            </span>
          ) : null}
          {others > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground" title={`${others} other comments from this session in 90 days`}>
              <Users className="size-3" aria-hidden />
              {others}
            </span>
          )}
        </div>
      </div>
    </li>
  );
});
