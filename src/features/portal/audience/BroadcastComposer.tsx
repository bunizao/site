import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { BroadcastAudience, BroadcastRecord, NotifyChannel } from '@bunizao/contracts';
import { AlertCircle, CornerDownLeft, Send, X } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { Drawer, DrawerPopup } from '@/components/coss/drawer';
import { Kbd } from '@/components/coss/kbd';
import { Spinner } from '@/components/coss/spinner';
import { toastManager } from '@/components/coss/toast';
import { useMediaQuery } from '@/components/coss/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { Segmented, SMALL } from '../activity/table';
import { ApiError } from '../app/api';
import { forgetUndo, registerUndo } from '../app/undo';
import { formatCount, plural } from '../moderation/format';
import {
  describeBroadcastError,
  insertBroadcast,
  sendBroadcast,
  useBroadcastPreview,
  useRecipientCount,
} from './broadcast-data';
import {
  audienceKey,
  audienceText,
  editDraft,
  emptyDraft,
  isBlank,
  loadDraft,
  previewDocument,
  saveDraft,
  subscribeDraft,
  type Draft,
} from './broadcast-model';
import { EmailFrame } from './BroadcastPane';
import { useSubscriberCounts } from './data';
import { CHANNELS, CHANNEL_HINTS, CHANNEL_LABELS } from './model';

/* The composer: write on the left, the email as site-api renders it on the
   right, the audience under the message and its exact size in the footer.
   Send asks once, in place, with the number it will send to; that is the
   one write on the portal that cannot be undone, so it is the one that
   waits for the server. */

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
// Return is an icon: no UI font has the ↵ glyph, and the first system-font
// fallback lookup for it costs a long layout the moment the composer opens.
const SEND_MOD = MAC ? '⌘' : 'Ctrl';
const COUNT_MAX_AGE = 10_000;

type Phase = 'edit' | 'confirm' | 'sending';
type Pane = 'write' | 'preview';
type Width = 'desktop' | 'phone';

const PANES = [
  { value: 'write' as const, label: 'Write' },
  { value: 'preview' as const, label: 'Preview' },
];
const WIDTHS = [
  { value: 'desktop' as const, label: 'Desktop' },
  { value: 'phone' as const, label: 'Phone' },
];
const AUDIENCES = [
  { value: 'active' as const, label: 'Active' },
  { value: 'pending' as const, label: 'Pending' },
];

function Setting({ label, id, children }: { label: string; id?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5 text-[13px] max-[399px]:flex-col max-[399px]:items-stretch max-[399px]:py-2.5">
      <span id={id} className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function Preview({ subject, body, audience }: { subject: string; body: string; audience: BroadcastAudience }) {
  const [width, setWidth] = React.useState<Width>('desktop');
  const preview = useBroadcastPreview(subject, body, audience);
  const ready = Boolean(subject.trim() && body.trim());

  let content: React.ReactNode;
  if (!ready && !preview.data) {
    content = <p className="m-auto max-w-64 text-center text-[13px] text-muted-foreground">The email appears here once it has a subject and a message.</p>;
  } else if (preview.isError && !preview.data) {
    content = (
      <p role="alert" className="m-auto max-w-80 text-center text-[13px] text-muted-foreground">
        The preview did not load. {describeBroadcastError(preview.error)}{' '}
        <button type="button" className="text-foreground underline underline-offset-2" onClick={() => void preview.refetch()}>
          Try again
        </button>
      </p>
    );
  } else if (!preview.data) {
    content = <Spinner className="m-auto size-4 text-muted-foreground" />;
  } else {
    content = (
      <EmailFrame
        title="Email preview"
        html={previewDocument(preview.data.html)}
        className={cn('h-full shadow-sm', width === 'phone' ? 'mx-auto w-[375px] max-w-full rounded-lg' : 'w-full')}
      />
    );
  }

  return (
    <section aria-label="Preview" className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4 pointer-coarse:h-14">
        <h3 className="font-medium text-[13px]">Preview</h3>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs" aria-live="polite">
          {preview.isFetching && preview.data && (
            <>
              <Spinner className="size-3" />
              Updating
            </>
          )}
        </span>
        {/* On a phone both widths are the screen's own. */}
        <span className="ms-auto max-sm:hidden">
          <Segmented label="Preview width" value={width} options={WIDTHS} onChange={setWidth} />
        </span>
      </div>
      <div className="flex min-h-0 flex-1 bg-muted/40 p-3">{content}</div>
    </section>
  );
}

function ComposerBody({
  wide,
  onClose,
  onSent,
  escapeRef,
}: {
  wide: boolean;
  onClose: () => void;
  onSent: (row: BroadcastRecord) => void;
  escapeRef: React.RefObject<(() => boolean) | null>;
}) {
  const client = useQueryClient();
  const draft = React.useSyncExternalStore(subscribeDraft, loadDraft);
  const [phase, setPhase] = React.useState<Phase>('edit');
  const [error, setError] = React.useState<string | null>(null);
  const [pane, setPane] = React.useState<Pane>('write');
  const subjectRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const confirmRef = React.useRef<HTMLButtonElement>(null);

  const update = (patch: Partial<Omit<Draft, 'key'>>): void => {
    saveDraft(editDraft(loadDraft(), patch));
    if (phase === 'confirm') setPhase('edit');
    setError(null);
  };

  const audience = React.useMemo<BroadcastAudience>(() => ({ status: draft.status, channels: draft.channels }), [draft.status, draft.channels]);
  const key = audienceKey(draft.status, draft.channels);
  const count = useRecipientCount(audience, key);
  const subscriberCounts = useSubscriberCounts();
  const countFresh = draft.channels.length > 0 && count.data !== undefined && !count.isPlaceholderData && !count.isFetching;
  const recipients = count.data ?? 0;

  const blocker =
    !draft.subject.trim() ? 'Write a subject.'
    : !draft.body.trim() ? 'Write the message.'
    : draft.channels.length === 0 ? 'Pick at least one channel.'
    : count.isError && !count.data ? `The recipient count did not load. ${describeBroadcastError(count.error)}`
    : !countFresh ? null
    : recipients === 0 ? 'No subscriber matches this audience. Add a channel or switch to Active.'
    : null;

  const openConfirm = (): void => {
    if (!draft.subject.trim()) return subjectRef.current?.focus();
    if (!draft.body.trim()) return bodyRef.current?.focus();
    if (blocker || !countFresh) return;
    const latest = loadDraft();
    if (!latest.key) saveDraft({ ...latest, key: crypto.randomUUID() });
    setPhase('confirm');
    setError(null);
    if (Date.now() - count.dataUpdatedAt > COUNT_MAX_AGE) void count.refetch();
    requestAnimationFrame(() => confirmRef.current?.focus());
  };

  const send = async (): Promise<void> => {
    if (phase !== 'confirm' || !draft.key || !countFresh) return;
    setPhase('sending');
    setError(null);
    const input = { subject: draft.subject, body: draft.body, audience };
    try {
      const result = await sendBroadcast(input, draft.key);
      const row: BroadcastRecord = {
        id: result.id,
        subject: draft.subject.trim(),
        bodyHtml: '',
        bodyText: null,
        audience,
        recipientCount: result.recipientCount,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        status: result.status,
        createdAt: new Date().toISOString(),
        sentAt: null,
        sentBy: '',
      };
      insertBroadcast(client, row);
      saveDraft({ ...emptyDraft(), status: draft.status, channels: draft.channels });
      setPhase('edit');
      onSent(row);
    } catch (failure) {
      // The key stays, so Try again cannot send twice; only a conflict
      // (the key already names other content) needs a new one.
      const conflict = failure instanceof ApiError && failure.code === 'idempotency_conflict';
      if (conflict) saveDraft({ ...loadDraft(), key: null });
      setError(describeBroadcastError(failure));
      setPhase(conflict ? 'edit' : 'confirm');
    }
  };

  const clear = (): void => {
    const before = draft;
    saveDraft({ ...emptyDraft(), status: draft.status, channels: draft.channels });
    setPhase('edit');
    setError(null);
    const id: string = toastManager.add({
      title: 'Draft cleared',
      timeout: 5000,
      actionProps: {
        children: 'Undo',
        onClick: () => {
          forgetUndo(id);
          saveDraft(before);
        },
      },
      onRemove: (): void => forgetUndo(id),
    });
    registerUndo(id, () => saveDraft(before));
  };

  // Escape backs out of the confirm before it closes the composer.
  escapeRef.current = () => {
    if (phase !== 'confirm') return false;
    setPhase('edit');
    return true;
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    if (phase === 'confirm') void send();
    else if (phase === 'edit') openConfirm();
  };

  const channelCount = (channel: NotifyChannel): number | undefined => {
    const scope = subscriberCounts.data?.channelCounts?.[channel];
    return scope ? (draft.status === 'pending' ? scope.pendingCount : scope.activeCount) : undefined;
  };

  const form = (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3">
      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-[13px]">Subject</span>
        <input
          ref={subjectRef}
          data-composer-subject
          readOnly={phase === 'sending'}
          value={draft.subject}
          onChange={(event) => update({ subject: event.target.value })}
          placeholder="What the inbox shows first"
          autoComplete="off"
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24 pointer-coarse:h-11 dark:bg-input/32"
        />
      </label>
      <label className="flex flex-1 flex-col gap-1.5">
        <span className="font-medium text-[13px]">Message</span>
        <textarea
          ref={bodyRef}
          data-composer-body
          readOnly={phase === 'sending'}
          value={draft.body}
          onChange={(event) => update({ body: event.target.value })}
          placeholder={'Write in Markdown or HTML.\n\n# A heading\n**bold**, *italic*, [a link](https://buxx.me)'}
          spellCheck
          className="min-h-56 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24 dark:bg-input/32"
        />
        <span className="text-muted-foreground text-xs">Markdown: # heading, **bold**, *italic*, [text](url). Bare links are linked. HTML works too.</span>
      </label>
      <div>
        <Setting label="Audience">
          <Segmented label="Audience" value={draft.status} options={AUDIENCES} onChange={(status) => phase !== 'sending' && update({ status })} />
          {draft.status === 'pending' && (
            <span className="w-full text-muted-foreground text-xs">Pending addresses never confirmed. Send them only a reminder to confirm.</span>
          )}
        </Setting>
        <Setting label="Channels" id="composer-channels">
          <div role="group" aria-labelledby="composer-channels" className="flex flex-wrap gap-1.5">
            {CHANNELS.map((channel) => {
              const on = draft.channels.includes(channel);
              const value = channelCount(channel);
              return (
                <button
                  key={channel}
                  type="button"
                  aria-pressed={on}
                  disabled={phase === 'sending'}
                  title={CHANNEL_HINTS[channel]}
                  onClick={() => update({ channels: on ? draft.channels.filter((entry) => entry !== channel) : CHANNELS.filter((entry) => entry === channel || draft.channels.includes(entry)) })}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11',
                    on ? 'border-[hsl(var(--portal-accent)/0.6)] bg-[hsl(var(--portal-accent)/0.14)] text-foreground' : 'text-muted-foreground hover:text-foreground active:bg-accent',
                  )}
                >
                  <span aria-hidden className={cn('size-1.5 rounded-full', on ? 'bg-[hsl(var(--portal-accent))]' : 'bg-transparent ring-1 ring-muted-foreground')} />
                  {CHANNEL_LABELS[channel]}
                  {value !== undefined && <span className="text-muted-foreground text-xs tabular-nums">{formatCount(value)}</span>}
                </button>
              );
            })}
          </div>
        </Setting>
      </div>
    </div>
  );

  const preview = <Preview subject={draft.subject} body={draft.body} audience={audience} />;

  const countText =
    draft.channels.length === 0 ? null
    : count.data === undefined ? 'Counting recipients…'
    : `${plural(recipients, 'recipient')}${countFresh ? '' : '…'}`;

  const footer =
    phase === 'edit' ? (
      <>
        <p className="min-w-0 flex-1 text-[13px]" aria-live="polite">
          {error ?? blocker ? (
            <span className={cn('flex items-center gap-1.5', error && 'text-[hsl(var(--portal-danger))]')}>
              {error && <AlertCircle className="size-3.5 shrink-0" aria-hidden />}
              {error ?? blocker}
            </span>
          ) : (
            <>
              <span className={cn('font-mono tabular-nums', !countFresh && 'text-muted-foreground')}>{countText}</span>
              <span className="text-muted-foreground"> · {audienceText(audience)}</span>
            </>
          )}
        </p>
        <Button onClick={openConfirm} disabled={Boolean(blocker) || !countFresh} aria-keyshortcuts="Meta+Enter Control+Enter" className="pointer-coarse:h-11">
          <Send />
          Send…
          <Kbd className="pointer-coarse:hidden">
            {SEND_MOD}
            <CornerDownLeft aria-hidden className="mx-0! size-3" />
          </Kbd>
        </Button>
      </>
    ) : (
      <>
        <p className="min-w-0 flex-1 text-[13px]" role="status">
          {error ? (
            <span className="flex items-center gap-1.5 text-[hsl(var(--portal-danger))]">
              <AlertCircle className="size-3.5 shrink-0" aria-hidden />
              {error}
            </span>
          ) : (
            <>
              Send to <span className="font-mono tabular-nums">{countFresh ? plural(recipients, 'subscriber') : 'the audience'}</span> now?{' '}
              <span className="text-muted-foreground">Emails cannot be recalled.</span>
            </>
          )}
        </p>
        <Button variant="ghost" disabled={phase === 'sending'} onClick={() => setPhase('edit')} className="pointer-coarse:h-11">
          Cancel
        </Button>
        <Button ref={confirmRef} loading={phase === 'sending'} disabled={!countFresh} onClick={() => void send()} className="pointer-coarse:h-11">
          {error ? 'Try again' : countFresh ? `Send to ${formatCount(recipients)}` : 'Counting…'}
        </Button>
      </>
    );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" onKeyDown={onKeyDown}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button size="icon-sm" variant="ghost" aria-label="Close (Esc)" onClick={onClose}>
          <X />
        </Button>
        <h2 className="font-medium text-[13px] max-[359px]:sr-only">New broadcast</h2>
        <span className="hidden text-muted-foreground text-xs sm:inline">Kept as a draft on this device</span>
        <span className="ms-auto flex items-center gap-2">
          {!isBlank(draft) && (
            <Button size="sm" className={SMALL} variant="ghost" onClick={clear}>
              Clear
            </Button>
          )}
          {!wide && <Segmented label="Show" value={pane} options={PANES} onChange={setPane} />}
        </span>
      </header>

      {wide ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col border-e">{form}</div>
          <div className="flex min-h-0 flex-col">{preview}</div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">{pane === 'write' ? form : preview}</div>
      )}

      <footer className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-t px-4 py-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
        {footer}
      </footer>
    </div>
  );
}

export function BroadcastComposer({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: (row: BroadcastRecord) => void }) {
  const wide = useMediaQuery('(min-width: 1024px)');
  const escapeRef = React.useRef<(() => boolean) | null>(null);
  return (
    <Drawer
      open={open}
      position="right"
      onOpenChange={(next, details) => {
        if (next) return;
        if (details.reason === 'escape-key' && escapeRef.current?.()) return;
        onClose();
      }}
    >
      <DrawerPopup
        variant="straight"
        aria-label="New broadcast"
        className="h-full w-full max-w-[1180px] duration-150 data-ending-style:duration-150 motion-reduce:transition-none"
        portalProps={{ className: '[&_[data-slot=drawer-backdrop]]:duration-150! motion-reduce:[&_[data-slot=drawer-backdrop]]:transition-none' }}
        // The first empty field, so typing can start at once.
        initialFocus={() => document.querySelector<HTMLElement>(loadDraft().subject.trim() ? '[data-composer-body]' : '[data-composer-subject]')}
      >
        {/* Mounted with the popup, so each opening reads the saved draft
            and the closing slide still shows the form. */}
        <ComposerBody wide={wide} onClose={onClose} onSent={onSent} escapeRef={escapeRef} />
      </DrawerPopup>
    </Drawer>
  );
}
