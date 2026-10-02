import * as React from 'react';
import type { AdminOwnerMessage, MessageState } from '@bunizao/contracts';
import { cn } from '@/lib/utils';
import { CELLS, LINE, SPACED } from '../activity/table';
import { stamp } from '../comments/model';
import { StatusDot, type Tone } from '../moderation/ui';

/* One message, one line (a table row from 768px) or two (a list item
   below). The whole row opens it; an unread one reads in full weight with
   the accent dot. */

export const STATE_LABELS: Record<MessageState, string> = {
  new: 'New',
  read: 'Read',
  replied: 'Replied',
  archived: 'Archived',
  spam: 'Spam',
};

export const STATE_TONE: Record<MessageState, Tone> = {
  new: 'accent',
  read: 'neutral',
  replied: 'neutral',
  archived: 'neutral',
  spam: 'neutral',
};

/** Columns, narrowest container first. Hidden cells take no track. */
export const MSG_COLUMNS =
  '[--msg-cols:9rem_minmax(0,1fr)_6.5rem_7rem] ' +
  '@min-[52rem]/log:[--msg-cols:11rem_minmax(0,1fr)_7rem_4.75rem_7rem]';
export const MSG_GRID = 'grid grid-cols-(--msg-cols)';
export const MSG_MID = 'hidden @min-[52rem]/log:block';

/** The first line of a message, for a one-line row. */
export function firstLine(body: string): string {
  return body.replace(/\s+/g, ' ').trim();
}

export interface MessageRowProps {
  message: AdminOwnerMessage;
  layout: 'table' | 'stack';
  active: boolean;
  tabbable: boolean;
  onOpen: (message: AdminOwnerMessage) => void;
  onIntent: (id: string) => void;
}

export const MessageRow = React.memo(function MessageRow({ message, layout, active, tabbable, onOpen, onIntent }: MessageRowProps) {
  const unread = message.state === 'new';
  const open = (
    <button
      type="button"
      tabIndex={tabbable ? 0 : -1}
      data-row-button
      className="absolute inset-0 z-0 cursor-default outline-none transition-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-accent"
      aria-label={`${unread ? 'Unread message' : 'Message'} from ${message.displayName}, ${STATE_LABELS[message.state]}`}
      aria-current={active ? 'true' : undefined}
      onClick={() => onOpen(message)}
      onPointerEnter={() => onIntent(message.id)}
      onFocus={() => onIntent(message.id)}
    />
  );

  const rowClass = cn(
    'relative bg-background [content-visibility:auto]',
    SPACED,
    'data-active:bg-accent',
    'data-active:before:absolute data-active:before:inset-y-0 data-active:before:start-0 data-active:before:z-20 data-active:before:w-0.5 data-active:before:bg-[hsl(var(--portal-accent))]',
  );
  const name = (
    <span className={cn('truncate', unread ? 'font-medium text-foreground' : 'text-foreground/85')}>{message.displayName}</span>
  );
  const status = <StatusDot tone={STATE_TONE[message.state]}>{STATE_LABELS[message.state]}</StatusDot>;

  if (layout === 'stack') {
    return (
      <div
        role="listitem"
        data-row-id={message.id}
        data-active={active || undefined}
        className={cn(rowClass, 'px-3 py-3 [contain-intrinsic-size:auto_64px]')}
      >
        {open}
        <div className="pointer-events-none relative text-[13px] leading-5">
          <div className="flex items-center gap-2">
            <span className="flex min-w-0 flex-1">{name}</span>
            <span className="shrink-0 text-xs">{status}</span>
            <time className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">{stamp(message.createdAt)}</time>
          </div>
          <p className={cn('mt-1 truncate text-xs', unread ? 'text-foreground' : 'text-muted-foreground')}>{firstLine(message.body)}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="row"
      data-row-id={message.id}
      data-active={active || undefined}
      className={cn(rowClass, MSG_GRID, LINE, CELLS, 'items-center text-[13px] leading-5 [contain-intrinsic-size:auto_44px]')}
    >
      {/* Not positioned, so the open button spans the whole row. */}
      <div role="cell" className="flex! items-center">
        {open}
        <span className="pointer-events-none relative flex min-w-0">{name}</span>
      </div>
      <div role="cell" className={cn('pointer-events-none relative', unread ? 'text-foreground' : 'text-muted-foreground')}>
        {firstLine(message.body)}
      </div>
      <div role="cell" className="pointer-events-none relative">{status}</div>
      <div role="cell" className={cn('pointer-events-none relative text-muted-foreground', MSG_MID)}>{message.country ?? ''}</div>
      <div role="cell" className="pointer-events-none relative font-mono text-muted-foreground text-xs tabular-nums">
        <time dateTime={message.createdAt}>{stamp(message.createdAt)}</time>
      </div>
    </div>
  );
});
