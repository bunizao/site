import * as React from 'react';
import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  AdminOwnerMessage,
  AdminOwnerMessageAction,
  AdminOwnerMessageActionResponse,
  AdminOwnerMessageDetail,
  AdminOwnerMessageListResult,
  AdminOwnerMessageReplyResponse,
  MessageState,
} from '@bunizao/contracts';
import { toastManager } from '@/components/coss/toast';
import { ApiError, MISSING_ROUTE_MESSAGE, apiGet, apiSend, describeError, isMissingRoute, needsSiteApiUpdate } from '../app/api';
import { shareRowsById } from '../app/share-rows';
import { forgetUndo, registerUndo } from '../app/undo';

/* Reads and writes for the owner's message inbox.

   Each tray reads its own list: site-api filters by `state=inbox` (new,
   read and replied), `archived` or `spam`, and the two trays not on screen
   are warmed once it is idle. Every act is optimistic: the
   message moves between tabs, and the tab counts follow, in the frame the
   key is pressed; the server's answer then replaces the guess, or the
   guess is rolled back. */

export type MessageView = 'inbox' | 'archived' | 'spam';
export const MESSAGE_VIEWS: readonly MessageView[] = ['inbox', 'archived', 'spam'];

const INBOX_STATES: ReadonlySet<MessageState> = new Set(['new', 'read', 'replied']);
const PAGE = 100;

export function inView(view: MessageView, state: MessageState): boolean {
  return view === 'inbox' ? INBOX_STATES.has(state) : state === view;
}

export const messageKeys = {
  all: ['messages'] as const,
  lists: ['messages', 'list'] as const,
  list: (view: MessageView) => ['messages', 'list', view] as const,
  detail: (id: string) => ['messages', 'detail', id] as const,
};

type ListData = InfiniteData<AdminOwnerMessageListResult, number>;

const shareMessages = shareRowsById<AdminOwnerMessage>('messages', (message) => message.id);

function listOptions(view: MessageView) {
  return infiniteQueryOptions({
    queryKey: messageKeys.list(view),
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      try {
        return await apiGet<AdminOwnerMessageListResult>('admin/messages', { state: view, limit: PAGE, offset: pageParam }, signal);
      } catch (error) {
        // A site-api from before `inbox` refuses it as a state.
        if (view === 'inbox' && error instanceof ApiError && error.status === 400 && error.code === 'invalid_state') {
          throw needsSiteApiUpdate();
        }
        throw error;
      }
    },
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    // Telegram files messages too; a minute's lag is fine, focus catches up.
    refetchInterval: 60_000,
    // A message that moves to another tab keeps every other row's object.
    structuralSharing: shareMessages,
  });
}

/** Rows of every loaded page, once each, newest first. */
export function flattenMessages(data: { pages: AdminOwnerMessageListResult[] } | undefined): AdminOwnerMessage[] | undefined {
  if (!data) return undefined;
  const seen = new Set<string>();
  const rows: AdminOwnerMessage[] = [];
  for (const page of data.pages) {
    for (const message of page.messages) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      rows.push(message);
    }
  }
  return rows;
}

/* No placeholder: the previous tray's rows would read as this tray's for
   a frame. A tray not yet warmed shows a skeleton. */
export function useMessageList(view: MessageView) {
  return useInfiniteQuery(listOptions(view));
}

export function prefetchMessageList(client: QueryClient, view: MessageView): Promise<unknown> {
  return client.infiniteQuery({ ...listOptions(view), staleTime: 'static' });
}

/** Warm the two trays not on screen once it is idle, so switching paints
    rows from cache instead of a skeleton. */
export function usePrefetchTrays(view: MessageView, enabled: boolean): void {
  const client = useQueryClient();
  React.useEffect(() => {
    if (!enabled) return;
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 400));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => {
      for (const other of MESSAGE_VIEWS) {
        // A failed warm-up is the tray's to report if it opens.
        if (other !== view) client.infiniteQuery({ ...listOptions(other), staleTime: 60_000 }).catch(() => {});
      }
    });
    return () => cancel(handle);
  }, [client, view, enabled]);
}

function detailOptions(id: string) {
  return queryOptions({
    queryKey: messageKeys.detail(id),
    queryFn: ({ signal }) => apiGet<AdminOwnerMessageDetail>(`admin/messages/${encodeURIComponent(id)}`, undefined, signal),
  });
}

export function useMessageDetail(id: string | null) {
  return useQuery({ ...detailOptions(id ?? ''), enabled: Boolean(id) });
}

/** Warms one message's sender and history, for a row the pointer or the
    keys are about to open. A cached answer is enough. */
export function prefetchMessageDetail(client: QueryClient, id: string): void {
  client.query({ ...detailOptions(id), staleTime: 'static' }).catch(() => {});
}

/* ------------------------------------------------------------------ */
/* Moving a message between states, in every cache at once             */
/* ------------------------------------------------------------------ */

function viewFromKey(key: readonly unknown[]): MessageView | null {
  const view = key[2];
  return view === 'inbox' || view === 'archived' || view === 'spam' ? view : null;
}

/** The list with `next` in place of whatever it held of the message: in
    place when it still belongs, dropped when it no longer does, and put
    back by date when it now does and the loaded pages reach that far. */
function placeInList(data: ListData, view: MessageView, before: AdminOwnerMessage, next: AdminOwnerMessage): ListData {
  const belongs = inView(view, next.state);
  let found = false;
  let pages = data.pages.map((page) => {
    const index = page.messages.findIndex((message) => message.id === next.id);
    if (index < 0) return page;
    found = true;
    const messages = page.messages.slice();
    if (belongs) messages[index] = next;
    else messages.splice(index, 1);
    return { ...page, messages };
  });
  if (!found && belongs) {
    const last = pages.length - 1;
    const target = pages.findIndex((page) => page.messages.some((message) => message.createdAt < next.createdAt));
    const at = target >= 0 ? target : pages[last]?.nextOffset === null ? last : -1;
    if (at >= 0) {
      const messages = pages[at].messages.slice();
      const index = messages.findIndex((message) => message.createdAt < next.createdAt);
      messages.splice(index < 0 ? messages.length : index, 0, next);
      pages = pages.map((page, i) => (i === at ? { ...page, messages } : page));
    }
  }
  if (before.state !== next.state) {
    pages = pages.map((page) => ({
      ...page,
      counts: { ...page.counts, [before.state]: Math.max(0, page.counts[before.state] - 1), [next.state]: page.counts[next.state] + 1 },
    }));
  }
  return { ...data, pages };
}

/** Writes a move into every list and detail the cache holds. */
function applyMove(client: QueryClient, before: AdminOwnerMessage, next: AdminOwnerMessage): void {
  for (const [key, data] of client.getQueriesData<ListData>({ queryKey: messageKeys.lists })) {
    const view = viewFromKey(key);
    if (!data || !view) continue;
    client.setQueryData<ListData>(key, placeInList(data, view, before, next));
  }
  for (const [key, data] of client.getQueriesData<AdminOwnerMessageDetail>({ queryKey: [...messageKeys.all, 'detail'] })) {
    if (!data) continue;
    const touches = data.message.id === next.id || data.history.some((message) => message.id === next.id);
    if (!touches) continue;
    client.setQueryData<AdminOwnerMessageDetail>(key, {
      ...data,
      message: data.message.id === next.id ? next : data.message,
      history: data.history.map((message) => (message.id === next.id ? next : message)),
    });
  }
}

/** Where an act moves a message, or null when it is already past it:
    site-api's guarded UPDATEs (messages-admin.ts there). */
export function nextState(message: AdminOwnerMessage, action: AdminOwnerMessageAction): MessageState | null {
  const settled: MessageState = message.repliedAt ? 'replied' : 'read';
  switch (action) {
    case 'read': return message.state === 'new' ? 'read' : null;
    case 'archive': return message.state !== 'archived' ? 'archived' : null;
    case 'unarchive': return message.state === 'archived' ? settled : null;
    case 'spam': return message.state !== 'spam' ? 'spam' : null;
    case 'unspam': return message.state === 'spam' ? settled : null;
  }
}

const REVERSE: Partial<Record<AdminOwnerMessageAction, AdminOwnerMessageAction>> = {
  archive: 'unarchive',
  unarchive: 'archive',
  spam: 'unspam',
  unspam: 'spam',
};

const DONE: Partial<Record<AdminOwnerMessageAction, string>> = {
  archive: 'Archived',
  unarchive: 'Moved to Inbox',
  spam: 'Marked as spam',
  unspam: 'Moved to Inbox, not spam',
};

/** Set once a `read` came back as a missing route, so opening messages on
    a site-api without the inbox does not ask again for each one. */
let readUnsupported = false;

export function useMessageAction() {
  const client = useQueryClient();
  const pending = React.useRef(0);

  return React.useCallback(
    /** Moves the message at once and says whether the move stuck. `after`
        holds the request until another write lands (a ban files its message
        this way); if that write fails, the move goes back without a word,
        since the other write reports its own failure. */
    async function act(
      message: AdminOwnerMessage,
      action: AdminOwnerMessageAction,
      options: { quiet?: boolean; after?: Promise<unknown> } = {},
    ): Promise<boolean> {
      const state = nextState(message, action);
      if (!state) return false;
      if (action === 'read' && readUnsupported) return false;
      const guess: AdminOwnerMessage = { ...message, state, updatedAt: new Date().toISOString() };
      pending.current += 1;
      await client.cancelQueries({ queryKey: messageKeys.lists });
      applyMove(client, message, guess);

      const reverse = REVERSE[action];
      let toastId: string | null = null;
      if (!options.quiet && reverse) {
        const undo = (): void => {
          if (toastId) forgetUndo(toastId);
          void act(guess, reverse, { quiet: true });
        };
        toastId = toastManager.add({
          title: DONE[action],
          description: message.displayName,
          timeout: 6000,
          actionProps: { children: 'Undo', onClick: undo },
          onRemove: (): void => {
            if (toastId) forgetUndo(toastId);
          },
        });
        registerUndo(toastId, undo);
      }

      try {
        if (options.after && !(await options.after.then(() => true, () => false))) {
          applyMove(client, guess, message);
          return false;
        }
        const response = await apiSend<AdminOwnerMessageActionResponse>('POST', `admin/messages/${encodeURIComponent(message.id)}`, { action });
        applyMove(client, guess, response.message);
        return true;
      } catch (error) {
        applyMove(client, guess, message);
        if (toastId) toastManager.close(toastId);
        if (action === 'read') {
          // Opening a message never shouts; a backend without the route just
          // leaves it unread.
          if (isMissingRoute(error)) readUnsupported = true;
          return false;
        }
        toastManager.add({
          type: 'error',
          title: `${DONE[action] ?? 'That'} did not go through`,
          description: isMissingRoute(error) ? MISSING_ROUTE_MESSAGE : error instanceof ApiError && error.status === 404 ? 'That message no longer exists.' : describeError(error),
        });
        return false;
      } finally {
        pending.current -= 1;
        // Offsets move with every act; one refetch once the burst settles.
        if (pending.current === 0) void client.invalidateQueries({ queryKey: messageKeys.lists });
      }
    },
    [client],
  );
}

/* ------------------------------------------------------------------ */
/* Replies                                                             */
/* ------------------------------------------------------------------ */

export interface PendingReply {
  key: string;
  messageId: string;
  body: string;
  sentAt: string;
  state: 'sending' | 'sent' | 'failed';
  /** Masked, from site-api's receipt. */
  recipient: string | null;
  error: string | null;
}

/* Replies sent from this page, for its life: the pane shows each one with
   its outcome, and a failed one can go back into the composer. */
let replies: PendingReply[] = [];
const listeners = new Set<() => void>();

function setReplies(next: PendingReply[]): void {
  replies = next;
  for (const listener of listeners) listener();
}

function patchReply(key: string, patch: Partial<PendingReply>): void {
  setReplies(replies.map((reply) => (reply.key === key ? { ...reply, ...patch } : reply)));
}

export function discardReply(key: string): void {
  setReplies(replies.filter((reply) => reply.key !== key));
}

export function useRepliesTo(messageId: string): readonly PendingReply[] {
  const snapshot = React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => replies,
  );
  return React.useMemo(() => snapshot.filter((reply) => reply.messageId === messageId), [snapshot, messageId]);
}

const REPLY_REFUSALS: Record<string, string> = {
  no_address: 'They left no address, so there is nowhere to send it.',
  unverified: 'Their address was never confirmed, or their reader was revoked.',
  suppressed: 'Their address bounced or reported mail as spam, so mail to it is blocked.',
  invalid_body: 'A reply needs 2 to 4,000 characters.',
};

function replyError(error: unknown): string {
  if (isMissingRoute(error)) return MISSING_ROUTE_MESSAGE;
  if (error instanceof ApiError && error.code && REPLY_REFUSALS[error.code]) return REPLY_REFUSALS[error.code];
  if (error instanceof ApiError && error.status === 404) return 'That message no longer exists.';
  return describeError(error);
}

export function useSendReply() {
  const client = useQueryClient();
  return React.useCallback(
    async (message: AdminOwnerMessage, body: string): Promise<void> => {
      const key = `reply-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const sentAt = new Date().toISOString();
      setReplies([...replies.slice(-49), { key, messageId: message.id, body, sentAt, state: 'sending', recipient: null, error: null }]);
      // site-api files it as replied once the mail leaves, unless it is archived.
      const guess: AdminOwnerMessage = message.state === 'archived' ? message : { ...message, state: 'replied', repliedAt: sentAt, updatedAt: sentAt };
      await client.cancelQueries({ queryKey: messageKeys.lists });
      applyMove(client, message, guess);
      try {
        const response = await apiSend<AdminOwnerMessageReplyResponse>('POST', `admin/messages/${encodeURIComponent(message.id)}/reply`, { body });
        applyMove(client, guess, response.message);
        patchReply(key, { state: 'sent', recipient: response.recipientEmail });
      } catch (error) {
        applyMove(client, guess, message);
        patchReply(key, { state: 'failed', error: replyError(error) });
      } finally {
        void client.invalidateQueries({ queryKey: messageKeys.lists });
      }
    },
    [client],
  );
}
