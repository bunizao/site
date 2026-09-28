import * as React from 'react';
import type { BroadcastRecord } from '@bunizao/contracts';
import { ChevronDown, ChevronUp, CopyPlus, Hash, Link2, MoreHorizontal, X } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { Kbd } from '@/components/coss/kbd';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/coss/menu';
import { Skeleton } from '@/components/coss/skeleton';
import { cn } from '@/lib/utils';
import { Segmented, SMALL } from '../activity/table';
import { href } from '../app/router';
import { fullStamp } from '../comments/model';
import { formatCount, plural } from '../moderation/format';
import { HashValue, StatusDot, TOUCH_MENU } from '../moderation/ui';
import { STATE_LABELS, STATE_TONE, attempted, audienceText, broadcastState, emailDocument, etaText } from './broadcast-model';
import { SendBar } from './BroadcastRow';
import { Field, Section, copy } from './SubscriberPane';

/* One broadcast, flat: a header line, the actions, where the send stands,
   every stored field, then the message as the recipients got it. It
   renders from the history row, so opening it never waits on the network. */

/** A sandboxed page with no scripts. Same-origin only so the parent can
    size it to its content and keep its scroll across re-renders. */
export function EmailFrame({ html, title, fit, className }: { html: string; title: string; fit?: boolean; className?: string }) {
  const ref = React.useRef<HTMLIFrameElement>(null);
  const scroll = React.useRef(0);
  const [height, setHeight] = React.useState<number | null>(null);

  const onLoad = (): void => {
    const frame = ref.current;
    const view = frame?.contentWindow;
    const doc = frame?.contentDocument;
    if (!view || !doc) return;
    if (fit) {
      setHeight(doc.documentElement.scrollHeight);
      return;
    }
    view.scrollTo(0, scroll.current);
    view.addEventListener('scroll', () => {
      scroll.current = view.scrollY;
    }, { passive: true });
  };

  return (
    <iframe
      ref={ref}
      title={title}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={html}
      onLoad={onLoad}
      style={fit && height ? { height } : undefined}
      className={cn('block w-full border-0 bg-white', className)}
    />
  );
}

function Progress({ row }: { row: BroadcastRecord }) {
  const state = broadcastState(row);
  const failed = row.failedCount > 0 ? `, ${formatCount(row.failedCount)} failed` : '';
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (state !== 'sending') return;
    const timer = window.setInterval(() => setNow(Date.now()), 2_000);
    return () => window.clearInterval(timer);
  }, [state]);

  if (state === 'sending') {
    const eta = etaText(row, now);
    return (
      <div className="flex flex-col gap-2 py-1.5 text-[13px]">
        <SendBar row={row} className="h-1.5" />
        <p className="font-mono tabular-nums" aria-live="polite">
          {formatCount(row.sentCount)} of {formatCount(row.recipientCount)} sent{failed}
          {eta && <span className="font-sans text-muted-foreground"> · {eta}</span>}
        </p>
        <p className="text-muted-foreground text-xs">Updates every 2 seconds while this page is open. Leaving does not stop the send.</p>
      </div>
    );
  }

  let text: string;
  if (state === 'sent') text = `Every one of ${plural(row.recipientCount, 'recipient')} was sent the email.`;
  else if (state === 'partial') {
    text = `${formatCount(row.failedCount)} of ${formatCount(row.recipientCount)} did not get it. The per-address errors are in site-api's logs; the portal does not list them yet.`;
  } else if (state === 'failed') text = 'No one got it. Check the email settings in site-api, then send it again with Duplicate.';
  else if (state === 'stopped') {
    text = `The job stopped after ${formatCount(attempted(row))} of ${formatCount(row.recipientCount)}. The rest were never tried; Duplicate sends a new copy to the whole audience.`;
  } else text = 'Not sent yet.';

  return (
    <p className="py-1.5 text-[13px]">
      <span className="font-mono tabular-nums">
        {formatCount(row.sentCount)} of {formatCount(row.recipientCount)} sent{failed}.
      </span>{' '}
      <span className="text-muted-foreground">{text}</span>
    </p>
  );
}

type View = 'email' | 'text';
const VIEWS = [
  { value: 'email' as const, label: 'Email' },
  { value: 'text' as const, label: 'Plain text' },
];

function Message({ row }: { row: BroadcastRecord }) {
  const [view, setView] = React.useState<View>('email');
  // A send made a moment ago is on screen before its stored body arrives.
  if (!row.bodyHtml) {
    return (
      <div aria-busy="true" aria-label="Loading the message" className="flex flex-col gap-2 py-2">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 pt-1">
      <Segmented label="Show the message as" value={view} options={VIEWS} onChange={setView} />
      {view === 'email' ? (
        <EmailFrame key={row.id} fit title={`Message: ${row.subject}`} html={emailDocument(row.bodyHtml)} className="min-h-24 rounded-md" />
      ) : (
        <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-5">{row.bodyText || 'No plain-text version was stored.'}</pre>
      )}
    </div>
  );
}

export interface BroadcastDetailProps {
  row: BroadcastRecord;
  variant: 'panel' | 'drawer';
  position: { index: number; total: number } | null;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  onDuplicate: (row: BroadcastRecord) => void;
}

export function BroadcastDetail({ row, variant, position, onPrev, onNext, onClose, onDuplicate }: BroadcastDetailProps) {
  const drawer = variant === 'drawer';
  const state = broadcastState(row);

  // Another row in the same pane starts at the top. Not on mount: the pane
  // is new, so already there, and writing scrollTop forces a layout of the
  // whole screen inside the commit that opens it.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const lastRow = React.useRef(row.id);
  React.useLayoutEffect(() => {
    if (lastRow.current === row.id) return;
    lastRow.current = row.id;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [row.id]);

  const actions = (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 px-4',
        drawer ? 'border-t py-2.5 pb-[max(env(safe-area-inset-bottom),0.625rem)] [&>button]:h-11 [&>button]:flex-1' : 'h-11 border-b',
      )}
    >
      <Button size="sm" className={SMALL} variant="outline" aria-keyshortcuts="C" onClick={() => onDuplicate(row)}>
        <CopyPlus />
        Duplicate
        <Kbd className="pointer-coarse:hidden">C</Kbd>
      </Button>
      <Menu>
        <MenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label="More actions" className={drawer ? 'w-11 flex-none!' : 'ms-auto'} />}>
          <MoreHorizontal />
        </MenuTrigger>
        <MenuPopup align="end" className={TOUCH_MENU}>
          <MenuItem onClick={() => copy(new URL(href(`/broadcasts/${row.id}`), location.origin).toString(), 'Portal link')}>
            <Link2 />
            Copy portal link
          </MenuItem>
          <MenuItem onClick={() => copy(row.id, 'ID')}>
            <Hash />
            Copy ID
          </MenuItem>
        </MenuPopup>
      </Menu>
    </div>
  );

  return (
    <article aria-labelledby={`bc-${row.id}`} className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        {drawer && (
          <Button size="icon-sm" variant="ghost" aria-label="Close" className="-ms-2" onClick={onClose}>
            <X />
          </Button>
        )}
        <h2 id={`bc-${row.id}`} className="min-w-0 truncate font-medium text-[13px]" title={row.subject}>
          {row.subject}
        </h2>
        <StatusDot tone={STATE_TONE[state]} className="shrink-0 text-[13px]">{STATE_LABELS[state]}</StatusDot>
        <span className="ms-auto flex shrink-0 items-center">
          {position && (
            <span className="me-1 min-w-[4.5ch] text-end text-muted-foreground text-xs tabular-nums">
              {position.index + 1}/{position.total}
            </span>
          )}
          <Button size="icon-sm" variant="ghost" aria-label="Previous broadcast (K)" disabled={!onPrev} onClick={onPrev ?? undefined}>
            <ChevronUp />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Next broadcast (J)" disabled={!onNext} onClick={onNext ?? undefined}>
            <ChevronDown />
          </Button>
          {!drawer && (
            <Button size="icon-sm" variant="ghost" aria-label="Close (Esc)" onClick={onClose}>
              <X />
            </Button>
          )}
        </span>
      </header>

      {!drawer && actions}

      <div ref={scrollRef} className="@container/pane min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pt-1 pb-8">
        <Section title="Delivery">
          <Progress row={row} />
        </Section>

        <Section title="Record">
          <dl>
            <Field label="Subject">{row.subject}</Field>
            <Field label="Status">{STATE_LABELS[state]}</Field>
            <Field label="Audience">{audienceText(row.audience)}</Field>
            <Field label="Recipients" mono>{formatCount(row.recipientCount)}</Field>
            <Field label="Sent" mono>{formatCount(row.sentCount)}</Field>
            <Field label="Failed" mono>{formatCount(row.failedCount)}</Field>
            <Field label="Started" mono>{fullStamp(row.createdAt)}</Field>
            <Field label="Finished" mono={state !== 'sending'}>{state === 'sending' ? 'Still sending' : fullStamp(row.sentAt)}</Field>
            <Field label="Sent by" mono>{row.sentBy}</Field>
            <Field label="ID" mono copyable={row.id}>
              <HashValue key={row.id} value={row.id} />
            </Field>
          </dl>
        </Section>

        <Section title="Message">
          <Message row={row} />
        </Section>
      </div>

      {drawer && actions}
    </article>
  );
}
