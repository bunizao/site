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
import { validateCompose } from '@/features/comments/compose-validate';
import { getTurnstileToken, releaseTurnstileToken } from '@/features/comments/client/turnstile-token';
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
const ERROR_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v5M12 16h.01"></path></svg>`;
const ALERT_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v6M12 16.5h.01"></path></svg>`;
// Byte-for-byte the bubble in CommentsSection.astro's error notice -- the two
// renderers have to agree, and a dashed stroke is easy to let drift.
const THREAD_ERROR_MARK_SVG = `<svg class="blog-comments__mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 3.5" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="3"></rect><path d="M8.4 16v3.9a.45.45 0 0 0 .75.33L13.6 16"></path></svg>`;

function heartIcon(): SVGElement {
  return parseStaticSvg(
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="${HEART_PATH}"></path></svg>`,
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
    toggleEmptyState(total === 0);
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

    setBusy(box, true);

    const [turnstileToken] = await Promise.all([
      getTurnstileToken(turnstileSiteKey, 'blog_comment_create'),
    ]);

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
    releaseTurnstileToken('blog_comment_create');
    void mintDwellToken();

    setBusy(box, false);

    if (!response.ok) {
      showComposeReceipt(box, 'error');
      return;
    }

    const { outcome, comment, unverifiedEmail } = response.data;
    const receipt: ComposeReceipt = outcome === 'held' ? 'held' : unverifiedEmail ? 'nudge' : 'posted';

    field!.value = '';
    if (field) field.readOnly = false;

    if (phase === 'anonymous') {
      claimed = { name: identity.displayName, email: identity.email };
      writeClaimedIdentity(claimed);
      phase = 'claimed';
      applyPhase(compose, phase, claimed, viewer);
      applyPhase(replyBox, phase, claimed, viewer);
    }

    const row = toBlogComment(comment, {}, t);
    row.own = true;
    const article = renderCommentRow(row, parentId);
    wireCommentRow(article, row, parentId);
    insertNewRow(article, parentId);
    toggleEmptyState(false);
    if (outcome !== 'held') setTally(total + 1);

    if (isReply) {
      closeReplyBox();
    } else {
      showComposeReceipt(box, receipt);
    }
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

  function setBusy(box: HTMLElement, busy: boolean): void {
    box.dataset.receipt = busy ? 'submitting' : box.dataset.receipt ?? 'idle';
    const field = box.querySelector<HTMLTextAreaElement>('.blog-compose__field');
    const submitBtn = box.querySelector<HTMLButtonElement>('[data-compose-submit]');
    if (field) field.readOnly = busy;
    if (submitBtn) submitBtn.disabled = busy;
  }

  function showComposeReceipt(box: HTMLElement, receipt: ComposeReceipt): void {
    box.dataset.receipt = receipt;
    box.querySelector('[data-compose-receipt]')?.remove();
    if (receipt === 'idle' || receipt === 'submitting') return;

    if (receipt === 'error') {
      const node = el('div', { class: 'blog-compose__receipt', 'data-compose-receipt': '', 'aria-live': 'polite' }, [
        el('p', { class: 'blog-compose__error' }, [parseStaticSvg(ERROR_ICON_SVG), t.receiptError]),
      ]);
      box.append(node);
      return;
    }

    const line = el('p', { class: 'blog-compose__receipt-line' }, [receipt === 'held' ? t.receiptHeld : t.receiptPosted]);
    const children: Node[] = [line];

    if (receipt === 'nudge') {
      const nudge = el('div', { class: 'blog-compose__nudge', 'data-compose-nudge': '' }, [
        el('p', { class: 'blog-compose__nudge-text' }, [t.nudgeText]),
        el('label', { class: 'blog-compose__nudge-sub' }, [
          el('input', { type: 'checkbox', 'data-compose-subscribe': '' }),
          t.nudgeSubscribe,
        ]),
        el('button', { type: 'button', class: 'blog-compose__nudge-dismiss', 'data-compose-dismiss': '', 'aria-label': t.dismiss }, [
          parseStaticSvg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"></path></svg>`),
        ]),
      ]);
      nudge.querySelector('[data-compose-dismiss]')?.addEventListener('click', () => { nudge.hidden = true; });
      children.push(nudge);
    }

    box.append(el('div', { class: 'blog-compose__receipt', 'data-compose-receipt': '', 'aria-live': 'polite' }, children));
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
      ]),
      el('div', { class: 'blog-compose__box' }, [
        buildIdentityRow('blog-reply-id'),
        el('label', { class: 'sr-only', for: 'blog-reply-text' }, [t.replyBodyLabel]),
        el('textarea', { id: 'blog-reply-text', class: 'blog-compose__field blog-reply__field', rows: '2' }),
        el('div', { class: 'blog-compose__bar' }, [
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

    const body = el('div', { class: 'blog-comment__body' }, [
      meta,
      el('p', { class: 'blog-comment__text', 'data-comment-text': '' }, [comment.text]),
    ]);

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

  function wireCommentRow(article: HTMLElement, comment: BlogComment, parentId: string | null): void {
    if (comment.tombstone) return;

    const likeBtn = article.querySelector<HTMLButtonElement>('[data-comment-like]');
    likeBtn?.addEventListener('click', () => void toggleLike(comment.id, likeBtn));

    const replyBtn = article.querySelector<HTMLButtonElement>('[data-reply-to]');
    replyBtn?.addEventListener('click', () => {
      const body = article.querySelector<HTMLElement>('.blog-comment__body');
      if (body) openReplyBox(comment.id, comment.author, body);
    });

    if (comment.own) {
      wireOwnRow(article, comment, parentId);
    }
  }

  async function toggleLike(commentId: string, button: HTMLButtonElement): Promise<void> {
    const countEl = button.querySelector<HTMLElement>('[data-like-count]');
    const wasLiked = button.getAttribute('aria-pressed') === 'true';
    const nextLiked = !wasLiked;
    button.setAttribute('aria-pressed', String(nextLiked));
    if (countEl) {
      const current = Number(countEl.textContent ?? 0);
      countEl.textContent = String(Math.max(0, current + (nextLiked ? 1 : -1)));
    }

    const turnstileToken = await getTurnstileToken(turnstileSiteKey, 'blog_reaction');
    const response = await postJson<{ reaction: { count: number; reacted: boolean } }>('/api/v2/reactions/toggle', {
      targetType: 'comment',
      targetId: commentId,
      reacted: nextLiked,
      turnstileToken,
    });
    releaseTurnstileToken('blog_reaction');

    if (!response.ok) {
      button.setAttribute('aria-pressed', String(wasLiked));
      if (countEl) countEl.textContent = String(Math.max(0, Number(countEl.textContent ?? 0) + (wasLiked ? 1 : -1)));
      return;
    }
    button.setAttribute('aria-pressed', String(response.data.reaction.reacted));
    if (countEl) countEl.textContent = String(response.data.reaction.count);
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
      // Typing again withdraws the question.
      field.addEventListener('input', () => armCancel(false));
      cancelBtn?.addEventListener('click', () => {
        const dirty = field.value !== (text.textContent ?? '');
        // Nothing typed, nothing to lose: close on the first press.
        if (dirty && !cancelBtn.classList.contains('blog-comment__act--confirm')) {
          armCancel(true);
          return;
        }
        field.value = text.textContent ?? '';
        setEditing(false);
      });
      saveBtn?.addEventListener('click', () => void saveEdit(comment.id, article, text, field, setEditing));
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

    const input: CommentEditInput = { body };
    const response = await fetch(`/api/v2/comments/${encodeURIComponent(commentId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      field.after(el('p', { class: 'blog-comment__edit-error blog-compose__error' }, [t.editError]));
      return;
    }

    const data = (await response.json()) as CommentEditResult;
    text.textContent = data.comment.body;
    setEditing(false);

    const meta = article.querySelector('.blog-comment__meta');
    if (meta && !meta.querySelector('.blog-comment__edited')) {
      meta.append(el('span', { class: 'blog-comment__edited' }, [t.edited]));
    }
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

async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, status: 0 };
  }
}

function cssEscape(value: string): string {
  return (window as unknown as { CSS?: { escape?: (v: string) => string } }).CSS?.escape?.(value)
    ?? value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
