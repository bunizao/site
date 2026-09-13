// Drives /dev/blog/[id] from a parent frame — the koenig-editor live preview
// pane. See plans/koenig-editor.md ("Live preview") for the full channel
// contract. The parent posts `{type:'buxx:draft', html}` on every debounced
// edit; this module renders it through /dev/blog/render and swaps the
// article, pausing the existing HEAD poll (draft-live-reload.ts) while the
// parent is talking and resuming it after a period of silence.
//
// Split into pure functions (message validation, coalescing) plus one DOM-
// touching entry point, because this repo's unit tests run under bun with no
// DOM — only the pure half is unit-testable here; the wiring is covered by
// the Playwright preview-channel test.

import type { DirectiveWarning } from '@/features/posts/server/directives/types';
import { initProse } from './prose';
import type { GhostDraftLiveReloadController } from './draft-live-reload';

const RESUME_AFTER_SILENCE_MS = 10_000;

export interface DraftMessage {
  type: 'buxx:draft';
  html: string;
}

/** Validates an incoming postMessage payload. Anything else is ignored, silently. */
export function parseDraftMessage(data: unknown): DraftMessage | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  if (value.type !== 'buxx:draft' || typeof value.html !== 'string') return null;
  return { type: 'buxx:draft', html: value.html };
}

/** A message is only ever trusted from the one configured Ghost admin origin. */
export function isTrustedParentOrigin(origin: string, expected: string | null): boolean {
  return expected !== null && expected !== '' && origin === expected;
}

/**
 * Wraps an async `run` so that a call arriving while one is in flight does
 * not start a second, overlapping render — it replaces whatever call was
 * already queued and runs once the in-flight one finishes. A burst of N
 * keystroke-triggered messages therefore runs `run` at most twice: once for
 * the call that was already in flight, once for the latest queued value.
 */
export function createCoalescedRunner<T>(run: (value: T) => Promise<void>): (value: T) => void {
  let running = false;
  let queued: T | undefined;
  let hasQueued = false;

  const start = (value: T): void => {
    running = true;
    void run(value)
      .catch(() => {
        // A failed render must not wedge the coalescer — the next message
        // (or the queued one) still gets its turn.
      })
      .finally(() => {
        running = false;
        if (hasQueued) {
          const next = queued as T;
          hasQueued = false;
          queued = undefined;
          start(next);
        }
      });
  };

  return (value: T): void => {
    if (running) {
      queued = value;
      hasQueued = true;
      return;
    }
    start(value);
  };
}

interface DraftRenderResponse {
  html: string;
  warnings: readonly DirectiveWarning[];
  /** Publish readiness and credits, relayed to the editor as-is. */
  readiness?: unknown;
  authorshipCredits?: unknown;
}

function isDraftRenderResponse(value: unknown): value is DraftRenderResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.html === 'string' && Array.isArray(record.warnings);
}

function renderWarnings(prose: HTMLElement, warnings: readonly DirectiveWarning[]): void {
  const article = prose.parentElement;
  if (!article) return;

  let aside = article.querySelector<HTMLElement>('.blog-preview-warnings');
  if (warnings.length === 0) {
    aside?.remove();
    return;
  }

  if (!aside) {
    aside = document.createElement('aside');
    aside.className = 'blog-preview-warnings';
    aside.setAttribute('role', 'alert');
    const heading = document.createElement('strong');
    heading.textContent = 'Preview warnings';
    aside.append(heading, document.createElement('ul'));
    prose.before(aside);
  }

  const list = aside.querySelector('ul') ?? aside.appendChild(document.createElement('ul'));
  list.replaceChildren(...warnings.map((warning) => {
    const item = document.createElement('li');
    item.textContent = warning.message;
    return item;
  }));
}

export interface DraftLiveChannelOptions {
  /** The `[data-ghost-draft-preview]` container — carries the post id and the trusted parent origin. */
  root: HTMLElement;
  /** The HEAD poller this channel pauses while the parent is driving and resumes after it goes quiet. */
  liveReload: GhostDraftLiveReloadController;
}

/**
 * Wires the message listener onto `window`. A no-op when the page was not
 * built with a configured Ghost admin origin (`data-preview-parent-origin`
 * absent or empty) — the page then behaves exactly as it did before this
 * channel existed.
 */
interface DraftRenderJob {
  html: string;
  // Captured per-message rather than assumed to be window.parent: replies go
  // to whichever window actually sent the message, at the origin it sent it
  // from — the trust check already proved that origin is the configured one.
  // The Ghost admin origin is always a Window (a frame), never a
  // MessagePort/ServiceWorker — narrowed at the one call site below, where
  // `event.source` comes from a `window.postMessage` in that frame.
  replySource: Window;
  replyOrigin: string;
}

export function initDraftLiveChannel(options: DraftLiveChannelOptions): void {
  const { root, liveReload } = options;
  const parentOrigin = root.dataset.previewParentOrigin?.trim() || null;
  if (!parentOrigin) return;

  const prose = root.querySelector<HTMLElement>('.blog-prose');
  const postId = root.dataset.previewPostId?.trim();
  if (!prose || !postId) return;

  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleResume = (): void => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => liveReload.resume(), RESUME_AFTER_SILENCE_MS);
  };

  const applyDraft = createCoalescedRunner(async (job: DraftRenderJob): Promise<void> => {
    const reply = (message: unknown): void => {
      // Positional targetOrigin, not the {targetOrigin} options object — the
      // latter is unsupported on Safari 15, which this site still targets.
      job.replySource.postMessage(message, job.replyOrigin);
    };

    let response: Response;
    try {
      response = await fetch('/dev/blog/render', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: postId, html: job.html }),
      });
    } catch {
      reply({ type: 'buxx:rendered', ok: false, status: 0 });
      return;
    }

    if (!response.ok) {
      reply({ type: 'buxx:rendered', ok: false, status: response.status });
      return;
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!isDraftRenderResponse(payload)) {
      reply({ type: 'buxx:rendered', ok: false, status: 502 });
      return;
    }

    prose.innerHTML = payload.html;
    initProse(prose);
    renderWarnings(prose, payload.warnings);
    reply({ type: 'buxx:warnings', warnings: payload.warnings });
    if (payload.readiness !== undefined) {
      reply({
        type: 'buxx:readiness',
        readiness: payload.readiness,
        authorshipCredits: payload.authorshipCredits ?? [],
      });
    }
    reply({ type: 'buxx:rendered', ok: true });
  });

  window.addEventListener('message', (event: MessageEvent) => {
    if (!isTrustedParentOrigin(event.origin, parentOrigin)) return;
    const message = parseDraftMessage(event.data);
    // Not `event.source instanceof Window`: for a genuinely cross-origin
    // sender (the real case — Ghost admin is a different origin from the
    // site) the platform nulls out the WindowProxy's prototype on
    // cross-origin access, so that check is false even for a legitimate
    // frame and would silently drop every message. A `window`-level message
    // listener (as opposed to a MessageChannel port or a ServiceWorker's)
    // only ever gets a Window/WindowProxy source, so a null check is the
    // right narrowing here — the trusted-origin check above is what actually
    // gates who gets to speak on this channel.
    if (!message || !event.source) return;
    const replySource = event.source as Window;

    liveReload.pause();
    scheduleResume();
    applyDraft({ html: message.html, replySource, replyOrigin: event.origin });
  });

  if (window.parent !== window) {
    window.parent.postMessage({ type: 'buxx:ready' }, parentOrigin);
  }
}
