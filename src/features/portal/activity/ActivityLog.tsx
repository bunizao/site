import * as React from 'react';
import type { PortalActivityEntry } from '@/features/admin/server/portal-client';
import { cn } from '@/lib/utils';
import { Link } from '../app/router';
import { absoluteTime, relativeTime, shortHandle } from '../comments/model';
import { clockTime, localDayKey, localDayLabel } from '../analytics/format';
import { eventWord, entryTarget, targetTitle, whoLabel } from './model';
import { BLEED, Dot, GUTTER, HEAD, LIST, PRESSABLE } from './table';

/* The activity log as a table: time, event, who, post, reader. It lays out
   by the width its `@container` gets: one line per record from 42rem, and
   below that two lines rather than five squeezed columns. The whole row is
   one click to its target; the reader is a second, separate target on top.

   Two text styles, foreground and muted, and at most one symbol a line:
   the emoji of a like, or the dot of a held comment, the one state here
   that needs you. The event word says whether a like was on the post or on
   a comment; every other event is about a comment. */

const GRID = cn(
  'grid items-center gap-x-3 @2xl:gap-x-4 @5xl:gap-x-6',
  "grid-cols-[auto_minmax(0,1fr)_auto] [grid-template-areas:'event_who_time'_'target_target_reader']",
  "@2xl:grid-cols-[3rem_10rem_minmax(0,8rem)_minmax(0,1fr)_minmax(0,7.5rem)] @2xl:[grid-template-areas:'time_event_who_target_reader']",
  '@5xl:grid-cols-[3rem_10.5rem_minmax(0,10rem)_minmax(0,1fr)_minmax(0,9rem)]',
);

const MUTED = 'text-[13px] text-muted-foreground';

export function ActivityHeader({ sticky }: { sticky?: boolean }) {
  return (
    <div aria-hidden className={cn(GRID, GUTTER, HEAD, 'hidden bg-background @2xl:grid', sticky && 'sticky top-0 z-10')}>
      <span className="[grid-area:time]">Time</span>
      {/* Level with the word, past the dot's slot. */}
      <span className="ps-4 [grid-area:event]">Event</span>
      <span className="[grid-area:who]">Who</span>
      <span className="[grid-area:target]">Post</span>
      <span className="text-end [grid-area:reader]">Reader</span>
    </div>
  );
}

export function ActivityRow({
  entry,
  time = 'clock',
  onReader,
}: {
  entry: PortalActivityEntry;
  time?: 'clock' | 'relative';
  onReader?: (readerId: string) => void;
}) {
  const event = eventWord(entry);
  const target = entryTarget(entry);
  const title = targetTitle(entry);
  const linkClass =
    'min-w-0 truncate outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';

  return (
    <li className={cn(GRID, BLEED, 'relative gap-y-1 py-3 text-sm @2xl:h-11 @2xl:py-0', target && PRESSABLE)}>
      <time
        dateTime={entry.createdAt}
        title={absoluteTime(entry.createdAt)}
        className={cn(MUTED, 'whitespace-nowrap text-end tabular-nums [grid-area:time] @2xl:text-start')}
      >
        {/* "now" rather than "just now" keeps the column at clock width. */}
        {time === 'clock' ? clockTime(entry.createdAt) : relativeTime(entry.createdAt).replace('just now', 'now')}
      </time>
      <span className="flex min-w-0 items-center gap-2 [grid-area:event]">
        {/* The dot's slot is kept on every row, so the words line up. */}
        <span className="flex w-2 shrink-0 justify-center">{event.attention && <Dot tone="attention" />}</span>
        <span className="shrink-0 whitespace-nowrap">{event.word}</span>
        {event.detail && <span className={cn(MUTED, 'min-w-0 truncate')}>{event.detail}</span>}
      </span>
      <span className="min-w-0 truncate [grid-area:who] @max-2xl:text-[13px] @max-2xl:text-muted-foreground">{whoLabel(entry)}</span>
      <span className="flex min-w-0 [grid-area:target] @max-2xl:ps-4">
        {target ? (
          target.external ? (
            <a href={target.to} target="_blank" rel="noreferrer" title="Opens the public site" className={linkClass}>
              {title}
              <span className="sr-only"> (opens the public site)</span>
            </a>
          ) : (
            <Link to={target.to} className={linkClass}>
              {title}
            </Link>
          )
        ) : (
          <span className="min-w-0 truncate">{title}</span>
        )}
      </span>
      <span className="flex min-w-0 justify-end [grid-area:reader]">
        {entry.readerId && onReader ? (
          // A full-size target that spills into the row's padding, so a row
          // with a reader stands as tall as one without.
          <button
            type="button"
            onClick={() => onReader(entry.readerId as string)}
            title="Only this reader"
            className={cn(
              MUTED,
              'relative z-10 -my-1 -me-2 h-7 min-w-0 truncate rounded-md px-2 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:bg-accent pointer-coarse:-my-3 pointer-coarse:h-11',
            )}
            aria-label={`Only reader ${shortHandle(entry.readerId)}`}
          >
            {shortHandle(entry.readerId)}
          </button>
        ) : (
          entry.readerId && <span className={cn(MUTED, 'min-w-0 truncate')}>{shortHandle(entry.readerId)}</span>
        )}
      </span>
    </li>
  );
}

/** Entries grouped under local day headings, newest first. */
export function ActivityDays({
  entries,
  onReader,
}: {
  entries: readonly PortalActivityEntry[];
  onReader?: (readerId: string) => void;
}) {
  const groups = React.useMemo(() => {
    const out: Array<{ key: string; label: string; entries: PortalActivityEntry[] }> = [];
    const now = new Date();
    for (const entry of entries) {
      const key = localDayKey(entry.createdAt);
      const last = out[out.length - 1];
      if (last?.key === key) last.entries.push(entry);
      else out.push({ key, label: localDayLabel(entry.createdAt, now), entries: [entry] });
    }
    return out;
  }, [entries]);

  return (
    <>
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h3
            className={cn(
              GUTTER,
              'sticky top-0 z-[5] flex h-11 items-center bg-background font-medium text-muted-foreground text-sm @2xl:top-9',
            )}
          >
            {group.label}
          </h3>
          <ol className={LIST}>
            {group.entries.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} onReader={onReader} />
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}
