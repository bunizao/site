import type { BroadcastAudience, BroadcastRecord, NotifyChannel } from '@bunizao/contracts';
import type { Tone } from '../moderation/ui';
import { CHANNELS, DELIVERY_LABELS, channelsText } from './model';

/* Pure pieces of the broadcast screen: what a row's state means, how an
   audience reads, and the draft the composer keeps between visits. */

/** site-api stores `failed` for three different endings; the owner needs
    to tell them apart. `finalizeBroadcastRow` marks a send with any failure
    as failed, and `failBroadcastRow` marks one whose job stopped early. */
export type BroadcastState = 'draft' | 'sending' | 'sent' | 'partial' | 'failed' | 'stopped';

type Counts = Pick<BroadcastRecord, 'status' | 'recipientCount' | 'sentCount' | 'failedCount'>;

export function broadcastState(row: Counts): BroadcastState {
  if (row.status !== 'failed') return row.status;
  if (row.sentCount + row.failedCount < row.recipientCount) return 'stopped';
  return row.sentCount > 0 ? 'partial' : 'failed';
}

export const STATE_LABELS: Record<BroadcastState, string> = {
  draft: 'Draft',
  sending: 'Sending',
  sent: 'Sent',
  partial: 'Partly failed',
  failed: 'Failed',
  stopped: 'Stopped',
};

export const STATE_TONE: Record<BroadcastState, Tone> = {
  draft: 'neutral',
  sending: 'neutral',
  sent: 'neutral',
  partial: 'warning',
  failed: 'danger',
  stopped: 'neutral',
};

export function attempted(row: Counts): number {
  return row.sentCount + row.failedCount;
}

/** Share of recipients attempted, 0 to 100. */
export function percent(row: Counts): number {
  return row.recipientCount > 0 ? Math.min(100, Math.floor((attempted(row) / row.recipientCount) * 100)) : 0;
}

/** Time left at the rate so far, or null while there is too little to go on. */
export function etaText(row: Counts & Pick<BroadcastRecord, 'createdAt'>, now = Date.now()): string | null {
  const done = attempted(row);
  const elapsed = now - Date.parse(row.createdAt);
  if (done === 0 || !(elapsed > 5_000)) return null;
  const left = ((row.recipientCount - done) * elapsed) / done;
  if (left < 60_000) return 'under a minute left';
  return `about ${Math.round(left / 60_000)} min left`;
}

export function audienceText(audience: BroadcastAudience): string {
  const status = audience.status === 'pending' ? 'Pending' : 'Active';
  const modes = audience.deliveryModes?.length ? ` · ${audience.deliveryModes.map((mode) => DELIVERY_LABELS[mode]).join(', ')}` : '';
  const every = CHANNELS.every((channel) => audience.channels.includes(channel));
  return `${status} on ${every ? 'all channels' : channelsText(audience.channels)}${modes}`;
}

/** One cache key per audience, whatever order the channels were picked in. */
export function audienceKey(status: string, channels: readonly NotifyChannel[]): string {
  return `${status}:${[...channels].sort().join(',')}`;
}

/** A stored message body as a page for a sandboxed frame. site-api keeps
    the inner HTML only; the shell here is plain, and links open outside. */
export function emailDocument(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;padding:24px 20px;background:#fff;color:#111;font:15px/1.65 system-ui,-apple-system,sans-serif;overflow-wrap:anywhere}body>*:last-child{margin-bottom:0!important}</style></head><body>${bodyHtml}</body></html>`;
}

/** The preview site-api renders is a whole document; links open outside. */
export function previewDocument(html: string): string {
  return html.replace(/<head>/i, '<head><base target="_blank">');
}

/* The draft. It lives in memory while the app runs and in localStorage
   across reloads, so closing the composer never loses a word, and one
   store serves the composer, Duplicate and Undo. `key` is the
   idempotency key of the send being confirmed: kept with the draft so a
   retry after a lost response, even from a reload, cannot send twice, and
   dropped whenever the message or audience changes. */

export interface Draft {
  subject: string;
  body: string;
  status: 'active' | 'pending';
  channels: NotifyChannel[];
  key: string | null;
}

export const DEFAULT_CHANNELS: NotifyChannel[] = ['blog', 'mood'];
const STORAGE_KEY = 'portal:broadcast-draft';

export function emptyDraft(): Draft {
  return { subject: '', body: '', status: 'active', channels: [...DEFAULT_CHANNELS], key: null };
}

export function isBlank(draft: Draft): boolean {
  return !draft.subject.trim() && !draft.body.trim();
}

let current: Draft | null = null;

export function loadDraft(): Draft {
  if (current) return current;
  current = emptyDraft();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Draft> | null;
    if (saved && typeof saved === 'object') {
      current = {
        subject: typeof saved.subject === 'string' ? saved.subject : '',
        body: typeof saved.body === 'string' ? saved.body : '',
        status: saved.status === 'pending' ? 'pending' : 'active',
        channels: Array.isArray(saved.channels) ? CHANNELS.filter((channel) => saved.channels!.includes(channel)) : [...DEFAULT_CHANNELS],
        key: typeof saved.key === 'string' ? saved.key : null,
      };
    }
  } catch {
    // Storage blocked or a bad value: start blank.
  }
  return current;
}

const listeners = new Set<() => void>();

/** For useSyncExternalStore: the composer and an Undo anywhere share it. */
export function subscribeDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function saveDraft(draft: Draft): void {
  if (draft === current) return;
  current = draft;
  for (const listener of listeners) listener();
  try {
    if (isBlank(draft) && !draft.key) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Memory still has it.
  }
}

/** A later draft with the key dropped if what would be sent changed. */
export function editDraft(draft: Draft, patch: Partial<Omit<Draft, 'key'>>): Draft {
  const next = { ...draft, ...patch };
  const same =
    next.subject === draft.subject
    && next.body === draft.body
    && next.status === draft.status
    && audienceKey(next.status, next.channels) === audienceKey(draft.status, draft.channels);
  return same ? next : { ...next, key: null };
}
