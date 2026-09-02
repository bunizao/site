// Wires the presentational comment thread (CommentsSection.astro,
// CommentForm.astro, IdentityRow.astro) to the real v2 API: fetching the
// thread, submitting a comment or reply, editing, deleting, liking, and the
// lazy-verification "claimed" footer. Those components render markup and
// flip local `hidden`/aria attributes only -- this file owns every fetch.
//
// /blog/[slug] is fully prerendered, so `<CommentsSection>` always ships
// with `state="loading"` and no comments: nothing below `.blog-compose`
// exists in the static HTML until this module builds it. Turnstile's widget
// lifecycle is adapted from subscribe-panel.ts (load/render/reset), rendered
// with `appearance: 'interaction-only'` so nothing on this surface shows a
// challenge box unless Turnstile actually needs one.

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
  confirmAnonymousSubmit,
  dismissRecommendOnFill,
  MAX_BODY_LENGTH,
  nudgeBodyCount,
  resetAnonymousConfirm,
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
  challengeTurnstile,
  getTurnstileToken,
  releaseTurnstileToken,
  setTurnstileHost,
  warmTurnstileToken,
} from '@/features/comments/client/turnstile-token';
import { clearCommentMarkdownPreview } from '@/features/comments/client/markdown-preview';
import { readCommentText, setCommentText } from '@/features/comments/comment-markdown';
import { forgetReaderEmail, readReaderEmail, rememberReaderEmail } from '@/lib/reader-email';
import { wireSignOut } from '@/features/comments/client/sign-out';
import { avatarSeed, initials, seedHue } from '@/features/comments/identity';
import { ICONS, SIGNOUT_ICONS, iconSvg } from '@/features/comments/icons';
import { copyFor, type CommentsCopy } from '@/features/comments/copy';
import { safeReaderAvatarUrl } from '@/features/comments/reader-avatar';
import type { BlogComment, ClaimedIdentity, ComposeReceipt, ReaderPhase } from '@/features/comments/types';

const CLAIMED_STORAGE_KEY = 'buxx:reader';
const PAGE_SIZE = 20;

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

// Same paths the Astro pass draws, from the same table -- the two renderers
// have to agree, and a hand-copied path is exactly the kind of thing that
// drifts between them.
const REPLY_ICON_SVG = iconSvg(ICONS.reply);
const SEND_ICON_SVG = iconSvg(ICONS.arrowUp, 'stroke-width="2"');
const EDIT_ICON_SVG = iconSvg(ICONS.pencil);
const TRASH_ICON_SVG = iconSvg(ICONS.trash);
const GHOST_ICON_SVG = iconSvg(ICONS.circleSlash);
const ALERT_ICON_SVG = iconSvg(ICONS.circleAlert, 'stroke-width="2"');
const MAIL_ICON_SVG = iconSvg(ICONS.mail, 'stroke-width="1.7"');
// Gives the nudge an identity of its own. Without it the row read as a strip
// of controls that happened to sit under the box, which is how a message ends
// up ignored by the people it is for.
/** Long enough to read a two-word sentence without hunting for it, short
    enough that it is gone before the reader starts writing the next comment.
    The fade has to outlive the CSS transition or the node is torn out
    mid-animation. */
const POSTED_NOTE_MS = 5000;
const POSTED_NOTE_FADE_MS = 400;

const NUDGE_MAIL_SVG = iconSvg(ICONS.mail, 'class="blog-compose__nudge-mark" stroke-width="1.6"');
const THREAD_ERROR_MARK_SVG = iconSvg(ICONS.messageSquareWarning, 'class="blog-comments__mark" stroke-width="1.5"');

function heartIcon(): SVGElement {
  return parseStaticSvg(iconSvg(ICONS.heart));
}

// Filled rather than stroked: liked is the state, and the same outline in a
// different colour is not a state change anyone reads at a glance.
function filledHeartIcon(): SVGElement {
  return parseStaticSvg(`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS.heart}</svg>`);
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
    avatarUrl: comment.tombstone ? undefined : safeReaderAvatarUrl(comment.author.avatarUrl),
    byAuthor: comment.author.byAuthor,
    held: comment.status === 'held',
    isReply: comment.parentId !== null,
    likes: reaction?.count ?? 0,
    liked: reaction?.reacted ?? false,
    own: comment.mine,
    editDeadline: comment.editableUntil ?? undefined,
    deletable: comment.deletable,
    edited: Boolean(comment.editedAt),
    tombstone: comment.tombstone,
  };
}

/** A real picture when the writer has one on file, and the generated circle
    otherwise. `avatarUrl` is only ever set when an avatar actually resolved,
    so this never trades a tinted set of initials for a random identicon. */
function commentFace(comment: BlogComment): HTMLElement {
  if (comment.avatarUrl) {
    return el('img', {
      class: 'blog-comment__avatar blog-comment__avatar--photo',
      src: comment.avatarUrl,
      alt: '',
      width: '28',
      height: '28',
      loading: 'lazy',
      decoding: 'async',
    });
  }
  return el('span', {
    class: 'blog-comment__avatar blog-avatar-seed blog-avatar-initials',
    style: `--seed-hue:${seedHue(avatarSeed(comment.id, comment.author, comment.avatarUrl))}`,
    'aria-hidden': 'true',
  }, [initials(comment.author)]);
}

/** Mutation rights, derived only from the fields the server actually sends.
    Never read `comment.own` for this -- since verified-only mutation
    shipped it means "mine", highlight only. A verified reader can be
    looking at their own never-claimed anonymous comment: `own` true,
    both of these false. See packages/contracts/src/comments.ts. */
function commentRights(comment: BlogComment): { canEdit: boolean; canDelete: boolean } {
  return {
    canEdit: !comment.held && comment.editDeadline != null,
    canDelete: comment.deletable === true,
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
  const locale = section.dataset.locale === 'en' ? 'en' : 'zh';
  const head = section.querySelector<HTMLElement>('.blog-comments__head');

  let claimed: ClaimedIdentity | null = readClaimedIdentity();
  let phase: ReaderPhase = claimed ? 'claimed' : 'anonymous';
  let viewer: ReaderMe | null = null;
  let dwellToken = '';
  let dwellTokenMintedAt = 0;
  let nextBefore: string | null = null;
  let total = 0;
  let list: HTMLElement;
  let replyBox: HTMLElement;
  let replyField: HTMLTextAreaElement;
  let moreButton: HTMLButtonElement | null = null;

  applyPhase(compose, phase, claimed, viewer);
  wireSignOut(compose, () => void signOut());
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
    wireSignOut(replyBox, () => void signOut());
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
    const wrap = moreButton.closest<HTMLElement>('.blog-comments__more');
    wrap?.querySelector('.blog-comments__more-error')?.remove();
    moreButton.setAttribute('aria-busy', 'true');
    moreButton.disabled = true;
    moreButton.textContent = t.loading;

    const page = await fetchJson<CommentListResult>(
      `/api/v2/comments?post=${encodeURIComponent(postId)}&before=${encodeURIComponent(nextBefore)}&limit=${PAGE_SIZE}`,
    );
    if (!page) {
      moreButton.setAttribute('aria-busy', 'false');
      moreButton.disabled = false;
      moreButton.textContent = t.retry;
      wrap?.append(el('p', { class: 'blog-comments__more-error', role: 'alert' }, [t.loadError]));
      return;
    }

    wrap?.remove();
    moreButton = null;

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

    // An anonymous writer with an empty email field gets one more press: the
    // first one arms the box and shows the recommendation instead of
    // sending anything. See confirmAnonymousSubmit() for the state machine.
    if (!confirmAnonymousSubmit(box)) return;

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
    //
    // The host follows the box that is submitting: a reply is written far down
    // the thread, and a challenge that opened under the compose box at the top
    // would be off screen at the moment it needs answering.
    hostTurnstileIn(box);
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
      locale,
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
      // Cloudflare wanted a human and the invisible widget could not settle it
      // alone. Open the challenge under this box and resend once it is
      // answered, rather than telling the reader to reload -- the reload was
      // never the fix, it just spent the draft on a second try of the same
      // silent solve. Once per submission: a challenge that fails again leaves
      // the message standing rather than looping.
      if (failure.code === 'BOT' && box.dataset.botRetry !== 'spent') {
        box.dataset.botRetry = 'spent';
        void solveChallengeAndResend(box);
      }
      return;
    }

    const { outcome, comment, unverifiedEmail } = response.data;
    delete box.dataset.botRetry;
    // Success only -- a failed submit restores the draft, and the retry press
    // should send it, not re-arm the add-an-email recommendation. The next
    // comment in this box starts a fresh attempt and earns its own first press.
    resetAnonymousConfirm(box);

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
    //
    // `own` is forced rather than trusted from the response: the session
    // cookie this row belongs to may be the one this very response just
    // minted, so the server's own `mine` check can lag by one request.
    // Edit/delete rights are never touched by this -- they stay whatever
    // `comment.editableUntil`/`comment.deletable` actually said.
    const row = toBlogComment(comment, {}, t);
    row.own = true;
    const article = renderCommentRow(row, parentId);
    wireCommentRow(article, row, parentId);
    // Not on a held row: it carries its own note, and "Posted." is a claim
    // about a comment nobody else can see yet.
    if (outcome !== 'held') announcePosted(article);
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

  /** The receipt for the row this browser just posted: the one thing the
      reader pressed the button to find out, in the spot they are already
      looking, and gone once it has been read. The comment itself is the
      lasting proof, so a badge that stays is clutter. */
  function announcePosted(article: HTMLElement): void {
    const note = article.querySelector<HTMLElement>('.blog-comment__body')?.appendChild(
      el('p', { class: 'blog-comment__note blog-comment__note--posted' }),
    );
    if (!note) return;
    note.textContent = t.postedNote;
    note.dataset.transient = 'in';
    window.setTimeout(() => { note.dataset.transient = 'out'; }, POSTED_NOTE_MS);
    window.setTimeout(() => { note.remove(); }, POSTED_NOTE_MS + POSTED_NOTE_FADE_MS);
  }

  /** Move the shared widget into whichever compose box is about to send, so a
      challenge opens where the reader is looking. The reply box carries its
      own host and travels between rows; the top box's is static. */
  function hostTurnstileIn(box: HTMLElement): void {
    const host = box.querySelector<HTMLElement>('[data-turnstile-host]');
    if (host) setTurnstileHost('blog_comment_create', host);
  }

  /** Draw a real, pressable Turnstile under `box` and send the comment again
      the moment it is solved. An unsolved challenge (the reader ignored it, or
      it failed again) simply returns: the refusal message is still on screen
      and the draft is still in the field. */
  async function solveChallengeAndResend(box: HTMLElement): Promise<void> {
    hostTurnstileIn(box);
    box.querySelector('[data-turnstile-host]')?.scrollIntoView({ block: 'nearest' });
    const token = await challengeTurnstile(turnstileSiteKey, 'blog_comment_create');
    if (!token) return;
    await handleSubmit(box);
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
    } else {
      const parentRow = list.querySelector(`#comment-${cssEscape(parentId)}`);
      let anchor: Element | null = parentRow;
      while (anchor?.nextElementSibling && (anchor.nextElementSibling as HTMLElement).dataset.parentId === parentId) {
        anchor = anchor.nextElementSibling;
      }
      if (anchor) anchor.after(article);
      else list.prepend(article);
    }
    announceNewRow(article);
  }

  // A bare prepend/insert used to land the row with no acknowledgement at
  // all -- silent, and possibly off-screen for a reply going into a long
  // thread. `block: 'nearest'` only moves the page if the row isn't already
  // visible. The entrance itself is skipped under prefers-reduced-motion;
  // the highlight is just a colour fade, not motion, so it still plays --
  // the row still needs *some* acknowledgement it landed. Cleaned up via
  // `animationend` rather than a matching timeout, so the class never
  // outlives the animation it names.
  function announceNewRow(article: HTMLElement): void {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    article.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    article.classList.add('blog-comment--new');
    const body = article.querySelector<HTMLElement>('.blog-comment__body');
    body?.addEventListener('animationend', () => article.classList.remove('blog-comment--new'), { once: true });
  }

  function readIdentity(box: HTMLElement): { displayName: string; email: string } | null {
    if (phase === 'ready' && viewer) {
      return { displayName: viewer.displayName, email: '' };
    }
    if (phase === 'claimed' && claimed) {
      return { displayName: claimed.name, email: claimed.email };
    }
    const name = box.querySelector<HTMLInputElement>('[data-compose-identity] input[type="text"]')?.value.trim() ?? '';
    // Email is optional -- an empty one posts the comment anonymously.
    const email = box.querySelector<HTMLInputElement>('[data-compose-identity] input[type="email"]')?.value.trim() ?? '';
    if (!name) return null;
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
        parseStaticSvg(iconSvg(ICONS.x, 'stroke-width="2"')),
      ]),
    ]);
    nudge.querySelector('[data-compose-dismiss]')?.addEventListener('click', () => { nudge.hidden = true; });
    wireSubscribeOffer(nudge);

    box.append(el('div', { class: 'blog-compose__receipt', 'data-compose-receipt': '', 'aria-live': 'polite' }, [nudge]));
  }

  // --- Reply box --------------------------------------------------------

  // Mirrors the reply box in CommentsSection.astro: alert, identity, one
  // surface holding the field and its send button, and an identity footer.
  // No "Replying to X" line and no Cancel -- the placeholder already says
  // who this answers, and the Reply button one line above both opened this
  // and closes it. The identity footer is a different thing: it says who
  // THIS box will post as, same as the compose box at the top, and it was
  // missing here entirely -- a claimed or ready reader opening a reply box
  // used to see nothing where "Posting as X" should have been,
  // because `.blog-compose__who`/`.blog-compose__claim` only existed in
  // CommentForm.astro. `applyPhase()` already looks for those two elements on
  // whichever box it is given, so building them here is the whole fix.
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
          signOutButton(),
        ]),
        el('label', { class: 'sr-only', for: 'blog-reply-text' }, [t.replyBodyLabel]),
        el('textarea', { id: 'blog-reply-text', class: 'blog-compose__field blog-reply__field', rows: '2' }),
        el('div', { class: 'blog-compose__bar' }, [
          el('span', { class: 'blog-compose__count', 'data-compose-count': '', 'aria-hidden': 'true', hidden: '' }),
          el('button', { type: 'button', class: 'blog-compose__go', 'data-compose-submit': '', 'aria-label': t.replyPostAria, title: t.replyPost }, [parseStaticSvg(SEND_ICON_SVG)]),
        ]),
      ]),
      // Same collapsed slot CommentForm.astro renders under the top box. A
      // reply is written wherever the row is, so the challenge has to be able
      // to open there too.
      el('div', { class: 'blog-compose__turnstile', 'data-turnstile-host': '' }),
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
        el('input', { id: `${id}-email`, class: 'blog-compose__input', type: 'email', autocomplete: 'email', placeholder: t.emailPlaceholder }),
      ]),
      // The two-click anonymous-post confirm's recommendation -- see
      // confirmAnonymousSubmit() in compose-validate.ts. Green, and beside
      // the field it is about, because it is a suggestion and the field it
      // suggests filling is still right there to fill.
      el('p', { class: 'blog-compose__recommend', 'data-compose-recommend': '', 'aria-live': 'polite', hidden: '' }, [
        parseStaticSvg(MAIL_ICON_SVG),
        t.emailRecommend,
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
    // The reply box is built once and travels between rows, so it never goes
    // through wireComposeValidation() -- wire the same "typing an email hides
    // the recommendation" behaviour directly.
    dismissRecommendOnFill(replyBox);
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
    // Landing on a different row starts a fresh reply attempt -- the arm from
    // whatever was typed for the last one has nothing to do with this one.
    resetAnonymousConfirm(replyBox);
    clearCommentMarkdownPreview(replyField);
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

    const { canEdit, canDelete } = commentRights(comment);

    if (canEdit) {
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
      // Edit and delete are gated independently -- a verified owner past the
      // 15-minute window keeps delete without edit.
      if (canEdit) {
        acts.append(
          el('button', { type: 'button', class: 'blog-comment__act', 'data-comment-edit-open': '' }, [
            parseStaticSvg(EDIT_ICON_SVG),
            t.edit,
            el('span', { class: 'blog-comment__act-time', 'data-edit-countdown': '', hidden: '' }),
          ]),
        );
      }
      if (canDelete) {
        acts.append(
          el('button', { type: 'button', class: 'blog-comment__act blog-comment__act--danger', 'data-comment-delete': '' }, [parseStaticSvg(TRASH_ICON_SVG), t.remove]),
        );
      }
      if (canEdit) {
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
      class: `blog-comment${comment.isReply ? ' blog-comment--reply' : ''}${comment.held ? ' blog-comment--held' : ''}`,
    }, [
      commentFace(comment),
      body,
    ]);
    // `data-own` is "mine" only -- kept for the row highlight, never read to
    // decide whether an edit/delete button exists.
    if (comment.own) article.dataset.own = 'true';
    if (canEdit && comment.editDeadline) article.dataset.editDeadline = String(comment.editDeadline);
    if (parentId) article.dataset.parentId = parentId;
    return article;
  }

  /** The row that appears under the reader's finger the moment they press
      Post, before anything has been asked of the server.

      It is rendered through the `held` branch on purpose, which is the branch
      that draws the note and draws no action strip. Both are exactly right
      for a row with no id yet: `markPending` turns the note into "Publishing", and
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
    // The entrance plays here, via insertNewRow -> announceNewRow. The swap
    // that replaces this row uses replaceWith and must not run it a second
    // time, three seconds after the reader has already read the row.
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

    const { canEdit, canDelete } = commentRights(comment);
    if (canEdit || canDelete) {
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
      const failure = describeCommentFailure(response.status, response.slug, t.submitError);
      showRowActionError(button.closest<HTMLElement>('.blog-comment'), failure.message, failureTag(failure));
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
    let response: Response;
    try {
      response = await fetch(`/api/v2/comments/${encodeURIComponent(commentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    } catch {
      delete article.dataset.sending;
      setCommentText(text, previous);
      if (!wasEdited) meta?.querySelector('.blog-comment__edited')?.remove();
      field.value = body;
      setEditing(true);
      sayEditAlert(field, t.submitError.NET, failureTag({ code: 'NET', status: 0, message: t.submitError.NET }));
      return;
    }

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

    let data: CommentEditResult;
    try {
      data = (await response.json()) as CommentEditResult;
    } catch {
      setCommentText(text, previous);
      if (!wasEdited) meta?.querySelector('.blog-comment__edited')?.remove();
      field.value = body;
      setEditing(true);
      sayEditAlert(field, t.submitError.SERVER, failureTag({ code: 'SERVER', status: 500, message: t.submitError.SERVER }));
      return;
    }
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
    let response: Response;
    try {
      response = await fetch(`/api/v2/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE' });
    } catch {
      showRowActionError(article, t.submitError.NET, failureTag({ code: 'NET', status: 0, message: t.submitError.NET }));
      return;
    }
    if (!response.ok) {
      const failure = describeCommentFailure(
        response.status,
        readErrorSlug(await response.json().catch(() => null)),
        t.submitError,
      );
      showRowActionError(article, failure.message, failureTag(failure));
      return;
    }

    let data: { ok: true; tombstone: boolean };
    try {
      data = (await response.json()) as { ok: true; tombstone: boolean };
    } catch {
      showRowActionError(article, t.submitError.SERVER, failureTag({ code: 'SERVER', status: 500, message: t.submitError.SERVER }));
      return;
    }
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

  function showRowActionError(article: HTMLElement | null, message: string, tag = ''): void {
    if (!article) return;
    article.querySelector('.blog-comment__action-error')?.remove();
    const actions = article.querySelector('.blog-comment__actions');
    if (!actions) return;
    actions.before(el('p', {
      class: 'blog-comment__action-error blog-compose__alert',
      role: 'alert',
    }, [
      parseStaticSvg(ALERT_ICON_SVG),
      el('span', {}, [message]),
      ...(tag ? [el('code', { class: 'blog-compose__code' }, [tag])] : []),
    ]));
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
        const avatarUrl = safeReaderAvatarUrl(currentViewer.avatarUrl);
        const face = avatarUrl
          ? el('img', { class: 'blog-compose__whoface', src: avatarUrl, alt: '', width: '20', height: '20' })
          : identityFace(currentViewer.displayName);
        who.append(face, ...identityName(currentViewer.displayName, t.postingAs(currentViewer.displayName)));
      }
    }

    // States, and no longer acts: the strip's one action is the sign-out
    // button beside it, which is wired once per box and outlives this rebuild.
    if (claim) {
      claim.replaceChildren();
      if (currentPhase === 'claimed' && claimedIdentity) {
        claim.append(
          identityFace(claimedIdentity.name),
          ...identityName(claimedIdentity.name, t.claimedAs(claimedIdentity.name)),
        );
      }
    }
  }

  /** The generated face both grades fall back to -- a claimed identity never
      has a picture, and a verified reader only has one once it resolved. */
  function identityFace(name: string): HTMLElement {
    return el('span', {
      class: 'blog-compose__whoface blog-avatar-seed blog-avatar-initials',
      style: `--seed-hue:${seedHue(name)}`,
      'aria-hidden': 'true',
    }, [initials(name)]);
  }

  /** The name as the strip shows it, plus the sentence a screen reader hears
      instead -- which grade this is matters to someone who cannot see that the
      face is a generated one. */
  function identityName(name: string, spoken: string): HTMLElement[] {
    return [
      el('span', { class: 'sr-only' }, [spoken]),
      el('span', { class: 'blog-compose__whoname', 'aria-hidden': 'true' }, [name]),
    ];
  }

  /** Mirrors the two-icon button CommentForm.astro renders; sign-out.ts swaps
      which face is lit. */
  function signOutButton(): HTMLElement {
    const button = el('button', {
      type: 'button',
      class: 'blog-compose__signout',
      'data-compose-signout': '',
      'aria-label': t.signOut,
      title: t.signOut,
    });
    for (const [face, svg] of [['idle', SIGNOUT_ICONS.idle], ['armed', SIGNOUT_ICONS.armed]] as const) {
      const slot = el('span', { class: 'blog-compose__signout-icon', 'data-icon': face });
      slot.append(parseStaticSvg(svg));
      button.append(slot);
    }
    return button;
  }

  /** Forget this reader on this browser, in both grades.

      The `DELETE` is idempotent by contract (see docs/api/comments.md), so it
      goes out for a claimed reader too rather than being guarded on `viewer`:
      a session cookie can outlive the `/me` call that would have revealed it,
      and a sign-out that leaves the cookie standing is the failure worth
      avoiding. A refusal is swallowed for the same reason -- the local record
      still goes, because leaving the name on screen after the reader asked
      for it gone is worse than a stale cookie the next `/me` recovers from. */
  async function signOut(): Promise<void> {
    try {
      await fetch('/api/v2/reader/me', { method: 'DELETE' });
    } catch {
      // Offline, or the request was blocked. Fall through to the local clear.
    }
    try {
      window.localStorage.removeItem(CLAIMED_STORAGE_KEY);
    } catch {
      // The same storage that refused the write. Nothing to undo.
    }
    forgetReaderEmail();
    claimed = null;
    viewer = null;
    phase = 'anonymous';
    applyPhase(compose, phase, claimed, viewer);
    applyPhase(replyBox, phase, claimed, viewer);
    compose.querySelector<HTMLInputElement>('[data-compose-identity] input')?.focus();
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

  // Server-side lifetime is 24h; a comment's dwell check reads this token's
  // age as proof the reader has actually been on the page, not just landed
  // on it. Re-minting after every post used to reset that clock to zero, so
  // a genuine fast follow-up comment (<3s later) looked exactly like a bot
  // filling the box the instant it loaded and got silently swallowed by the
  // server's fake-success tripwire. Keeping the original page-load token
  // across submits is what fixes that; only a token old enough to be near
  // expiry -- a tab left open for most of a day -- is worth refreshing.
  const DWELL_TOKEN_REFRESH_AGE_MS = 20 * 60 * 60 * 1000;

  async function mintDwellToken(): Promise<void> {
    if (dwellToken && Date.now() - dwellTokenMintedAt < DWELL_TOKEN_REFRESH_AGE_MS) return;
    const result = await fetchJson<{ token: string }>('/api/v2/comments/dwell-token');
    if (result) {
      dwellToken = result.token;
      dwellTokenMintedAt = Date.now();
    }
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
