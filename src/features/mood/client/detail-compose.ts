/* Wires the presentational compose box (CommentCompose.astro) to
   POST /api/v2/comments with surface: 'mood'. Mirrors the minimum of
   src/features/comments/client/comments-controller.ts's submit path --
   Turnstile warm/solve, the dwell token, the optimistic row, the verdict
   poll, and the same error copy -- without its reader-session phases
   (`claimed`/`ready`) or the subscribe nudge, neither of which mood
   comments have.

   Submission and rendering are deliberately two files: this one owns the
   fetch, detail-comments-controller.ts owns the DOM. The ghost-row functions
   are the seam -- both modules are singletons (one import per specifier), so
   calling them here reaches the same rendered thread the controller built. */

import type { CommentCreateInput, CommentCreateResult, CommentListResult } from '@bunizao/contracts/comments';
import {
  sayComposeAlert,
  validateCompose,
  wireComposeValidation,
} from '@/features/comments/compose-validate';
import { wireDrafts } from '@/features/comments/client/drafts';
import { collectClientEvidence, warmClientEvidence } from '@/features/comments/client/client-evidence';
import {
  describeCommentFailure,
  failureTag,
  readErrorSlug,
  commentErrorDocsHref,
} from '@/features/comments/comment-error';
import {
  challengeTurnstile,
  getTurnstileToken,
  releaseTurnstileToken,
  setTurnstileHost,
  warmTurnstileToken,
} from '@/features/comments/client/turnstile-token';
import { commentMarkdownToHtml } from '@/features/comments/comment-markdown';
import { safeReaderAvatarUrl } from '@/features/comments/reader-avatar';
import { copyFor } from '@/features/comments/copy';
import { createCommentReplyQuote, readCommentReplyTarget } from '@/features/mood/shared/comments';
import {
  dropGhostComment,
  insertGhostComment,
  replaceGhostComment,
  settleOwnComment,
  type CommentData,
} from '@/features/mood/client/detail-comments-controller';

const TURNSTILE_ACTION = 'mood_comment_create' as const;

// The same browser evidence the blog box sends. Without it every mood comment
// scored `no_client`, and a reader on a proxy plus an unsure AI reading was
// enough to be asked for an email. Stamped on first intent, before the lazy
// import, so its network time is not counted as reading time.
let armedAt: number | undefined;
let validationErrors = 0;
function armEvidence(): void {
  if (armedAt !== undefined) return;
  armedAt = Math.round(performance.now());
  warmClientEvidence();
}
// Same table the blog's error/validation copy comes from -- `data-locale` on
// the compose box is what makes copyFor() resolve it here too, so the two
// never say the refusal two different ways. Read per submit rather than at
// module load: the language belongs to the page, not to the bundle.
// Narrowed to the contract's own union: anything else is the site's locale,
// the same rule resolveCommentsCopy applies.
const readLocale = (box: HTMLElement): 'zh' | 'en' =>
  box.dataset.locale === 'en' ? 'en' : 'zh';

function readWebsite(box: HTMLElement): string {
  return box.querySelector<HTMLInputElement>('[data-honeypot]')?.value ?? '';
}

function readIdentity(box: HTMLElement): { displayName: string; email: string } | null {
  const name = box.querySelector<HTMLInputElement>('[data-compose-identity] input[type="text"]')?.value.trim() ?? '';
  const email = box.querySelector<HTMLInputElement>('[data-compose-identity] input[type="email"]')?.value.trim() ?? '';
  if (!name) return null;
  return { displayName: name, email };
}

function setSubmitEnabled(box: HTMLElement, enabled: boolean): void {
  const submit = box.querySelector<HTMLButtonElement>('[data-compose-submit]');
  if (submit) submit.disabled = !enabled;
}

function hostTurnstileIn(box: HTMLElement): void {
  const host = box.querySelector<HTMLElement>('[data-turnstile-host]');
  if (host) setTurnstileHost(TURNSTILE_ACTION, host);
}

// ---------------------------------------------------------------------------
// Reply chip -- "Reply" on a rendered comment (detail-comments-controller.ts)
// arms this box for one parentId; the chip shows what it is answering and a
// way out of it. Kept as plain data attributes rather than a function call
// into the controller so the two modules stay decoupled either direction.
// ---------------------------------------------------------------------------

function expandCompose(box: HTMLElement): void {
  box.querySelector<HTMLElement>('[data-compose-shell]')?.setAttribute('data-open', '');
}

function collapseCompose(box: HTMLElement): void {
  box.querySelector<HTMLElement>('[data-compose-shell]')?.removeAttribute('data-open');
}

/* The capsule grows with the message instead of reserving space for it. The
   cap keeps a pasted essay from pushing the thread off screen; past it the
   textarea scrolls like any other. */
const COMPOSE_FIELD_MAX = 260;

function fitComposeField(field: HTMLTextAreaElement): void {
  field.style.height = 'auto';
  field.style.height = `${Math.min(field.scrollHeight, COMPOSE_FIELD_MAX)}px`;
}

/* The capsule opens on intent and closes again when the reader leaves it
   empty. It never closes over typed text, and never over an error nobody has
   read yet -- the held receipt sits outside it either way, so a post stays
   acknowledged after the frame is gone. */
/* Plain focus() scrolls the nearest clipped ancestor, and mid-open the reveal
   is exactly that: its content is taller than its box, so the browser scrolls
   it ~20px to bring the caret into view. The placeholder then rides that
   offset until the box grows past it and the scroll clamps back to zero --
   the jump on every open. The capsule is brought into view here instead,
   where the page can scroll rather than the clipped box. */
function focusComposeField(field: HTMLTextAreaElement): void {
  field.focus({ preventScroll: true });
  const shell = field.closest<HTMLElement>('[data-compose-shell]');
  if (!shell) return;
  const rect = shell.getBoundingClientRect();
  if (rect.top < 0 || rect.bottom > window.innerHeight) {
    shell.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function wireComposeShell(box: HTMLElement): void {
  const shell = box.querySelector<HTMLElement>('[data-compose-shell]');
  const seed = box.querySelector<HTMLButtonElement>('[data-compose-seed]');
  const field = box.querySelector<HTMLTextAreaElement>('.blog-compose__field');
  if (!shell || !seed || !field) return;

  seed.addEventListener('click', () => {
    expandCompose(box);
    fitComposeField(field);
    focusComposeField(field);
  });

  field.addEventListener('input', () => fitComposeField(field));

  /* Arriving from the feed's comment button. The box opens, but focus stays
     put -- pulling up a keyboard on a page the reader has not seen yet is
     not what the tap asked for. */
  if (window.location.hash === '#comments') expandCompose(box);

  field.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || field.value.trim()) return;
    collapseCompose(box);
    seed.focus();
  });

  shell.addEventListener('focusout', (event) => {
    const next = event.relatedTarget as Node | null;
    if (next && shell.contains(next)) return;
    if (field.value.trim()) return;
    const alert = box.querySelector<HTMLElement>('[data-compose-error]');
    if (alert && !alert.hidden) return;
    collapseCompose(box);
  });
}

/* The three attributes are what lets a refused write put the chip back
   exactly as it was -- the rendered quote is markup, not something to read a
   target back out of. */
function readReplyChip(box: HTMLElement): { id: string; author: string; text: string } | null {
  const id = box.dataset.replyTarget;
  if (!id) return null;
  return { id, author: box.dataset.replyAuthor ?? '', text: box.dataset.replyText ?? '' };
}

function armReply(box: HTMLElement, parentId: string, author: string, text: string): void {
  box.dataset.replyTarget = parentId;
  box.dataset.replyAuthor = author;
  box.dataset.replyText = text;
  expandCompose(box);
  const chip = box.querySelector<HTMLElement>('[data-reply-chip]');
  const quoteHost = chip?.querySelector<HTMLElement>('[data-reply-quote]');
  if (!chip || !quoteHost) return;
  const target = readCommentReplyTarget({ id: parentId, author, text });
  quoteHost.replaceChildren(target ? createCommentReplyQuote(target) : document.createTextNode(author));
  chip.hidden = false;
  const field = box.querySelector<HTMLTextAreaElement>('.blog-compose__field');
  if (field) focusComposeField(field);
}

function disarmReply(box: HTMLElement): void {
  delete box.dataset.replyTarget;
  delete box.dataset.replyAuthor;
  delete box.dataset.replyText;
  const chip = box.querySelector<HTMLElement>('[data-reply-chip]');
  if (chip) chip.hidden = true;
  chip?.querySelector<HTMLElement>('[data-reply-quote]')?.replaceChildren();
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

async function handleSubmit(box: HTMLElement): Promise<void> {
  if (!validateCompose(box)) {
    validationErrors += 1;
    return;
  }

  const field = box.querySelector<HTMLTextAreaElement>('.blog-compose__field');
  const text = field?.value.trim() ?? '';
  const identity = readIdentity(box);
  if (!identity) return;

  const postId = box.dataset.postId ?? '';
  const parentId = box.dataset.replyTarget || null;
  const turnstileSiteKey = box.dataset.turnstileSiteKey ?? '';

  setSubmitEnabled(box, false);
  sayComposeAlert(box, null);
  const submittedEvidence = collectClientEvidence({
    kind: 'comment',
    armedAt,
    validationErrors,
    turnstileAction: TURNSTILE_ACTION,
  });

  // Everything the reader can see happens here, before a byte leaves the
  // browser -- the same trade the blog's compose box makes. A Turnstile solve
  // plus a moderation call is two to four seconds of a form that has visibly
  // stopped working, for a comment that is going to be accepted. The words
  // are already written and the thread has room for them; the one honest use
  // of the round trip is to correct the page if it turns out wrong, which is
  // what the refusal branch below does.
  const ghostKey = `pending-${Date.now()}`;
  insertGhostComment(ghostKey, {
    author: identity.displayName,
    datetime: new Date().toISOString(),
    content: commentMarkdownToHtml(text),
    reactions: [],
    origin: 'web',
  });
  // Cleared and left writable: a reader with a second thing to say can start
  // it while the first is in the air. The synthetic `input` is what drafts.ts
  // listens on -- it drops the saved copy, and a programmatic write does not
  // fire it on its own.
  const replyTarget = parentId ? readReplyChip(box) : null;
  field!.value = '';
  field!.dispatchEvent(new Event('input', { bubbles: true }));
  disarmReply(box);

  hostTurnstileIn(box);
  const turnstileToken = await getTurnstileToken(turnstileSiteKey, TURNSTILE_ACTION);

  const input: CommentCreateInput = {
    surface: 'mood',
    postId,
    body: text,
    parentId,
    displayName: identity.displayName,
    email: identity.email,
    turnstileToken,
    website: readWebsite(box),
    dwellToken: await mintDwellToken(),
    notifyReplies: false,
    locale: readLocale(box),
    ...(await submittedEvidence),
  };

  const response = await postJson<CommentCreateResult>('/api/v2/comments', input);
  releaseTurnstileToken(TURNSTILE_ACTION);
  warmTurnstileToken(turnstileSiteKey, TURNSTILE_ACTION);
  void mintDwellToken(true);
  setSubmitEnabled(box, true);

  if (!response.ok) {
    // Take it all back, in the order it was given: the row goes, the words
    // return to the box they were written in, and the reply chip comes back
    // over the comment it was answering. Then the complaint, in the same slot
    // an unfinished field uses -- a rate limit and a dropped connection want
    // opposite next moves, so it says which refusal this was.
    dropGhostComment(ghostKey);
    // The box stayed writable while the request was out, and a refusal can
    // take seconds: keep whatever was typed since, after the refused words.
    field!.value = field!.value.trim() ? `${text}\n\n${field!.value}` : text;
    field!.dispatchEvent(new Event('input', { bubbles: true }));
    if (replyTarget) armReply(box, replyTarget.id, replyTarget.author, replyTarget.text);
    const t = copyFor(box);
    const failure = describeCommentFailure(response.status, response.slug, t.submitError);
    box.dataset.receipt = 'error';
    const docsHref = commentErrorDocsHref(failure.code);
    sayComposeAlert(box, failure.message, failureTag(failure), docsHref ? { href: docsHref, label: t.errorHelp } : null);
    if (failure.code === 'NOMAIL') {
      box.querySelector<HTMLInputElement>('[data-compose-identity] input[type="email"]')?.focus();
    }
    if (failure.code === 'BOT' && box.dataset.botRetry !== 'spent') {
      box.dataset.botRetry = 'spent';
      hostTurnstileIn(box);
      box.querySelector('[data-turnstile-host]')?.scrollIntoView({ block: 'nearest' });
      const retryToken = await challengeTurnstile(turnstileSiteKey, TURNSTILE_ACTION);
      if (retryToken) void handleSubmit(box);
    }
    return;
  }

  delete box.dataset.botRetry;

  const { outcome, comment } = response.data;
  box.dataset.receipt = 'posted';

  replaceGhostComment(ghostKey, {
    id: comment.id,
    author: comment.author.name,
    authorAvatar: safeReaderAvatarUrl(comment.author.avatarUrl) || undefined,
    datetime: comment.createdAt,
    content: commentMarkdownToHtml(comment.body),
    reactions: [],
    origin: 'web',
    commentId: comment.id,
    anchorToken: comment.anchorToken,
  });

  // A comment waiting on its address is settled now: confirming happens in a
  // mail client, far past anything the polls below would wait for.
  if (response.data.awaitingEmail) settleOwnComment(comment.id, true, true);
  else if (outcome === 'held') void upgradeWhenVerdictLands(postId, comment.id);
  else settleOwnComment(comment.id, false);
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

// site-api waits up to 8s for the verdict and finishes the request without it
// past that, so a slow verdict comes back `held` and lands seconds later in a
// `waitUntil` continuation. Probe until it does.
//
// The mood thread's own read path cannot answer this. `/api/comments` is
// edge-cached, viewer-agnostic, and lists only published rows re-attributed
// from the Telegram scrape -- by design, since everyone gets the same thread.
// `/api/v2/comments` is the viewer-aware one: `no-store`, and it serves a
// writer their own held row (comments-data.ts's visibility clause). So the
// poll asks there, and the thread on screen is patched in place.
//
// The gaps widen as the odds of a flip fall: eight probes out to roughly a
// minute and a half, five of them inside the first seventeen seconds where
// nearly every verdict lands.
const VERDICT_POLL_DELAYS_MS = [1500, 2000, 3000, 4000, 6000, 15_000, 30_000, 30_000];

async function upgradeWhenVerdictLands(postId: string, commentId: string): Promise<void> {
  for (const delay of VERDICT_POLL_DELAYS_MS) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    const page = await fetchJson<CommentListResult>(
      `/api/v2/comments?surface=mood&post=${encodeURIComponent(postId)}&limit=20`,
    );
    const match = page?.comments.find((row) => row.id === commentId);
    // Gone from a listing that would show it to its own writer: deleted under
    // us, or never ours to begin with. Either way the wait is over.
    if (!match) return settleOwnComment(commentId, true);
    if (match.status === 'held') continue;
    return settleOwnComment(commentId, match.status !== 'published');
  }
  settleOwnComment(commentId, true);
}

// ---------------------------------------------------------------------------
// Dwell token -- same 24h-lifetime, mint-once-per-page-load contract as the
// blog's. A comment posted seconds after the page loaded is a real fast
// reader, not a bot filling the box the instant it appeared, and only a
// token minted at THIS page load can prove that.
// ---------------------------------------------------------------------------

let dwellToken = '';
let dwellTokenMintedAt = 0;
const DWELL_TOKEN_REFRESH_AGE_MS = 20 * 60 * 60 * 1000;

async function mintDwellToken(force = false): Promise<string> {
  if (!force && dwellToken && Date.now() - dwellTokenMintedAt < DWELL_TOKEN_REFRESH_AGE_MS) {
    return dwellToken;
  }
  const result = await fetchJson<{ token: string }>('/api/v2/comments/dwell-token');
  if (result) {
    dwellToken = result.token;
    dwellTokenMintedAt = Date.now();
  }
  return dwellToken;
}

// ---------------------------------------------------------------------------
// fetch helpers -- same shape as comments-controller.ts's.
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

type PostResult<T> = { ok: true; data: T } | { ok: false; status: number; slug: string };

async function postJson<T>(url: string, body: unknown): Promise<PostResult<T>> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { ok: false, status: response.status, slug: readErrorSlug(await response.json().catch(() => null)) };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, status: 0, slug: '' };
  }
}

// ---------------------------------------------------------------------------

/** Where Return goes from each identity field. The textarea is deliberately
    absent: there, Return is a newline. */
const IDENTITY_NEXT_FIELD: Record<string, string> = {
  'mood-compose-name': 'mood-compose-email',
  'mood-compose-email': 'mood-compose-text',
};

export function initMoodCommentCompose(): void {
  const box = document.querySelector<HTMLElement>('[data-mood-compose]');
  if (!box) return;

  wireComposeShell(box);
  wireComposeValidation();
  wireDrafts();
  void mintDwellToken();

  const turnstileHost = box.querySelector<HTMLElement>('[data-turnstile-host]');
  const turnstileSiteKey = box.dataset.turnstileSiteKey ?? '';
  if (turnstileHost) setTurnstileHost(TURNSTILE_ACTION, turnstileHost);
  // Warm on intent, not on sight. The box sits in the first viewport of most
  // detail pages, so warming on intersection cost every reader ~700 KB of
  // challenge traffic plus a solve, and most of them never write. A pointer
  // landing on the box still buys the solve a head start on the first keystroke.
  const warm = () => warmTurnstileToken(turnstileSiteKey, TURNSTILE_ACTION);
  box.addEventListener('pointerdown', warm, { once: true });
  box.addEventListener('focusin', warm, { once: true });
  box.addEventListener('focusin', armEvidence, { once: true });

  // `enterkeyhint="next"` promises the iOS keyboard moves on to the next
  // field. There is no <form> here, so nothing would honour that promise --
  // Return would just close the keyboard and leave the reader to aim a thumb
  // at the box they were already heading for.
  box.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const nextId = IDENTITY_NEXT_FIELD[(event.target as HTMLElement | null)?.id ?? ''];
    if (!nextId) return;
    event.preventDefault();
    document.getElementById(nextId)?.focus();
  });

  document.addEventListener('click', (event) => {
    const submitBtn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-compose-submit]');
    if (submitBtn && box.contains(submitBtn)) {
      void handleSubmit(box);
      return;
    }

    const replyBtn = (event.target as HTMLElement).closest<HTMLButtonElement>('.mood-comment-reply-btn');
    if (replyBtn) {
      const parentId = replyBtn.dataset.commentReplyParentId ?? '';
      const author = replyBtn.dataset.commentReplyAuthor ?? '';
      const text = replyBtn.dataset.commentReplyText ?? '';
      if (parentId) armReply(box, parentId, author, text);
      return;
    }

    const dismissBtn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-reply-dismiss]');
    if (dismissBtn && box.contains(dismissBtn)) {
      disarmReply(box);
    }
  });
}
