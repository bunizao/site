// Wires the presentational comment thread (CommentsSection.astro,
// CommentForm.astro, IdentityRow.astro) to the real v2 API: fetching the
// thread, submitting a comment or reply, editing, deleting, liking, and the
// lazy-verification "claimed" footer. Those components render markup and
// flip local `hidden`/aria attributes only -- this file owns every fetch.
//
// /blog/[slug] is fully prerendered, so `<CommentsSection>` always ships
// with `state="loading"` and no comments: nothing below `.blog-compose`
// exists in the static HTML until this module builds it. Turnstile's widget
// lifecycle is adapted from subscribe-panel.ts (load/render/reset), run in
// invisible mode since nothing on this surface renders a visible challenge
// box.

import type {
  Comment,
  CommentCreateInput,
  CommentCreateResult,
  CommentEditInput,
  CommentEditResult,
  CommentListResult,
  ReactionBatchResult,
  ReaderMe,
  ReaderMeResult,
} from '@bunizao/contracts/comments';
import {
  MAX_BODY_LENGTH,
  nudgeBodyCount,
  sayComposeAlert,
  validateCompose,
  wireBodyCounter,
} from '@/features/comments/compose-validate';
import {
  describeCommentFailure,
  failureTag,
  readErrorSlug,
} from '@/features/comments/comment-error';
import {
  getTurnstileToken,
  releaseTurnstileToken,
  setTurnstileHost,
  warmTurnstileToken,
} from '@/features/comments/client/turnstile-token';
import { readCommentText, setCommentText } from '@/features/comments/comment-markdown';
import { readReaderEmail, rememberReaderEmail } from '@/lib/reader-email';
import { initials, seedHue } from '@/features/comments/identity';
import { copyFor, type CommentsCopy } from '@/features/comments/copy';
import type { BlogComment, ClaimedIdentity, ComposeReceipt, ReaderPhase } from '@/features/comments/types';

const CLAIMED_STORAGE_KEY = 'buxx:reader';
const PAGE_SIZE = 20;

const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

// ---------------------------------------------------------------------------
// Small DOM builder -- attrs + children, everything through .append() /
// .setAttribute() so dynamic strings (author names, comment bodies) are
// always inserted as text, never parsed as markup.
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) node.append(child);
  return node;
}

/** Fully static SVG markup (icons only, never interpolated data) -- safe to
    parse as HTML once and clone, unlike anything carrying comment text. */
function parseStaticSvg(svg: string): SVGElement {
  const template = document.createElement('template');
  template.innerHTML = svg.trim();
  return template.content.firstElementChild as SVGElement;
}

const REPLY_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"></path></svg>`;
const SEND_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"></path></svg>`;
const EDIT_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z"></path></svg>`;
const TRASH_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 7V5h4v2M6 7l1 12h10l1-12M10 11v5M14 11v5"></path></svg>`;
const GHOST_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M6 6l12 12"></path></svg>`;
const ALERT_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v6M12 16.5h.01"></path></svg>`;
// Byte-for-byte the bubble in CommentsSection.astro's error notice -- the two
// renderers have to agree, and a dashed stroke is easy to let drift.
// Gives the nudge an identity of its own. Without it the row read as a strip
// of controls that happened to sit under the box, which is how a message ends
// up ignored by the people it is for.
const NUDGE_MAIL_SVG = `<svg class="blog-compose__nudge-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="M3.5 7.5l7.3 5.1a2 2 0 0 0 2.4 0l7.3-5.1"></path></svg>`;
const THREAD_ERROR_MARK_SVG = `<svg class="blog-comments__mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 3.5" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="3"></rect><path d="M8.4 16v3.9a.45.45 0 0 0 .75.33L13.6 16"></path></svg>`;

function heartIcon(): SVGElement {
  return parseStaticSvg(
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="${HEART_PATH}"></path></svg>`,
  );
}

function filledHeartIcon(): SVGElement {
  return parseStaticSvg(
    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${HEART_PATH}"></path></svg>`,
  );
}

// ---------------------------------------------------------------------------
// Comment -> BlogComment mapping, and relative-date formatting.
// ---------------------------------------------------------------------------

function formatRelativeDate(iso: string, t: CommentsCopy): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const r = t.relativeDate;
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return r.now;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return r.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return r.hours(hours);
  const days = Math.floor(hours / 24);
  if (days < 30) return r.days(days);
  const months = Math.floor(days / 30);
  if (months < 12) return r.months(months);
  return r.years(Math.floor(months / 12));
}

function toBlogComment(
  comment: Comment,
  reactions: ReactionBatchResult['reactions'],
  t: CommentsCopy,
): BlogComment {
  const reaction = reactions[`comment:${comment.id}`]?.[0];
  return {
    id: comment.id,
    author: comment.tombstone ? '' : comment.author.name,
    date: formatRelativeDate(comment.createdAt, t),
    text: comment.tombstone ? '' : comment.body,
    byAuthor: comment.author.byAuthor,
    held: comment.status === 'held',
    isReply: comment.parentId !== null,
    likes: reaction?.count ?? 0,
    liked: reaction?.reacted ?? false,
    own: comment.mine,
    editDeadline: comment.editableUntil ?? undefined,
    edited: Boolean(comment.editedAt),
    tombstone: comment.tombstone,
  };
}

/** Groups the flat list the API returns (all roots, newest first, then
    every reply across the whole page ordered oldest-first) into
    root-followed-by-its-own-replies -- the order CommentsSection.astro's
    markup assumes. Threading is one level deep, so this is the only
    grouping pass ever needed. */
function orderForRender(comments: Comment[]): { comment: Comment; parentId: string | null }[] {
  const roots = comments.filter((c) => c.parentId === null);
  const repliesByParent = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parentId === null) continue;
    const bucket = repliesByParent.get(c.parentId) ?? [];
    bucket.push(c);
    repliesByParent.set(c.parentId, bucket);
  }

  const ordered: { comment: Comment; parentId: string | null }[] = [];
  for (const root of roots) {
    ordered.push({ comment: root, parentId: null });
    for (const reply of repliesByParent.get(root.id) ?? []) {
      ordered.push({ comment: reply, parentId: root.id });
    }
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export function initCommentsController(): void {
  const sectionEl = document.querySelector<HTMLElement>('.blog-comments[data-post-id]');
  const postIdValue = sectionEl?.dataset.postId;
  const composeEl = sectionEl?.querySelector<HTMLElement>('.blog-compose:not(.blog-reply)');
  if (!sectionEl || !postIdValue || !composeEl) return; // lab/preview pages never hydrate this

  // Narrowed, stable bindings -- nested function declarations below close
  // over these, and TS does not carry a guard's narrowing across a closure
  // boundary, so the plain `sectionEl`/`postIdValue`/`composeEl` names stay
  // typed as non-null everywhere they are used past this point.
  const section: HTMLElement = sectionEl;
  const postId: string = postIdValue;
  const compose: HTMLElement = composeEl;

  // Same table CommentsSection.astro rendered from -- found through
  // `data-locale` on the section rather than imported, so this controller
  // never has to know which locale the page was built in.
  const t = copyFor(section);

  const turnstileSiteKey = section.dataset.turnstileSiteKey ?? '';
  const head = section.querySelector<HTMLElement>('.blog-comments__head');

  let claimed: ClaimedIdentity | null = readClaimedIdentity();
  let phase: ReaderPhase = claimed ? 'claimed' : 'anonymous';
  let viewer: ReaderMe | null = null;
  let dwellToken = '';
  let nextBefore: string | null = null;
  let total = 0;
  let list: HTMLElement;
  let replyBox: HTMLElement;
  let replyField: HTMLTextAreaElement;
  let moreButton: HTMLButtonElement | null = null;

  applyPhase(compose, phase, claimed, viewer);
  void mintDwellToken();

  // A Turnstile solve costs ~2.3s. Asked for at submit time it landed entirely
  // between the press of Post and the request leaving the browser -- the one
  // stretch of the whole flow where the reader has finished their part and is
  // watching a spinner.
  //
  // Two triggers, both ahead of the press and both cheap. Reaching the thread
  // is the earliest honest signal of intent: a reader scrolled past the whole
  // post to get here, and the solve then overlaps the time they spend reading
  // other people's comments rather than the time they spend waiting on their
  // own. Focus stays as the backstop for anyone who lands on an anchor or
  // tabs straight in. Neither fires on page load -- that would fetch
  // Cloudflare's script for every reader of every post, and most of them
  // never write anything.
  const turnstileHost = compose.querySelector<HTMLElement>('[data-turnstile-host]');
  if (turnstileHost) setTurnstileHost('blog_comment_create', turnstileHost);

  const warmCreate = () => warmTurnstileToken(turnstileSiteKey, 'blog_comment_create');
  if (typeof IntersectionObserver === 'function') {
    // rootMargin buys the solve a head start on the scroll that reveals the
    // box, so it is usually finished by the time anyone reads far enough to
    // type. Once only -- the token outlives any number of crossings.
    const watcher = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      watcher.disconnect();
      warmCreate();
    }, { rootMargin: '400px 0px' });
    watcher.observe(section);
  }
  section.addEventListener('focusin', (event) => {
    if ((event.target as HTMLElement).closest('.blog-compose')) warmCreate();
  });

  // Build the "loaded" shell up front -- state="loading"'s skeleton never
  // carries the reply box or list container, so nothing below exists until
  // this runs, real data or not.
  buildLoadedShell();

  void bootstrap();

  async function bootstrap(): Promise<void> {
    const [meResult, pageResult] = await Promise.all([
      fetchJson<ReaderMeResult>(`/api/v2/reader/me`),
      fetchJson<CommentListResult>(`/api/v2/comments?post=${encodeURIComponent(postId)}&limit=${PAGE_SIZE}`),
    ]);

    if (meResult) {
      viewer = meResult.reader;
      if (viewer) {
        phase = 'ready';
      }
      applyPhase(compose, phase, claimed, viewer);
      applyPhase(replyBox, phase, claimed, viewer);
    }

    if (!pageResult) {
      showError();
      return;
    }

    nextBefore = pageResult.nextBefore;
    await renderPage(pageResult.comments);
    setTally(pageResult.total);
    // `total` counts published comments only, but the page also renders the
    // viewer's own held ones -- keying the empty state off the rendered rows
    // stops "no one has been here yet" from sitting above a visible comment.
    toggleEmptyState(pageResult.comments.length === 0);
    setMoreVisible(pageResult.hasMore);
  }

  function buildLoadedShell(): void {
    const skeleton = section.querySelector('.blog-comments__skeleton');
    skeleton?.remove();
    section.querySelector('.blog-comments__empty')?.remove();
    section.querySelector('.blog-comments__error')?.remove();

    list = el('div', { class: 'blog-comments__list' });
    replyBox = buildReplyBox();
    list.append(replyBox);
    section.append(list);

    replyField = replyBox.querySelector<HTMLTextAreaElement>('.blog-compose__field')!;
    applyPhase(replyBox, phase, claimed, viewer);
    wireReplyBoxMechanics();
    // Both boxes exist by now, so one call covers them.
    prefillKnownEmail();
  }

  function showError(): void {
    const error = el(
      'div',
      { class: 'blog-comments__notice blog-comments__error' },
      [
        parseStaticSvg(THREAD_ERROR_MARK_SVG),
        el('p', {}, [t.loadError]),
        el('button', { type: 'button', class: 'blog-comments__more-btn', 'data-retry-load': '' }, [t.retry]),
      ],
    );
    error.querySelector('[data-retry-load]')?.addEventListener('click', () => {
      error.remove();
      void bootstrap();
    }, { once: true });
    section.append(error);
  }

  function toggleEmptyState(empty: boolean): void {
    let node = section.querySelector('.blog-comments__empty');
    if (empty && !node) {
      node = el('p', { class: 'blog-comments__empty' }, [t.empty]);
      list.before(node);
    } else if (!empty) {
      node?.remove();
    }
  }

  function setTally(value: number): void {
    total = value;
    if (!head) return;
    let tally = head.querySelector<HTMLElement>('.blog-comments__tally');
    if (total > 0) {
      if (!tally) {
        tally = el('span', { class: 'blog-comments__tally' });
        head.append(tally);
      }
      tally.textContent = String(total);
    } else {
      tally?.remove();
    }
  }

  function setMoreVisible(hasMore: boolean): void {
    if (!hasMore) {
      moreButton?.closest('.blog-comments__more')?.remove();
      moreButton = null;
      return;
    }
    if (moreButton) return;
    moreButton = el('button', {
      type: 'button',
      class: 'blog-comments__more-btn',
      'data-load-more': '',
    }, [el('span', {}, [t.loadMore])]);
    const wrap = el('div', { class: 'blog-comments__more' }, [moreButton]);
    list.append(wrap);
    moreButton.addEventListener('click', () => void loadMore());
  }

  async function loadMore(): Promise<void> {
    if (!moreButton || !nextBefore) return;
    moreButton.setAttribute('aria-busy', 'true');
    moreButton.disabled = true;
    moreButton.textContent = t.loading;

    const page = await fetchJson<CommentListResult>(
      `/api/v2/comments?post=${encodeURIComponent(postId)}&before=${encodeURIComponent(nextBefore)}&limit=${PAGE_SIZE}`,
    );
    moreButton.closest('.blog-comments__more')?.remove();
    moreButton = null;
    if (!page) return;

    nextBefore = page.nextBefore;
    await renderPage(page.comments);
    setMoreVisible(page.hasMore);
  }

  async function renderPage(comments: Comment[]): Promise<void> {
    if (comments.length === 0) return;
    const targets = comments
      .filter((c) => !c.tombstone)
      .map((c) => `comment:${c.id}`);
    const reactions = targets.length > 0
      ? (await fetchJson<ReactionBatchResult>(`/api/v2/reactions?targets=${encodeURIComponent(targets.join(','))}`))?.reactions ?? {}
      : {};

    for (const { comment, parentId } of orderForRender(comments)) {
      const row = toBlogComment(comment, reactions, t);
      const article = renderCommentRow(row, parentId);
      wireCommentRow(article, row, parentId);
      replyBox.before(article);
    }
  }

  // --- Compose (root) submit ------------------------------------------------

  // Every press of Post is a submit attempt. The identity fields are on screen
  // from first paint (IdentityRow.astro), so there is no second meaning for
  // this click to carry and no sibling script whose ordering matters --
  // handleSubmit runs the same guard the box's own script runs.
  document.addEventListener('click', (event) => {
    const submitBtn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-compose-submit]');
    if (!submitBtn) return;
    const box = submitBtn.closest<HTMLElement>('.blog-compose');
    if (!box) return;
    void handleSubmit(box);
  });

  async function handleSubmit(box: HTMLElement): Promise<void> {
    // The guard marks the first unfinished field and says why -- see
    // compose-validate.ts. Nothing below runs until the box is complete.
    if (!validateCompose(box)) return;

    const field = box.querySelector<HTMLTextAreaElement>('.blog-compose__field');
    const text = field?.value.trim() ?? '';
    const isReply = box === replyBox;
    const parentId = isReply ? box.dataset.replyTarget ?? null : null;
    const identity = readIdentity(box);
    if (!identity) return; // guard passed but the fields are gone -- nothing to send

    // Everything the reader can see happens here, before a single byte leaves
    // the browser. The press used to buy a spinner and a locked field for as
    // long as a Turnstile solve plus a moderation call took -- two to four
    // seconds of a form that had visibly stopped working, for a comment that
    // was going to be accepted. Neither wait is the reader's to sit through:
    // the words are already written, the thread has room for them, and the
    // one honest use of the round trip is to correct the page if it turns out
    // wrong. Which it does, below, on the rare path.
    const replyName = parentId
      ? document.querySelector<HTMLElement>(`[data-reply-to="${cssEscape(parentId)}"]`)?.dataset.replyName ?? ''
      : '';
    const ghost = renderGhostRow(identity.displayName, text, parentId);

    setSubmitEnabled(box, false);
    playSendGesture(box);
    sayComposeAlert(box, null);
    insertNewRow(ghost, parentId);
    toggleEmptyState(false);
    // Cleared and left writable: a reader with a second thing to say can
    // start typing it while the first is still in the air. The synthetic
    // `input` is what drafts.ts listens on -- it drops the saved copy and
    // disarms the unload prompt, neither of which a programmatic write fires
    // on its own.
    field!.value = '';
    field!.dispatchEvent(new Event('input', { bubbles: true }));
    if (isReply) closeReplyBox();
    else showComposeReceipt(box, 'posted');

    // Warm by now in every ordinary case -- the reader focused this box before
    // they could type into it, which is what started the solve.
    const turnstileToken = await getTurnstileToken(turnstileSiteKey, 'blog_comment_create');

    const input: CommentCreateInput = {
      postId,
      body: text,
      parentId,
      displayName: identity.displayName,
      email: identity.email,
      turnstileToken,
      website: (box.querySelector<HTMLInputElement>('[data-honeypot]')?.value ?? ''),
      dwellToken,
      notifyReplies: false,
    };

    const response = await postJson<CommentCreateResult>('/api/v2/comments', input);
    // Spent either way, so a fresh one starts solving now: a reader who posts
    // twice should not pay the widget's 2.3s again on the second comment.
    releaseTurnstileToken('blog_comment_create');
    warmTurnstileToken(turnstileSiteKey, 'blog_comment_create');
    void mintDwellToken();

    setSubmitEnabled(box, true);

    if (!response.ok) {
      // Take it all back, in the order it was given: the row goes, the words
      // return to the box they were written in, and the reply box reopens
      // under the comment it was answering. Then the complaint -- in the same
      // slot an unfinished field uses, saying which refusal it was, because a
      // rate limit and a dropped connection want opposite next moves.
      ghost.remove();
      const parentBody = parentId
        ? list.querySelector<HTMLElement>(`#comment-${cssEscape(parentId)} .blog-comment__body`)
        : null;
      if (parentId && parentBody) openReplyBox(parentId, replyName, parentBody);
      field!.value = text;
      field!.dispatchEvent(new Event('input', { bubbles: true }));
      toggleEmptyState(!list.querySelector('.blog-comment'));
      const failure = describeCommentFailure(response.status, response.slug, t.submitError);
      box.dataset.receipt = 'error';
      sayComposeAlert(box, failure.message, failureTag(failure));
      return;
    }

    const { outcome, comment, unverifiedEmail } = response.data;

    if (phase === 'anonymous') {
      claimed = { name: identity.displayName, email: identity.email };
      writeClaimedIdentity(claimed);
      phase = 'claimed';
      applyPhase(compose, phase, claimed, viewer);
      applyPhase(replyBox, phase, claimed, viewer);
    }

    // The real row, built the one way rows are built, swapped in over the
    // stand-in. Nothing about the placeholder has to be patched into
    // correctness -- it is thrown away whole, which is why it was allowed to
    // guess at the parts it could not know.
    const row = toBlogComment(comment, {}, t);
    row.own = true;
    const article = renderCommentRow(row, parentId);
    wireCommentRow(article, row, parentId);
    // A hold this browser just caused is nearly always the moderation verdict
    // still in flight rather than a decision -- render it as posted until the
    // polls below say otherwise. See markPending.
    if (outcome === 'held') markPending(article);
    if (ghost.isConnected) ghost.replaceWith(article);
    else insertNewRow(article, parentId);
    if (outcome !== 'held') setTally(total + 1);

    // The nudge is not a receipt -- the row above is. It is an offer, and it
    // is the one thing here that genuinely could not be shown before the
    // answer came back, because only the server knows whether this address
    // has ever been confirmed.
    if (!isReply && unverifiedEmail) showComposeReceipt(box, 'nudge');

    if (outcome === 'held') void upgradeWhenVerdictLands(comment.id, parentId, article);
  }

  // The API answers within ~1.5s even while the AI verdict is still in
  // flight: the comment lands as held and flips to published in the
  // background. Probe the list a few times so the writer sees the flip
  // without reloading. A comment that stays held (genuine hold, reject, or
  // an edit during the race) keeps its held rendering -- the wire never
  // says which.
  const VERDICT_POLL_DELAYS_MS = [2500, 3500, 6000];

  /** The row was just written by this browser and came back held. Almost every
      one of those is the classifier still thinking, not a decision, and it
      resolves inside the poll window below -- so the row reads as posted and
      the note carries the softer word until the polls give up on it. Telling a
      reader their comment is "under review" and then silently withdrawing it
      four seconds later is how a thread that works reads as one that does
      not. */
  function markPending(article: HTMLElement): void {
    const note = article.querySelector<HTMLElement>('.blog-comment__note');
    if (!note) return;
    article.dataset.pending = 'true';
    note.textContent = t.verifying;
  }

  /** No verdict inside the window, or one that was not `published`: this is a
      real hold now, and the row says the real thing. */
  /** Add or remove a row's "only you can see this" note after its status has
      moved. `rejected` gets the same note as `held`: both mean the row is
      drawn for its writer and for nobody else, which is the whole claim the
      note makes.

      The action row is deliberately left alone. A row that just became held
      is exactly the one its writer wants to edit again, and the edit window
      has not closed -- stripping the controls to match a fresh render would
      lock them out of fixing the thing they were just told about. */
  function applyHeldState(article: HTMLElement, hidden: boolean): void {
    const existing = article.querySelector<HTMLElement>('.blog-comment__note');
    delete article.dataset.pending;
    if (!hidden) {
      existing?.remove();
      return;
    }
    if (existing) {
      existing.textContent = t.held;
      return;
    }
    const body = article.querySelector<HTMLElement>('.blog-comment__body') ?? article;
    body.append(el('p', { class: 'blog-comment__note' }, [t.held]));
  }

  function settlePending(article: HTMLElement): void {
    const note = article.querySelector<HTMLElement>('.blog-comment__note');
    delete article.dataset.pending;
    if (note) note.textContent = t.held;
  }

  async function upgradeWhenVerdictLands(
    commentId: string,
    parentId: string | null,
    article: HTMLElement,
  ): Promise<void> {
    for (const delay of VERDICT_POLL_DELAYS_MS) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      const page = await fetchJson<CommentListResult>(
        `/api/v2/comments?post=${encodeURIComponent(postId)}&limit=${PAGE_SIZE}`,
      );
      const match = page?.comments.find((c) => c.id === commentId);
      if (!match) {
        settlePending(article);
        return;
      }
      if (match.status === 'held') continue;
      if (match.status !== 'published') {
        settlePending(article);
        return;
      }

      const row = toBlogComment(match, {}, t);
      row.own = true;
      const fresh = renderCommentRow(row, parentId);
      wireCommentRow(fresh, row, parentId);
      if (article.isConnected) article.replaceWith(fresh);
      setTally(total + 1);
      return;
    }
    settlePending(article);
  }

  function insertNewRow(article: HTMLElement, parentId: string | null): void {
    if (!parentId) {
      list.prepend(article);
      return;
    }
    const parentRow = list.querySelector(`#comment-${cssEscape(parentId)}`);
    let anchor: Element | null = parentRow;
    while (anchor?.nextElementSibling && (anchor.nextElementSibling as HTMLElement).dataset.parentId === parentId) {
      anchor = anchor.nextElementSibling;
    }
    if (anchor) anchor.after(article);
    else list.prepend(article);
  }

  function readIdentity(box: HTMLElement): { displayName: string; email: string } | null {
    if (phase === 'ready' && viewer) {
      return { displayName: viewer.displayName, email: '' };
    }
    if (phase === 'claimed' && claimed) {
      return { displayName: claimed.name, email: claimed.email };
    }
    const name = box.querySelector<HTMLInputElement>('[data-compose-identity] input[type="text"]')?.value.trim() ?? '';
    const email = box.querySelector<HTMLInputElement>('[data-compose-identity] input[type="email"]')?.value.trim() ?? '';
    if (!name || !email) return null;
    return { displayName: name, email };
  }

  /** The only thing about the compose box that still waits for the server.
      Not a busy state: the field stays writable and `data-receipt` has
      already moved on to `posted`, so nothing spins. This is a double-post
      guard and nothing more -- one press of Post, one comment.

      `submitting` is therefore a state the live thread no longer enters. It
      is still in ComposeReceipt, still rendered by CommentForm.astro, and
      still styled: /lab/comments draws every receipt on purpose, and a state
      the lab documents is not dead just because the happy path outruns it. */
  /** The arrow leaves and a fresh one arrives -- the one piece of motion the
      press is owed, now that nothing else about the box waits.

      Restarting a CSS animation means the attribute has to actually change,
      and on a second comment it is already set from the first. Removing it and
      setting it again in the same task is not a change as far as the style
      engine is concerned; reading a layout property in between forces it to
      notice. Ugly, and the alternative is duplicating the keyframes in
      JavaScript. */
  function playSendGesture(box: HTMLElement): void {
    const submitBtn = box.querySelector<HTMLElement>('[data-compose-submit]');
    if (!submitBtn) return;
    submitBtn.removeAttribute('data-sent');
    void submitBtn.offsetWidth;
    submitBtn.setAttribute('data-sent', '');
  }

  function setSubmitEnabled(box: HTMLElement, enabled: boolean): void {
    const submitBtn = box.querySelector<HTMLButtonElement>('[data-compose-submit]');
    if (submitBtn) submitBtn.disabled = !enabled;
  }

  /** `data-receipt` still carries every state -- the send button's spinner and
      its returning arrow are keyed off it (comments.css). What is *drawn*
      below the box is one thing only: the subscribe offer. A posted comment is
      announced by the comment; a failed one by the alert above the form; and
      the two of them plus an identity line used to take turns in a single slot
      under the box, which is what made the area unreadable. */
  /** Hands the subscribe offer to the panel the page already has, instead of
      answering it here. The nudge used to carry a bare checkbox: nothing read
      it, nothing submitted it, and there was no button in that row to submit
      it with -- so ticking it did nothing at all, which is a worse promise
      than not making one.

      Clicking the page's own `[data-subscribe-toggle]` opens the real panel,
      and that panel already seeds its email field from readReaderEmail() --
      the same store this nudge reads the address out of -- so the reader
      arrives at a form that is filled in and one press from done.

      A page with no subscribe panel (the components lab) gets no offer rather
      than a button that goes nowhere. */
  function wireSubscribeOffer(nudge: HTMLElement): void {
    const offer = nudge.querySelector<HTMLElement>('[data-compose-subscribe]');
    if (!offer) return;
    const toggle = document.querySelector<HTMLElement>('[data-subscribe-toggle]');
    if (!toggle) {
      offer.remove();
      return;
    }
    offer.addEventListener('click', (event) => {
      // Stop the press here. The panel closes itself on any document click
      // landing outside it and outside its own toggle -- and this button is
      // outside both, so letting the press continue would shut the panel the
      // same tick it opened. The toggle guards its own click the same way.
      event.stopPropagation();
      // The toggle toggles; this button only ever opens. Pressing "subscribe"
      // and having the form disappear because it happened to be open already
      // is not a thing a subscribe button should do. `aria-expanded` is the
      // state the toggle publishes for exactly this question.
      if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
    });
  }

  function showComposeReceipt(box: HTMLElement, receipt: ComposeReceipt): void {
    box.dataset.receipt = receipt;
    box.querySelector('[data-compose-receipt]')?.remove();
    if (receipt !== 'nudge') return;

    const nudge = el('div', { class: 'blog-compose__nudge', 'data-compose-nudge': '' }, [
      parseStaticSvg(NUDGE_MAIL_SVG),
      el('p', { class: 'blog-compose__nudge-text' }, [t.nudgeText(claimed?.email ?? '')]),
      el('button', { type: 'button', class: 'blog-compose__nudge-sub', 'data-compose-subscribe': '' }, [
        t.nudgeSubscribe,
      ]),
      el('button', { type: 'button', class: 'blog-compose__nudge-dismiss', 'data-compose-dismiss': '', 'aria-label': t.dismiss }, [
        parseStaticSvg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"></path></svg>`),
      ]),
    ]);
    nudge.querySelector('[data-compose-dismiss]')?.addEventListener('click', () => { nudge.hidden = true; });
    wireSubscribeOffer(nudge);

    box.append(el('div', { class: 'blog-compose__receipt', 'data-compose-receipt': '', 'aria-live': 'polite' }, [nudge]));
  }

  // --- Reply box --------------------------------------------------------

  // Mirrors the reply box in CommentsSection.astro: alert, identity, and one
  // surface holding the field and its send button. No footer -- "Replying to
  // X" repeated the placeholder, and Cancel repeated the Reply button one line
  // above, which closes this and holds a pressed state while it is open.
  function buildReplyBox(): HTMLElement {
    const box = el('div', { class: 'blog-compose blog-reply', id: 'blog-reply', 'data-phase': phase, hidden: '' }, [
      el('p', { class: 'blog-compose__alert', 'data-compose-error': '', role: 'alert', hidden: '' }, [
        parseStaticSvg(ALERT_ICON_SVG),
        el('span', { 'data-compose-error-text': '' }),
        el('code', { class: 'blog-compose__code', 'data-compose-error-code': '', hidden: '' }),
      ]),
      el('div', { class: 'blog-compose__box' }, [
        buildIdentityRow('blog-reply-id'),
        // Same top row as the box at the top of the thread: the fields when
        // nobody is on file, the answer when somebody is. applyPhase fills
        // whichever of the two spans data-phase leaves on screen.
        el('p', { class: 'blog-compose__signed' }, [
          el('span', { class: 'blog-compose__who' }),
          el('span', { class: 'blog-compose__claim' }),
        ]),
        el('label', { class: 'sr-only', for: 'blog-reply-text' }, [t.replyBodyLabel]),
        el('textarea', { id: 'blog-reply-text', class: 'blog-compose__field blog-reply__field', rows: '2' }),
        el('div', { class: 'blog-compose__bar' }, [
          el('span', { class: 'blog-compose__count', 'data-compose-count': '', 'aria-hidden': 'true', hidden: '' }),
          el('button', { type: 'button', class: 'blog-compose__go', 'data-compose-submit': '', 'aria-label': t.replyPostAria, title: t.replyPost }, [parseStaticSvg(SEND_ICON_SVG)]),
        ]),
      ]),
    ]);
    return box;
  }

  function buildIdentityRow(id: string): HTMLElement {
    // Mirrors IdentityRow.astro -- the two have to agree, since the lab
    // renders that one and a live thread renders this one.
    return el('div', { class: 'blog-compose__identity', id, 'data-compose-identity': '' }, [
      el('div', { class: 'blog-compose__fields' }, [
        el('label', { class: 'sr-only', for: `${id}-name` }, [t.nameLabel]),
        el('input', { id: `${id}-name`, class: 'blog-compose__input blog-compose__input--name', type: 'text', maxlength: '32', autocomplete: 'nickname', placeholder: t.namePlaceholder, required: '' }),
        el('label', { class: 'sr-only', for: `${id}-email` }, [t.emailLabel]),
        el('input', { id: `${id}-email`, class: 'blog-compose__input', type: 'email', autocomplete: 'email', placeholder: t.emailPlaceholder, required: '' }),
      ]),
      el('input', {
        type: 'text', name: 'website', 'data-honeypot': '', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true',
        style: 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;',
      }),
    ]);
  }

  function wireReplyBoxMechanics(): void {
    // This box is built here rather than rendered by CommentsSection.astro,
    // so `wireComposeValidation` never sees it -- its Post is checked by
    // handleSubmit calling validateCompose directly. The counter has no such
    // second path, and needs saying out loud.
    wireBodyCounter(replyField, replyBox.querySelector<HTMLElement>('[data-compose-count]'));

    replyBox.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') closeReplyBox();
    });
  }

  function openReplyBox(commentId: string, authorName: string, rowBody: HTMLElement): void {
    const wasOpenFor = replyBox.dataset.replyTarget;
    closeReplyBox();
    if (wasOpenFor === commentId) return; // pressing the same row's Reply again just closes it

    replyBox.dataset.replyTarget = commentId;
    // The placeholder is the only place the name needs to appear.
    replyField.placeholder = t.replyTo(authorName);
    rowBody.append(replyBox);
    replyBox.hidden = false;
    replyField.focus();
    document.querySelector<HTMLElement>(`[data-reply-to="${cssEscape(commentId)}"]`)?.setAttribute('aria-expanded', 'true');
  }

  function closeReplyBox(): void {
    if (replyBox.hidden) return;
    replyBox.hidden = true;
    list.append(replyBox);
    delete replyBox.dataset.replyTarget;
    document.querySelector('[data-reply-to][aria-expanded="true"]')?.setAttribute('aria-expanded', 'false');
    // The box travels between rows: a complaint about the last one has
    // nothing to do with the next.
    const note = replyBox.querySelector<HTMLElement>('[data-compose-error]');
    replyBox.querySelectorAll('[aria-invalid]').forEach((f) => f.removeAttribute('aria-invalid'));
    if (note) {
      note.querySelector('[data-compose-error-text]')?.replaceChildren();
      const badge = note.querySelector<HTMLElement>('[data-compose-error-code]');
      if (badge) {
        badge.replaceChildren();
        badge.hidden = true;
      }
      note.hidden = true;
    }
    replyField.value = '';
  }

  // --- Row rendering ------------------------------------------------------

  function renderCommentRow(comment: BlogComment, parentId: string | null): HTMLElement {
    if (comment.tombstone) {
      const article = el('article', {
        id: `comment-${comment.id}`,
        class: `blog-comment blog-comment--tombstone${comment.isReply ? ' blog-comment--reply' : ''}`,
      }, [
        el('span', { class: 'blog-comment__avatar blog-comment__avatar--ghost', 'aria-hidden': 'true' }, [parseStaticSvg(GHOST_ICON_SVG)]),
        el('div', { class: 'blog-comment__body' }, [
          el('div', { class: 'blog-comment__meta' }, [el('span', { class: 'blog-comment__date' }, [comment.date])]),
          el('p', { class: 'blog-comment__text blog-comment__text--tombstone' }, [t.tombstone]),
        ]),
      ]);
      if (parentId) article.dataset.parentId = parentId;
      return article;
    }

    const meta = el('div', { class: 'blog-comment__meta' }, [el('span', { class: 'blog-comment__author' }, [comment.author])]);
    if (comment.byAuthor) meta.append(el('span', { class: 'blog-comment__badge' }, [t.authorBadge]));
    meta.append(el('span', { class: 'blog-comment__date' }, [comment.date]));
    if (comment.edited) meta.append(el('span', { class: 'blog-comment__edited' }, [t.edited]));

    // A div, not a paragraph: the body is a rendered document now (see
    // comment-markdown.ts), and a <p> cannot legally hold the blockquote or
    // list a comment may have asked for -- the browser would break the tag
    // open and scatter the row.
    const text = el('div', { class: 'blog-comment__text', 'data-comment-text': '' });
    setCommentText(text, comment.text);
    const body = el('div', { class: 'blog-comment__body' }, [meta, text]);

    if (comment.own && !comment.held) {
      body.append(
        el('label', { class: 'sr-only', for: `comment-edit-${comment.id}` }, [t.editLabel]),
        el('textarea', { id: `comment-edit-${comment.id}`, class: 'blog-comment__edit-field', 'data-comment-edit-field': '', rows: '2', hidden: '' }, [comment.text]),
      );
    }

    if (comment.held) {
      body.append(el('p', { class: 'blog-comment__note' }, [t.held]));
    } else {
      // Two sets of controls in one strip, exactly one on screen -- mirrors
      // CommentsSection.astro, which renders the same row server-side.
      const acts = el('span', { class: 'blog-comment__acts' }, [
        el('button', {
          type: 'button', class: 'blog-comment__act blog-comment__act--like', 'data-comment-like': '',
          'aria-pressed': comment.liked ? 'true' : 'false', 'aria-label': t.likeLabel(comment.author),
        }, [heartIcon(), el('span', { class: 'blog-comment__act-count', 'data-like-count': '' }, [String(comment.likes ?? 0)])]),
        el('button', { type: 'button', class: 'blog-comment__act', 'data-reply-to': comment.id, 'data-reply-name': comment.author }, [parseStaticSvg(REPLY_ICON_SVG), t.reply]),
      ]);
      const actions = el('div', { class: 'blog-comment__actions' }, [acts]);
      if (comment.own) {
        acts.append(
          el('button', { type: 'button', class: 'blog-comment__act', 'data-comment-edit-open': '' }, [
            parseStaticSvg(EDIT_ICON_SVG),
            t.edit,
            el('span', { class: 'blog-comment__act-time', 'data-edit-countdown': '', hidden: '' }),
          ]),
          el('button', { type: 'button', class: 'blog-comment__act blog-comment__act--danger', 'data-comment-delete': '' }, [parseStaticSvg(TRASH_ICON_SVG), t.remove]),
        );
        actions.append(
          el('span', { class: 'blog-comment__acts blog-comment__acts--editing', 'data-comment-edit-actions': '', hidden: '' }, [
            el('button', { type: 'button', class: 'blog-comment__act blog-comment__act--go', 'data-comment-edit-save': '' }, [t.save]),
            el('button', { type: 'button', class: 'blog-comment__act', 'data-comment-edit-cancel': '' }, [t.cancel]),
            el('span', { class: 'blog-compose__count', 'data-comment-count': '', 'aria-hidden': 'true', hidden: '' }),
            el('span', { class: 'blog-comment__act-time blog-comment__act-time--left', 'data-edit-countdown': '', hidden: '' }),
          ]),
        );
      }
      body.append(actions);
    }

    const article = el('article', {
      id: `comment-${comment.id}`,
      class: `blog-comment${comment.isReply ? ' blog-comment--reply' : ''}`,
    }, [
      el('span', { class: 'blog-comment__avatar blog-avatar-seed blog-avatar-initials', style: `--seed-hue:${seedHue(comment.author)}`, 'aria-hidden': 'true' }, [initials(comment.author)]),
      body,
    ]);
    if (comment.own) article.dataset.own = 'true';
    if (comment.own && !comment.held && comment.editDeadline) article.dataset.editDeadline = String(comment.editDeadline);
    if (parentId) article.dataset.parentId = parentId;
    return article;
  }

  /** The row that appears under the reader's finger the moment they press
      Post, before anything has been asked of the server.

      It is rendered through the `held` branch on purpose, which is the branch
      that draws the note and draws no action strip. Both are exactly right
      for a row with no id yet: `markPending` turns the note into "发布中", and
      a Reply or Delete button here would address a comment the server has
      never heard of. Everything it cannot know -- the real id, the edit
      window, the author badge, whether a moderator wants a look -- it simply
      does not claim, because the response replaces it whole.

      The id is a throwaway. Nothing looks a row up by it during the second or
      two this one exists, and `insertNewRow` places replies by their parent. */
  function renderGhostRow(authorName: string, body: string, parentId: string | null): HTMLElement {
    const ghost = renderCommentRow({
      id: `pending-${Date.now()}`,
      author: authorName,
      date: t.relativeDate.now,
      text: body,
      held: true,
      isReply: parentId !== null,
      own: true,
    }, parentId);
    markPending(ghost);
    // Only this row. The swap that replaces it must not run the entrance a
    // second time, three seconds after the reader has already read it.
    ghost.dataset.enter = 'true';
    return ghost;
  }

  function wireCommentRow(article: HTMLElement, comment: BlogComment, parentId: string | null): void {
    if (comment.tombstone) return;

    const likeBtn = article.querySelector<HTMLButtonElement>('[data-comment-like]');
    likeBtn?.addEventListener('click', () => void likeComment(comment.id, likeBtn));

    const replyBtn = article.querySelector<HTMLButtonElement>('[data-reply-to]');
    replyBtn?.addEventListener('click', () => {
      const body = article.querySelector<HTMLElement>('.blog-comment__body');
      if (body) openReplyBox(comment.id, comment.author, body);
    });

    if (comment.own) {
      wireOwnRow(article, comment, parentId);
    }
  }

  /** One way on purpose. A like here is applause, not a vote to be withdrawn,
      and the toggle it used to be had a worse problem than the extra press: a
      reader who pressed again to say "yes, really" took their own like back
      and watched the count fall. So the second press and every press after it
      costs nothing and spends hearts instead -- which is the only thing anyone
      was asking for by pressing twice. Undoing one is a page reload away,
      which is the right amount of friction for a heart. */
  async function likeComment(commentId: string, button: HTMLButtonElement): Promise<void> {
    burstHearts(button);
    // Set before the first await, so presses arriving mid-flight stop here
    // rather than racing a second write.
    if (button.getAttribute('aria-pressed') === 'true') return;
    button.setAttribute('aria-pressed', 'true');

    const countEl = button.querySelector<HTMLElement>('[data-like-count]');
    if (countEl) countEl.textContent = String(Number(countEl.textContent ?? 0) + 1);

    const turnstileToken = await getTurnstileToken(turnstileSiteKey, 'blog_reaction');
    const response = await postJson<{ reaction: { count: number; reacted: boolean } }>('/api/v2/reactions/toggle', {
      targetType: 'comment',
      targetId: commentId,
      reacted: true,
      turnstileToken,
    });
    releaseTurnstileToken('blog_reaction');

    if (!response.ok) {
      button.setAttribute('aria-pressed', 'false');
      if (countEl) countEl.textContent = String(Math.max(0, Number(countEl.textContent ?? 0) - 1));
      return;
    }
    button.setAttribute('aria-pressed', String(response.data.reaction.reacted));
    if (countEl) countEl.textContent = String(response.data.reaction.count);
  }

  /** Three hearts up and out of the button, per press. Sized and timed to the
      26px action pill rather than borrowed from the post-level bar, which
      throws five across a 36px card. */
  function burstHearts(button: HTMLButtonElement): void {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    for (let i = 0; i < 3; i += 1) {
      const heart = filledHeartIcon();
      heart.classList.add('blog-comment__heart');
      heart.setAttribute('style', `--heart-x:${(i - 1) * 9}px;--heart-rot:${(i - 1) * 18}deg;animation-delay:${i * 55}ms`);
      button.append(heart);
      window.setTimeout(() => heart.remove(), 1000 + i * 55);
    }
  }

  function wireOwnRow(article: HTMLElement, comment: BlogComment, parentId: string | null): void {
    const openBtn = article.querySelector<HTMLButtonElement>('[data-comment-edit-open]');
    const cancelBtn = article.querySelector<HTMLButtonElement>('[data-comment-edit-cancel]');
    const saveBtn = article.querySelector<HTMLButtonElement>('[data-comment-edit-save]');
    const deleteBtn = article.querySelector<HTMLButtonElement>('[data-comment-delete]');
    const acts = article.querySelector<HTMLElement>('.blog-comment__acts');
    const editActs = article.querySelector<HTMLElement>('[data-comment-edit-actions]');
    const text = article.querySelector<HTMLElement>('[data-comment-text]');
    const field = article.querySelector<HTMLTextAreaElement>('[data-comment-edit-field]');
    const count = article.querySelector<HTMLElement>('[data-comment-count]');

    // The window stops while the field is open -- see the same wiring in
    // CommentsSection.astro, and the note there about the server's own clock.
    const clock = comment.editDeadline ? startEditCountdown(article, comment.editDeadline, openBtn) : null;

    // Cancel asks a second time before throwing away typing by becoming the
    // question itself -- same wiring as CommentsSection.astro, which renders
    // this row server-side.
    const armCancel = (armed: boolean): void => {
      if (!cancelBtn) return;
      cancelBtn.classList.toggle('blog-comment__act--confirm', armed);
      cancelBtn.textContent = armed ? t.discard : t.cancel;
    };

    // The strip swaps its contents; nothing in the row is removed, so the
    // countdown keeps its place through the edit it is limiting. The byline
    // steps out of the way for the same span, on one attribute (comments.css).
    const setEditing = (editing: boolean): void => {
      if (text) text.hidden = editing;
      if (field) field.hidden = !editing;
      if (acts) acts.hidden = editing;
      if (editActs) editActs.hidden = !editing;
      if (editing) article.dataset.editing = 'true';
      else delete article.dataset.editing;
      armCancel(false);
      if (editing) {
        clock?.pause();
        field?.focus();
      } else {
        clock?.resume();
      }
    };

    if (openBtn && text && field) {
      openBtn.addEventListener('click', () => setEditing(true));
      wireBodyCounter(field, count);
      field.addEventListener('input', () => {
        // Typing again withdraws the question.
        armCancel(false);
        // ...and withdraws whatever the last press was told, which may well
        // be the thing they are now fixing.
        article.querySelector('.blog-comment__edit-error')?.remove();
      });
      cancelBtn?.addEventListener('click', () => {
        // Against the source, not the rendering: the paragraph holds a parsed
        // tree now (comment-markdown.ts), so `**bold**` reads back out of
        // `textContent` as `bold` and every formatted comment would look
        // dirty the instant its field opened.
        const dirty = field.value !== readCommentText(text);
        // Nothing typed, nothing to lose: close on the first press.
        if (dirty && !cancelBtn.classList.contains('blog-comment__act--confirm')) {
          armCancel(true);
          return;
        }
        field.value = readCommentText(text);
        setEditing(false);
      });
      saveBtn?.addEventListener('click', () => {
        // Refused here rather than three seconds later by site-api, with the
        // sentence site-api would have sent (compose-validate.ts).
        if (field.value.trim().length > MAX_BODY_LENGTH) {
          sayEditAlert(field, t.submitError.LONG);
          // The edit strip has no box to redden around the field, so the
          // count is the only thing here that can point at itself.
          nudgeBodyCount(count);
          return;
        }
        void saveEdit(comment.id, article, text, field, setEditing);
      });
    }

    deleteBtn?.addEventListener('click', () => void deleteComment(comment.id, article, parentId));
  }

  async function saveEdit(
    commentId: string,
    article: HTMLElement,
    text: HTMLElement,
    field: HTMLTextAreaElement,
    setEditing: (editing: boolean) => void,
  ): Promise<void> {
    const body = field.value.trim();
    if (!body) return;
    article.querySelector('.blog-comment__edit-error')?.remove();

    const previous = readCommentText(text);
    // Pressing Save on an untouched field is a way of closing it. Sending it
    // would put the comment through moderation again for no change, and the
    // verdict can come back different.
    if (previous === body) {
      setEditing(false);
      return;
    }

    const meta = article.querySelector('.blog-comment__meta');
    const wasEdited = Boolean(meta?.querySelector('.blog-comment__edited'));

    // Same bargain as posting: the server re-moderates every edit, so Save sat
    // under the reader's finger for a whole model call with nothing on screen
    // acknowledging the press -- no spinner, no disabled button, not even a
    // colour change. The words go up now and the round trip corrects them.
    setCommentText(text, body);
    setEditing(false);
    article.dataset.sending = 'true';
    if (meta && !wasEdited) meta.append(el('span', { class: 'blog-comment__edited' }, [t.edited]));

    const input: CommentEditInput = { body };
    const response = await fetch(`/api/v2/comments/${encodeURIComponent(commentId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    delete article.dataset.sending;

    if (!response.ok) {
      // Put the row back the way it was and reopen the field still holding
      // what was typed -- an edit refused is an edit the reader has not
      // finished, and throwing their sentence away to show them an error
      // would be the second thing to go wrong.
      setCommentText(text, previous);
      if (!wasEdited) meta?.querySelector('.blog-comment__edited')?.remove();
      field.value = body;
      setEditing(true);
      // Same taxonomy as a submission -- see comment-error.ts. An edit past
      // its window (409) and an edit that hit a rate limit are different
      // problems, and "that didn't save, try again" was wrong for both: the
      // window never reopens, and retrying a limit deepens it.
      const failure = describeCommentFailure(
        response.status,
        readErrorSlug(await response.json().catch(() => null)),
        t.submitError,
      );
      sayEditAlert(field, failure.message, failureTag(failure));
      return;
    }

    const data = (await response.json()) as CommentEditResult;
    // Re-set from the response rather than trusting what was optimistically
    // painted: the server owns the stored text, and a trim or a normalisation
    // there should show here.
    setCommentText(text, data.comment.body);
    // The verdict moves in both directions -- see the PATCH route in
    // site-api. Dropping it on the floor is not cosmetic: a row that quietly
    // went `held` is invisible to everybody except its writer, and the
    // writer's own screen was the one place still drawing it as published.
    // The reverse case is milder but just as wrong -- an edit that cleared a
    // hold kept claiming nobody else could see it.
    applyHeldState(article, data.comment.status !== 'published');
  }

  /** The row's own copy of the compose alert -- the same filled, red, glyphed
      object, in the one place a comment body can be written outside a compose
      box. `tag` is the server's reference code where there is one; a refusal
      the browser made by itself has no response to report, so it prints
      without a badge rather than inventing a status. */
  function sayEditAlert(field: HTMLTextAreaElement, message: string, tag = ''): void {
    field.parentElement?.querySelector('.blog-comment__edit-error')?.remove();
    field.after(el('p', { class: 'blog-comment__edit-error blog-compose__alert', role: 'alert' }, [
      parseStaticSvg(ALERT_ICON_SVG),
      el('span', {}, [message]),
      ...(tag ? [el('code', { class: 'blog-compose__code' }, [tag])] : []),
    ]));
  }

  async function deleteComment(commentId: string, article: HTMLElement, parentId: string | null): Promise<void> {
    if (!window.confirm(t.removeConfirm)) return;
    const response = await fetch(`/api/v2/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE' });
    if (!response.ok) return;

    const data = (await response.json()) as { ok: true; tombstone: boolean };
    if (data.tombstone) {
      const tombstoneRow = renderCommentRow(
        { id: commentId, author: '', date: '', text: '', isReply: Boolean(parentId), tombstone: true },
        parentId,
      );
      article.replaceWith(tombstoneRow);
    } else {
      article.remove();
    }
    // Delete is only ever offered on a published row (a held one shows the
    // review note instead of the actions bar), so the total always drops by
    // exactly one here.
    setTally(Math.max(0, total - 1));
  }

  function startEditCountdown(
    article: HTMLElement,
    initialDeadline: number,
    editBtn: HTMLButtonElement | null,
  ): { pause: () => void; resume: () => void } | null {
    // Both slots: the one inside the Edit button and the one beside Post. Only
    // one is ever on screen, and writing both means the clock survives the
    // moment the reader acts on it.
    const slots = [...article.querySelectorAll<HTMLElement>('[data-edit-countdown]')];
    if (!editBtn || !slots.length) return null;

    let deadline = initialDeadline;
    let pausedAt = 0;
    let timer = 0;

    function tick(): boolean {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        editBtn!.hidden = true;
        for (const slot of slots) slot.hidden = true;
        return false;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      const clock = `${mins}:${String(secs).padStart(2, '0')}`;
      for (const slot of slots) {
        slot.hidden = false;
        // The clock inside the Edit button is already labelled by the button;
        // the one standing alone beside Save needs the word, and the word does
        // not sit on the same side of the number in every language.
        slot.textContent = slot.classList.contains('blog-comment__act-time--left')
          ? t.timeLeft(clock)
          : clock;
      }
      return true;
    }

    function run(): void {
      if (!tick()) return;
      timer = window.setInterval(() => {
        if (!tick()) window.clearInterval(timer);
      }, 1000);
    }

    run();

    return {
      pause() {
        window.clearInterval(timer);
        pausedAt = Date.now();
      },
      resume() {
        if (!pausedAt) return;
        deadline += Date.now() - pausedAt;
        pausedAt = 0;
        run();
      },
    };
  }

  // --- Phase / identity ---------------------------------------------------

  function applyPhase(box: HTMLElement, currentPhase: ReaderPhase, claimedIdentity: ClaimedIdentity | null, currentViewer: ReaderMe | null): void {
    box.dataset.phase = currentPhase;
    const who = box.querySelector<HTMLElement>('.blog-compose__who');
    const claim = box.querySelector<HTMLElement>('.blog-compose__claim');

    if (who) {
      who.replaceChildren();
      if (currentPhase === 'ready' && currentViewer) {
        const face = currentViewer.avatarUrl
          ? el('img', { class: 'blog-compose__whoface', src: currentViewer.avatarUrl, alt: '', width: '20', height: '20' })
          : el('span', { class: 'blog-compose__whoface blog-avatar-seed blog-avatar-initials', style: `--seed-hue:${seedHue(currentViewer.displayName)}`, 'aria-hidden': 'true' }, [initials(currentViewer.displayName)]);
        who.append(face, t.postingAs(currentViewer.displayName));
      }
    }

    if (claim) {
      claim.replaceChildren();
      if (currentPhase === 'claimed' && claimedIdentity) {
        const switchBtn = el('button', { type: 'button', class: 'blog-compose__claim-switch', 'data-compose-switch': '' }, [t.switchIdentity]);
        switchBtn.addEventListener('click', () => {
          phase = 'anonymous';
          applyPhase(compose, phase, claimed, viewer);
          applyPhase(replyBox, phase, claimed, viewer);
          box.querySelector<HTMLInputElement>('[data-compose-identity] input')?.focus();
        });
        claim.append(t.claimedAs(claimedIdentity.name), switchBtn);
      }
    }
  }

  function readClaimedIdentity(): ClaimedIdentity | null {
    try {
      const raw = window.localStorage.getItem(CLAIMED_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<ClaimedIdentity>;
      if (typeof parsed.name === 'string' && typeof parsed.email === 'string') {
        return { name: parsed.name, email: parsed.email };
      }
    } catch {
      // Corrupt or inaccessible storage -- fall through to anonymous.
    }
    return null;
  }

  function writeClaimedIdentity(identity: ClaimedIdentity): void {
    // Also handed to the subscribe panel, which asks for the same address
    // (lib/reader-email.ts). The claim keeps the richer name+email record;
    // that one keeps the lowest common denominator both forms can use.
    rememberReaderEmail(identity.email, 'comment');
    try {
      window.localStorage.setItem(CLAIMED_STORAGE_KEY, JSON.stringify(identity));
    } catch {
      // Private browsing or a full quota -- the claim just won't survive reload.
    }
  }

  /** An address the reader has already given the subscribe panel on this
      browser. Fills the email field so an anonymous first comment is one
      field of typing instead of two -- editable, and never overwriting
      anything the reader has put there. */
  function prefillKnownEmail(): void {
    const known = readReaderEmail();
    if (!known) return;
    for (const box of [compose, replyBox]) {
      const input = box?.querySelector<HTMLInputElement>('[data-compose-identity] input[type="email"]');
      if (input && !input.value) input.value = known.email;
    }
  }

  async function mintDwellToken(): Promise<void> {
    const result = await fetchJson<{ token: string }>('/api/v2/comments/dwell-token');
    if (result) dwellToken = result.token;
  }
}

// ---------------------------------------------------------------------------
// fetch helpers
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

/** Status 0 means the request never reached a server -- offline, DNS, a
    killed tab. Distinct from every real refusal, and the only failure where
    "try again" is honest advice on its own. The refusal body is read for its
    error slug (see comment-error.ts); a body that is missing or not JSON is
    normal on a 5xx and costs nothing but an empty slug. */
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

function cssEscape(value: string): string {
  return (window as unknown as { CSS?: { escape?: (v: string) => string } }).CSS?.escape?.(value)
    ?? value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
