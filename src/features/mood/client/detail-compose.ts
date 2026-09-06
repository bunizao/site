/* Wires the presentational compose box (CommentCompose.astro) to
   POST /api/v2/comments with surface: 'mood'. Mirrors the minimum of
   src/features/comments/client/comments-controller.ts's submit path --
   Turnstile warm/solve, the dwell token, the email-optional two-press
   confirm, and the same error copy -- without its reader-session phases
   (`claimed`/`ready`) or the subscribe nudge, neither of which mood
   comments have.

   Submission and rendering are deliberately two files: this one owns the
   fetch, detail-comments-controller.ts owns the DOM. insertOwnComment() is
   the seam -- both modules are singletons (one import per specifier), so
   calling it here reaches the same rendered thread the controller built. */

import type { CommentCreateInput, CommentCreateResult } from '@bunizao/contracts/comments';
import {
  confirmAnonymousSubmit,
  resetAnonymousConfirm,
  sayComposeAlert,
  validateCompose,
  wireComposeValidation,
} from '@/features/comments/compose-validate';
import { wireDrafts } from '@/features/comments/client/drafts';
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
import { commentsCopy } from '@/features/comments/copy';
import { createCommentReplyQuote, readCommentReplyTarget } from '@/features/mood/shared/comments';
import { insertOwnComment, type CommentData } from '@/features/mood/client/detail-comments-controller';

const TURNSTILE_ACTION = 'mood_comment_create' as const;
// Same English table the blog's error/validation copy comes from --
// data-locale="en" on the compose box is what makes copyFor() resolve to it
// too, so the two never say the refusal two different ways.
const t = commentsCopy.en;

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

function armReply(box: HTMLElement, parentId: string, author: string, text: string): void {
  box.dataset.replyTarget = parentId;
  const chip = box.querySelector<HTMLElement>('[data-reply-chip]');
  const quoteHost = chip?.querySelector<HTMLElement>('[data-reply-quote]');
  if (!chip || !quoteHost) return;
  const target = readCommentReplyTarget({ id: parentId, author, text });
  quoteHost.replaceChildren(target ? createCommentReplyQuote(target) : document.createTextNode(author));
  chip.hidden = false;
  box.querySelector<HTMLTextAreaElement>('.blog-compose__field')?.focus();
}

function disarmReply(box: HTMLElement): void {
  delete box.dataset.replyTarget;
  const chip = box.querySelector<HTMLElement>('[data-reply-chip]');
  if (chip) chip.hidden = true;
  chip?.querySelector<HTMLElement>('[data-reply-quote]')?.replaceChildren();
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

async function handleSubmit(box: HTMLElement): Promise<void> {
  if (!validateCompose(box)) return;
  if (!confirmAnonymousSubmit(box)) return;

  const field = box.querySelector<HTMLTextAreaElement>('.blog-compose__field');
  const text = field?.value.trim() ?? '';
  const identity = readIdentity(box);
  if (!identity) return;

  const postId = box.dataset.postId ?? '';
  const parentId = box.dataset.replyTarget || null;
  const turnstileSiteKey = box.dataset.turnstileSiteKey ?? '';

  setSubmitEnabled(box, false);
  sayComposeAlert(box, null);
  const heldNote = box.querySelector<HTMLElement>('[data-compose-held]');
  if (heldNote) heldNote.hidden = true;

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
    locale: 'en',
  };

  const response = await postJson<CommentCreateResult>('/api/v2/comments', input);
  releaseTurnstileToken(TURNSTILE_ACTION);
  warmTurnstileToken(turnstileSiteKey, TURNSTILE_ACTION);
  void mintDwellToken(true);
  setSubmitEnabled(box, true);

  if (!response.ok) {
    const failure = describeCommentFailure(response.status, response.slug, t.submitError);
    box.dataset.receipt = 'error';
    const docsHref = commentErrorDocsHref(failure.code);
    sayComposeAlert(box, failure.message, failureTag(failure), docsHref ? { href: docsHref, label: t.errorHelp } : null);
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
  resetAnonymousConfirm(box);

  const { outcome, comment } = response.data;

  if (outcome === 'held') {
    box.dataset.receipt = 'held';
    if (heldNote) heldNote.hidden = false;
    field!.value = '';
    field!.dispatchEvent(new Event('input', { bubbles: true }));
    disarmReply(box);
    return;
  }

  box.dataset.receipt = 'posted';
  field!.value = '';
  field!.dispatchEvent(new Event('input', { bubbles: true }));
  disarmReply(box);

  const moodComment: CommentData = {
    id: comment.id,
    author: comment.author.name,
    authorAvatar: safeReaderAvatarUrl(comment.author.avatarUrl) || undefined,
    datetime: comment.createdAt,
    content: commentMarkdownToHtml(comment.body),
    reactions: [],
    origin: 'web',
    commentId: comment.id,
    anchorToken: comment.anchorToken,
  };
  insertOwnComment(moodComment);
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

export function initMoodCommentCompose(): void {
  const box = document.querySelector<HTMLElement>('[data-mood-compose]');
  if (!box) return;

  wireComposeValidation();
  wireDrafts();
  void mintDwellToken();

  const turnstileHost = box.querySelector<HTMLElement>('[data-turnstile-host]');
  const turnstileSiteKey = box.dataset.turnstileSiteKey ?? '';
  if (turnstileHost) setTurnstileHost(TURNSTILE_ACTION, turnstileHost);
  const warm = () => warmTurnstileToken(turnstileSiteKey, TURNSTILE_ACTION);
  if (typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        warm();
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(box);
  }
  box.addEventListener('focusin', warm, { once: true });

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
