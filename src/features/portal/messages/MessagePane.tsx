import * as React from 'react';
import type { AdminOwnerMessage, AdminOwnerMessageDetail, AdminOwnerMessageReplyability } from '@bunizao/contracts';
import { Archive, Ban, ChevronDown, ChevronUp, CornerDownLeft, Hash, Inbox, Link2, Mail, MoreHorizontal, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { Kbd } from '@/components/coss/kbd';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/coss/menu';
import { Skeleton } from '@/components/coss/skeleton';
import { cn } from '@/lib/utils';
import { describeError, isMissingRoute } from '../app/api';
import { href } from '../app/router';
import { copy, Section } from '../audience/SubscriberPane';
import { fullStamp, spamDecision, stamp } from '../comments/model';
import { Row } from '../comments/RecordRows';
import { countryName } from '../moderation/format';
import { StatusDot, TOUCH_MENU, type Tone } from '../moderation/ui';
import { discardReply, useRepliesTo, useSendReply, type PendingReply } from './data';
import { senderLabel, senderRows } from './model';
import { STATE_LABELS, STATE_TONE, firstLine } from './MessageRow';
import { SMALL } from '../activity/table';

/* One message, flat: a header line, the two filing acts, the message, who
   a reply reaches and the composer, everything else the same address sent,
   then the sender's keys. It renders from the list row, so opening it never
   waits on the network; only the sender line, the history and the keys
   load. */

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const SEND_MOD = MAC ? '⌘' : 'Ctrl';
const REPLY_MIN = 2;
const REPLY_MAX = 4000;

/* Drafts survive walking the list with j and k, for this page's life. */
const drafts = new Map<string, string>();
/* The last `r` press the composer answered, so a remount does not take
   focus again for an old press. */
let lastFocusRequest = 0;

const LOCALE_LABELS: Record<string, string> = { en: 'English page', zh: 'Chinese page' };

const REPLYABILITY: Record<Exclude<AdminOwnerMessageReplyability, 'ok'>, { tone: Tone; text: string }> = {
  no_address: { tone: 'neutral', text: 'They left no address, so a reply cannot reach them.' },
  unverified: { tone: 'warning', text: 'Their address was never confirmed, or their reader was revoked. A reply cannot be sent until they confirm it.' },
  suppressed: { tone: 'danger', text: 'Their address bounced or reported mail as spam, so mail to it is blocked.' },
};

interface DetailState {
  data?: AdminOwnerMessageDetail;
  isPending: boolean;
  error: unknown;
}

/* A dot beside wrapping text: pinned to the first line. */
const WRAPPING_DOT = 'items-start whitespace-normal text-[13px] leading-5 [&>span:first-child]:mt-[7px]';

function Replyability({ detail }: { detail: DetailState }) {
  if (detail.data) {
    const { sender, message } = detail.data;
    if (sender.replyable === 'ok') {
      // A typed address still reaches its reader, who may not be the sender.
      const typed = message.authAtWrite === 'anonymous';
      return (
        <StatusDot tone={typed ? 'warning' : 'success'} className={WRAPPING_DOT}>
          <span>
            A reply goes by email to <span className="break-words font-mono text-xs tabular-nums">{sender.email}</span>
            {typed && '. The sender typed it without signing in, so it may reach a reader who never wrote to you.'}
          </span>
        </StatusDot>
      );
    }
    const line = REPLYABILITY[sender.replyable];
    return <StatusDot tone={line.tone} className={WRAPPING_DOT}>{line.text}</StatusDot>;
  }
  if (detail.isPending) {
    return (
      <span aria-busy="true" className="flex h-5 items-center gap-2 text-muted-foreground text-xs">
        <Skeleton className="h-3 w-48" />
        Checking who a reply reaches
      </span>
    );
  }
  return (
    <StatusDot tone="warning" className={WRAPPING_DOT}>
      {isMissingRoute(detail.error) ? 'This needs the updated site-api, which is not deployed yet.' : `Could not check who a reply reaches. ${describeError(detail.error)}`}
    </StatusDot>
  );
}

function ReplyLine({ reply, onEdit }: { reply: PendingReply; onEdit: (body: string) => void }) {
  return (
    <li className="py-2.5 text-[13px] leading-5">
      <span className="flex items-center gap-2">
        <time className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">{stamp(reply.sentAt)}</time>
        <span className="font-medium">You</span>
        {reply.state === 'failed' ? (
          <span className="text-[hsl(var(--portal-danger))] text-xs">Not sent</span>
        ) : (
          <span className="text-muted-foreground text-xs">
            {reply.state === 'sending' ? 'Sending…' : `Sent to ${reply.recipient ?? 'them'}`}
          </span>
        )}
      </span>
      <span className="line-clamp-3 whitespace-pre-wrap break-words">{reply.body}</span>
      {reply.state === 'failed' && (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
          <span className="min-w-0 flex-1 text-[hsl(var(--portal-danger))]">{reply.error}</span>
          <span className="flex shrink-0 gap-1">
            <Button size="sm" className={SMALL} variant="outline" onClick={() => onEdit(reply.body)}>Edit</Button>
            <Button size="sm" className={SMALL} variant="ghost" onClick={() => discardReply(reply.key)}>Discard</Button>
          </span>
        </span>
      )}
    </li>
  );
}

function Composer({ message, blocked, focusRequest, variant }: {
  message: AdminOwnerMessage;
  blocked: boolean;
  focusRequest: number;
  variant: 'panel' | 'drawer';
}) {
  const send = useSendReply();
  const sent = useRepliesTo(message.id);
  const [text, setText] = React.useState(() => drafts.get(message.id) ?? '');
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (focusRequest <= lastFocusRequest) return;
    lastFocusRequest = focusRequest;
    ref.current?.focus({ preventScroll: false });
  }, [focusRequest]);

  const update = (value: string): void => {
    setText(value);
    if (value) drafts.set(message.id, value);
    else drafts.delete(message.id);
  };

  const body = text.trim();
  const ready = !blocked && body.length >= REPLY_MIN;
  const submit = (): void => {
    if (!ready) return;
    update('');
    void send(message, body);
  };

  return (
    <div className="flex flex-col gap-2 pt-2">
      {sent.length > 0 && (
        <ul aria-label="Your replies">
          {sent.map((reply) => (
            <ReplyLine
              key={reply.key}
              reply={reply}
              onEdit={(value) => {
                discardReply(reply.key);
                update(value);
                ref.current?.focus();
              }}
            />
          ))}
        </ul>
      )}
      <textarea
        ref={ref}
        rows={3}
        maxLength={REPLY_MAX}
        value={text}
        disabled={blocked}
        aria-label={`Reply to ${message.displayName} by email`}
        placeholder={blocked ? 'A reply cannot reach this sender' : `Reply to ${message.displayName} by email`}
        aria-keyshortcuts="R"
        className="block w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-[14px] leading-5 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24 disabled:cursor-not-allowed disabled:opacity-60"
        onChange={(event) => update(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          } else if (event.key === 'Escape') {
            // Leave the box, not the message: the drawer and the page both
            // close on Escape otherwise.
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.blur();
            if (variant === 'panel') {
              document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(message.id)}"] [data-row-button]`)?.focus({ preventScroll: true });
            }
          }
        }}
      />
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-muted-foreground text-xs">
          {text.length > REPLY_MAX - 200
            ? `${REPLY_MAX - text.length} characters left`
            : 'Sent from the site’s address, quoting their message. They can answer it by email.'}
        </span>
        <Button size="sm" disabled={!ready} aria-keyshortcuts="Meta+Enter Control+Enter" className={cn(SMALL, 'shrink-0')} onClick={submit}>
          Send
          <Kbd className="pointer-coarse:hidden">
            {SEND_MOD}
            <CornerDownLeft aria-hidden className="mx-0! size-3" />
          </Kbd>
        </Button>
      </div>
    </div>
  );
}

function History({ detail, onOpen }: { detail: DetailState; onOpen: (message: AdminOwnerMessage) => void }) {
  if (!detail.data) {
    if (!detail.isPending) return <p className="py-1.5 text-muted-foreground text-[13px]">{describeError(detail.error)}</p>;
    return (
      <div aria-busy="true" aria-label="Loading earlier messages" className="flex flex-col gap-2 py-2">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  }
  const { message, history } = detail.data;
  if (!message.emailHash) return <p className="py-1.5 text-muted-foreground text-[13px]">No address, so nothing to match earlier messages on.</p>;
  if (history.length === 0) return <p className="py-1.5 text-muted-foreground text-[13px]">Nothing else from this address.</p>;
  return (
    <ul aria-label="Earlier from this address">
      {history.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            className="flex w-full flex-col gap-1 rounded-sm py-2.5 text-start text-[13px] leading-5 outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring active:bg-accent"
            onClick={() => onOpen(entry)}
          >
            <span className="flex items-center gap-2">
              <time className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">{stamp(entry.createdAt)}</time>
              <StatusDot tone={STATE_TONE[entry.state]} className="text-xs">{STATE_LABELS[entry.state]}</StatusDot>
            </span>
            <span className="line-clamp-2 break-words text-foreground">{firstLine(entry.body)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export interface MessageDetailProps {
  message: AdminOwnerMessage;
  detail: DetailState;
  variant: 'panel' | 'drawer';
  position: { index: number; total: number } | null;
  focusRequest: number;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  onArchive: () => void;
  onSpam: () => void;
  /** Ban the sender and file this as spam (B). */
  onBan: () => void;
  onOpenMessage: (message: AdminOwnerMessage) => void;
}

export function MessageDetail({
  message,
  detail,
  variant,
  position,
  focusRequest,
  onPrev,
  onNext,
  onClose,
  onArchive,
  onSpam,
  onBan,
  onOpenMessage,
}: MessageDetailProps) {
  const drawer = variant === 'drawer';
  const archived = message.state === 'archived';
  const spam = message.state === 'spam';
  // A detail still showing the previous message reads as loading.
  const current: DetailState = detail.data && detail.data.message.id !== message.id ? { isPending: true, error: null } : detail;
  const recipient = current.data?.sender ?? null;
  const blocked = Boolean(recipient && recipient.replyable !== 'ok');
  const history = current.data?.history.length ?? 0;
  const actor = current.data?.actor ?? null;
  const decision = spam ? spamDecision(message.spamNote, message.spamModel) : null;
  const sender = React.useMemo(() => (actor ? senderRows(message, actor) : null), [message, actor]);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [message.id]);

  const actions = (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 px-4',
        drawer ? 'border-t py-2.5 pb-[max(env(safe-area-inset-bottom),0.625rem)] [&>button]:h-11 [&>button]:flex-1' : 'h-11 border-b',
      )}
    >
      <Button size="sm" className={SMALL} variant="outline" aria-keyshortcuts="E" onClick={onArchive}>
        {archived ? <Inbox /> : <Archive />}
        {archived ? 'Move to Inbox' : 'Archive'}
        <Kbd className="pointer-coarse:hidden">E</Kbd>
      </Button>
      <Button size="sm" className={SMALL} variant="outline" aria-keyshortcuts="!" onClick={onSpam}>
        {spam ? <ShieldCheck /> : <ShieldAlert />}
        {spam ? 'Not spam' : 'Spam'}
        <Kbd className="pointer-coarse:hidden">!</Kbd>
      </Button>
      <Menu>
        <MenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label="More actions" className={drawer ? 'w-11 flex-none!' : 'ms-auto'} />}>
          <MoreHorizontal />
        </MenuTrigger>
        <MenuPopup align="end" className={TOUCH_MENU}>
          {actor && (
            <>
              <MenuItem onClick={onBan}>
                <Ban />
                Ban sender…
                <Kbd className="ms-auto pointer-coarse:hidden">B</Kbd>
              </MenuItem>
              <MenuSeparator />
            </>
          )}
          {recipient?.email && (
            <MenuItem onClick={() => copy(recipient.email!, 'Address')}>
              <Mail />
              Copy their address
            </MenuItem>
          )}
          <MenuItem onClick={() => copy(new URL(href(`/messages?m=${encodeURIComponent(message.id)}`), location.origin).toString(), 'Portal link')}>
            <Link2 />
            Copy portal link
          </MenuItem>
          <MenuItem onClick={() => copy(message.id, 'ID')}>
            <Hash />
            Copy ID
          </MenuItem>
        </MenuPopup>
      </Menu>
    </div>
  );

  return (
    <article aria-labelledby={`msg-${message.id}`} className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        {drawer && (
          <Button size="icon-sm" variant="ghost" aria-label="Close" className="-ms-2 pointer-coarse:-ms-3.5 pointer-coarse:size-11" onClick={onClose}>
            <X />
          </Button>
        )}
        <h2 id={`msg-${message.id}`} className="min-w-0 truncate font-medium text-[13px]" title={message.displayName}>
          {message.displayName}
        </h2>
        <StatusDot tone={STATE_TONE[message.state]} className="shrink-0 text-[13px]">{STATE_LABELS[message.state]}</StatusDot>
        <span className="ms-auto flex shrink-0 items-center">
          {position && (
            <span className="me-1 min-w-[4.5ch] text-end text-muted-foreground text-xs tabular-nums">
              {position.index + 1}/{position.total}
            </span>
          )}
          <Button size="icon-sm" variant="ghost" aria-label="Previous message (K)" className="pointer-coarse:size-11" disabled={!onPrev} onClick={onPrev ?? undefined}>
            <ChevronUp />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Next message (J)" className="pointer-coarse:size-11" disabled={!onNext} onClick={onNext ?? undefined}>
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

      <div ref={scrollRef} className="@container/pane min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pt-3 pb-8">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-xs">
          <time dateTime={message.createdAt} className="font-mono tabular-nums">
            {fullStamp(message.createdAt)}
          </time>
          {message.country && <span>{countryName(message.country)}</span>}
          <span>{LOCALE_LABELS[message.locale] ?? message.locale}</span>
          <span>{senderLabel(message)}</span>
        </p>
        {decision && (
          <div className="pt-3 text-[13px]">
            <p className="text-foreground">{decision.summary}</p>
            {decision.detail && <p className="text-muted-foreground">{decision.detail}</p>}
          </div>
        )}
        <p className="whitespace-pre-wrap break-words pt-3 text-[14px] leading-6">{message.body}</p>

        <Section
          title="Reply"
          meta={message.repliedAt ? <>Replied <time className="font-mono tabular-nums" dateTime={message.repliedAt}>{stamp(message.repliedAt)}</time></> : undefined}
        >
          <div className="pt-1">
            <Replyability detail={current} />
          </div>
          <Composer key={message.id} message={message} blocked={blocked} focusRequest={focusRequest} variant={variant} />
        </Section>

        <Section title="Earlier from this address" meta={history > 0 ? history : undefined}>
          <History detail={current} onOpen={onOpenMessage} />
        </Section>

        {sender && (
          <Section title="Sender">
            <dl>
              {sender.map((row) => (
                <Row key={row.id} row={row} keep={null} />
              ))}
            </dl>
          </Section>
        )}
      </div>

      {drawer && actions}
    </article>
  );
}
