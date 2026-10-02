import * as React from 'react';
import { Ban, Copy } from 'lucide-react';
import { toastManager } from '@/components/coss/toast';
import { cn } from '@/lib/utils';
import { href, navigate } from '../app/router';
import { HashValue, TOUCH_TARGET } from '../moderation/ui';
import { isHash, pivotHref, type Pivot, type RecordRow } from './model';

/* The label/value rows a writer or sender is described in, shared by the
   comment pane and the message pane so both pivot the same way. */

export function copy(text: string, what: string): void {
  void navigator.clipboard?.writeText(text).then(
    () => toastManager.add({ title: `${what} copied`, timeout: 1500 }),
    () => toastManager.add({ type: 'error', title: 'Copy failed', description: 'Select the value and copy it by hand.' }),
  );
}

/** A link to another portal screen: plain click stays in the app, a
    modified click opens a new tab. A control of its own, not prose, so it
    gets the 44px touch target. */
export function PortalLink({ to, children, className, label }: { to: string; children: React.ReactNode; className?: string; label?: string }) {
  return (
    <a
      href={href(to)}
      aria-label={label}
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

/** A pivot link. `keep` is the comment left open across it: the panel's,
    which sits beside the filtered list; never the drawer's, which would
    cover it. */
export function PivotAnchor({ pivot, keep, children, className, label }: {
  pivot: Pivot;
  keep: string | null;
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return <PortalLink to={pivotHref(pivot.type, pivot.value, keep)} className={className} label={label}>{children}</PortalLink>;
}

/** A narrow pane wraps an address after its @, not mid-word. */
export function EmailBreak({ value }: { value: string }) {
  const at = value.indexOf('@');
  if (at <= 0) return <>{value}</>;
  return <>{value.slice(0, at + 1)}<wbr />{value.slice(at + 1)}</>;
}

/** What the count cell says: a row's `tally` when it has one (one line a
    kind, null is "only this"), else the comment count. */
function Count({ row, keep }: { row: RecordRow; keep: string | null }) {
  if (!row.pivot) return null;
  if (row.tally !== undefined) {
    if (!row.tally) return <span className="text-muted-foreground">only this</span>;
    // Stacked, not joined: side by side they squeeze a phone's value column to a few characters.
    return (
      <PivotAnchor pivot={row.pivot} keep={keep} label={row.tally.join(' · ')} className="flex flex-col items-end tabular-nums">
        {row.tally.map((line) => <span key={line}>{line}</span>)}
      </PivotAnchor>
    );
  }
  if (row.count === null) return <PivotAnchor pivot={row.pivot} keep={keep}>Show all</PivotAnchor>;
  if (row.count === 1) return <span className="text-muted-foreground">only this</span>;
  return <PivotAnchor pivot={row.pivot} keep={keep} className="tabular-nums">{row.count} comments</PivotAnchor>;
}

export function Row({ row, keep }: { row: RecordRow; keep: string | null }) {
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
      {/* Top-aligned, so a stacked count's first line sits beside the label. */}
      <dd className="flex items-start gap-1 whitespace-nowrap text-xs leading-5">
        <Count row={row} keep={keep} />
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
