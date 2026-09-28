import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { cn } from '@/lib/utils';
import { describeError } from '../app/api';
import { Link } from '../app/router';
import { formatCount, keyText } from './format';
import { SMALL } from '../activity/table';

/* The small pieces the three moderation screens share: a flat, dense,
   tool-like vocabulary. Status is a dot plus a word, values are mono, and a
   key always links to the comments it matches. */

export type Tone = 'neutral' | 'accent' | 'warning' | 'danger' | 'success';

const DOT: Record<Tone, string> = {
  neutral: 'bg-muted-foreground',
  accent: 'bg-[hsl(var(--portal-accent))]',
  warning: 'bg-[hsl(var(--portal-warning))]',
  danger: 'bg-[hsl(var(--portal-danger))]',
  success: 'bg-[hsl(var(--portal-success))]',
};

/** A coloured dot and the word that says the same thing, so colour is
    never the only signal. */
export function StatusDot({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', DOT[tone])} />
      {children}
    </span>
  );
}

/** Menu rows grow to 44px on touch screens (coss sizes them for a mouse),
    and the popup appears without its zoom when motion is reduced. */
export const TOUCH_MENU = 'pointer-coarse:[&_[role^=menuitem]]:min-h-11 motion-reduce:transition-none';

/** A 44px hit area on touch, centred on the element, from an ::after box,
    so dense rows and bars keep their height. */
export const TOUCH_TARGET =
  'relative pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:h-11 pointer-coarse:after:w-full pointer-coarse:after:min-w-11 pointer-coarse:after:-translate-x-1/2 pointer-coarse:after:-translate-y-1/2';

/** A coss ToggleGroupItem on a dialog: the popup surface all but hides the
    pressed fill, so the unpressed labels step back, as in Segmented. */
export const CHOICE_ITEM = 'text-muted-foreground hover:text-foreground data-pressed:text-foreground';

export function commentsHref(type: string, value: string): string {
  return `/comments?${new URLSearchParams({ status: 'all', key: type, value })}`;
}

/** A key value that opens every comment sharing it. The full value is in
    the title and the accessible name, since hashes print short. Hashes
    and network numbers are mono; a domain is a name and reads as text.
    Underlined on hover only, like every link in a list row: a column of
    underlines is a column of noise. */
export function KeyLink({ type, value, label, className }: { type: string; value: string; label?: string; className?: string }) {
  const name = type === 'domain' || type === 'email_domain';
  return (
    <Link
      to={commentsHref(type, value)}
      title={value}
      aria-label={`Comments sharing ${label ?? type} ${value}`}
      className={cn(
        TOUCH_TARGET,
        'rounded-sm text-foreground underline-offset-[3px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring active:text-[hsl(var(--portal-accent))]',
        name ? 'text-[13px]' : 'font-mono text-[12px] tabular-nums',
        className,
      )}
    >
      {keyText(type, value)}
    </Link>
  );
}

const HASH_PREFIX = 16;

/** A hash in a detail pane, on one line: its first 16 characters and an
    ellipsis, the whole value in the title. A click writes it out in place,
    breaking anywhere, and another folds it; copying stays with the row's
    copy button. Key it by value so a new record starts folded. */
export function HashValue({ value }: { value: string }) {
  const [open, setOpen] = React.useState(false);
  if (value.length <= HASH_PREFIX + 1) return <span className="font-mono tabular-nums">{value}</span>;
  return (
    <button
      type="button"
      title={value}
      aria-expanded={open}
      onClick={() => setOpen((was) => !was)}
      className={cn(
        'inline-block max-w-full rounded-sm text-start align-top font-mono tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring',
        open ? 'break-all' : 'truncate',
      )}
    >
      {open ? value : `${value.slice(0, HASH_PREFIX)}…`}
    </button>
  );
}

/* A small switch of our own instead of coss ToggleGroup: a switch pressed
   many times a minute should change in the frame it is pressed. */
export interface SwitchOption<T extends string> {
  value: T;
  label: string;
}

function arrowTo<T extends string>(event: React.KeyboardEvent, options: SwitchOption<T>[], value: T, onChange: (value: T) => void): void {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  event.preventDefault();
  const index = options.findIndex((option) => option.value === value);
  const next = options[(index + (event.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
  onChange(next.value);
  const group = event.currentTarget.parentElement;
  requestAnimationFrame(() => group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
}

export function Segmented<T extends string>({ label, value, options, onChange, onIntent, className }: {
  label: string;
  value: T;
  options: SwitchOption<T>[];
  onChange: (value: T) => void;
  /** Pointer-down on an option: time to start fetching what it will show. */
  onIntent?: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg border p-0.5', className)}>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onPointerDown={() => onIntent?.(option.value)}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => arrowTo(event, options, value, onChange)}
            className={cn(
              'relative h-full rounded-md px-2.5 text-muted-foreground text-xs tabular-nums outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:bg-accent aria-checked:bg-accent aria-checked:text-foreground',
              TOUCH_TARGET,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export interface StateTab<T extends string> {
  value: T;
  label: string;
  /** Leave out for no count; null while it loads. */
  count?: number | null;
  /** Draws the count in the warning colour: work is waiting there. */
  urgent?: boolean;
}

/** The one control for which slice of a list a screen shows (Held,
    Published…; Inbox, Archived…; Active, Expired…): a segmented row of
    pressed buttons that leads the header row on wide screens and a row of
    its own below it on narrow ones. The screen binds keys 1–n to the same
    order; this only labels them. */
export function StateTabs<T extends string>({ label, value, options, onChange, countsHidden = false, numbered = true }: {
  label: string;
  value: T;
  options: StateTab<T>[];
  onChange: (value: T) => void;
  /** The counts would not match the list (a search, a filter): hidden, not
      removed, so the control keeps its width. */
  countsHidden?: boolean;
  /** False when the screen gives keys 1–n to another control. */
  numbered?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map((option, i) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            aria-keyshortcuts={numbered ? String(i + 1) : undefined}
            title={numbered ? `${option.label} (${i + 1})` : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 font-medium text-[13px] text-muted-foreground outline-none transition-none',
              'hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:bg-background/60 pointer-coarse:h-9',
              TOUCH_TARGET,
              on && 'bg-background text-foreground shadow-sm/5 dark:bg-input',
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                aria-hidden={countsHidden || undefined}
                className={cn(
                  'min-w-[2ch] text-start text-xs tabular-nums',
                  countsHidden && 'invisible',
                  option.urgent && (option.count ?? 0) > 0 ? 'font-semibold text-[hsl(var(--warning-foreground))]' : 'text-muted-foreground',
                )}
              >
                {option.count === null ? '' : formatCount(option.count)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** For a strip that scrolls sideways (the tabs row on a phone): a fade at
    its right edge while more of it lies to the right. A sticky ::after, so
    no script: it pins to the edge while the strip overflows, and rests past
    the last item, over bare background, once it does not. It stands in for
    the strip's end padding. */
export const EDGE_FADE =
  'scroll-pe-6 after:pointer-events-none after:sticky after:end-0 after:h-full after:w-6 after:shrink-0 after:bg-linear-to-r after:from-transparent after:to-background';

export function SectionHeading({ children, meta, id }: { children: React.ReactNode; meta?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-2 flex min-h-8 items-baseline gap-2 pt-1.5">
      <h2 id={id} className="font-medium text-muted-foreground text-sm">{children}</h2>
      {meta && <span className="text-[13px] text-muted-foreground">{meta}</span>}
    </div>
  );
}

/** A failed read, flat in the page: what failed, how to recover, Retry. */
export function LoadError({ what, error, onRetry, action, className }: {
  what: string;
  error: unknown;
  onRetry: () => void;
  /** In place of Try again, when trying again cannot help. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-start gap-2 px-4 py-6 text-sm', className)}>
      <p className="flex items-center gap-2 font-medium">
        <span aria-hidden className={cn('size-1.5 rounded-full', DOT.danger)} />
        {what} did not load
      </p>
      <p className="text-muted-foreground">{describeError(error)}</p>
      {action ?? (
        <Button size="sm" className={SMALL} variant="outline" onClick={onRetry}>
          <RefreshCw />
          Try again
        </Button>
      )}
    </div>
  );
}

/** A value as a share of the largest in its column. */
export function InlineBar({ value, max, tone = 'neutral' }: { value: number; max: number; tone?: 'neutral' | 'danger' }) {
  const width = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return (
    <span aria-hidden className="block h-1 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]">
      <span
        className={cn('block h-full rounded-full', tone === 'danger' ? DOT.danger : 'bg-[hsl(var(--muted-foreground))]')}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

/** Search text that answers every keystroke from local state, and writes
    the URL once typing pauses. Safari throws after 100 history writes in
    30 seconds, and nothing on screen waits for the URL anyway. */
export function useSearchText(fromUrl: string, write: (value: string) => void): [string, (value: string) => void] {
  const [text, setText] = React.useState(fromUrl);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeRef = React.useRef(write);
  writeRef.current = write;

  // Back/forward or a Clear button changed the URL under us.
  const [seen, setSeen] = React.useState(fromUrl);
  if (fromUrl !== seen) {
    setSeen(fromUrl);
    setText(fromUrl);
  }

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const update = React.useCallback((value: string) => {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => writeRef.current(value), 400);
  }, []);

  return [text, update];
}

export function matchesWords(haystack: string, query: string): boolean {
  const text = haystack.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => text.includes(word));
}
