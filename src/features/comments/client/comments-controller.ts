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
import { revealComposeIdentity } from '@/features/comments/compose-reveal';
import { initials, seedHue } from '@/features/comments/identity';
import type { BlogComment, ClaimedIdentity, ComposeReceipt, ReaderPhase } from '@/features/comments/types';

const CLAIMED_STORAGE_KEY = 'buxx:reader';
const PAGE_SIZE = 20;

const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

// ---------------------------------------------------------------------------
// Turnstile -- invisible-mode widget lifecycle, one per expectedAction.
// Structurally the same load/render/reset shape as subscribe-panel.ts's
// visible widget; this surface just never shows a challenge box for it.
// ---------------------------------------------------------------------------

type TurnstileAction = 'blog_comment_create' | 'blog_reaction';

interface TurnstileWidgetState {
  container: HTMLElement;
  widgetId: string | null;
  tokenPromise: Promise<string> | null;
  resolveCurrent: ((token: string) => void) | null;
}

const turnstileWidgets = new Map<TurnstileAction, TurnstileWidgetState>();
let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (turnstileScriptPromise) return turnstileScriptPromise;
  turnstileScriptPromise = new Promise((resolve) => {
    if ((window as unknown as { turnstile?: unknown }).turnstile) {
      resolve();
      return;
    }
    if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onCommentsTurnstileLoad';
    script.async = true;
    (window as unknown as { onCommentsTurnstileLoad?: () => void }).onCommentsTurnstileLoad = () => resolve();
    document.head.appendChild(script);
  });
  return turnstileScriptPromise;
}

/** Resolves a fresh, single-use Turnstile token for one action. Empty site
    key means Turnstile is unconfigured (e2e fixtures, local dev) -- resolves
    to '' immediately and lets the server's own `not_configured` response
    decide what happens, rather than blocking submission on a widget that
    will never load. */
async function getTurnstileToken(siteKey: string, action: TurnstileAction): Promise<string> {
  if (!siteKey) return '';
  await loadTurnstileScript();
  const turnstile = (window as unknown as { turnstile?: any }).turnstile;
  if (!turnstile) return '';

  let state = turnstileWidgets.get(action);
  if (!state) {
    const container = document.createElement('div');
    container.style.display = 'none';
    document.body.appendChild(container);
    state = { container, widgetId: null, tokenPromise: null, resolveCurrent: null };
    turnstileWidgets.set(action, state);
  }

  if (state.tokenPromise) return state.tokenPromise;

  const captured = state;
  const settle = (token: string) => captured.resolveCurrent?.(token);

  captured.tokenPromise = new Promise<string>((resolve) => {
    captured.resolveCurrent = resolve;
    if (captured.widgetId === null) {
      captured.widgetId = turnstile.render(captured.container, {
        sitekey: siteKey,
        action,
        size: 'invisible',
        callback: settle,
        'error-callback': () => settle(''),
        'expired-callback': () => settle(''),
        'timeout-callback': () => settle(''),
      });
    } else {
      turnstile.reset(captured.widgetId);
    }
  });

  return captured.tokenPromise;
}

/** A token is single-use server-side -- call after every submit (success or
    failure) so the next attempt runs the widget again instead of replaying
    a spent token. */
function releaseTurnstileToken(action: TurnstileAction): void {
  const state = turnstileWidgets.get(action);
  if (state) state.tokenPromise = null;
}

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
const GHOST_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M6 6l12 12"></path></svg>`;
const ERROR_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v5M12 16h.01"></path></svg>`;

function heartIcon(): SVGElement {
  return parseStaticSvg(
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="${HEART_PATH}"></path></svg>`,
  );
}

// ---------------------------------------------------------------------------
// Comment -> BlogComment mapping, and relative-date formatting.
// ---------------------------------------------------------------------------

function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

function toBlogComment(
  comment: Comment,
  reactions: ReactionBatchResult['reactions'],
): BlogComment {
  const reaction = reactions[`comment:${comment.id}`]?.[0];
  return {
    id: comment.id,
    author: comment.tombstone ? '' : comment.author.name,
    date: formatRelativeDate(comment.createdAt),
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
  }

  function showError(): void {
    const error = el(
      'div',
      { class: 'blog-comments__error' },
      [
        el('p', {}, ["Couldn't load comments."]),
        el('button', { type: 'button', class: 'blog-comments__more-btn', 'data-retry-load': '' }, ['Retry']),
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
      node = el('p', { class: 'blog-comments__empty' }, ['Nothing here yet. Be the first to say something.']);
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
    }, [el('span', {}, ['Load more'])]);
    const wrap = el('div', { class: 'blog-comments__more' }, [moreButton]);
    list.append(wrap);
    moreButton.addEventListener('click', () => void loadMore());
  }

  async function loadMore(): Promise<void> {
    if (!moreButton || !nextBefore) return;
    moreButton.setAttribute('aria-busy', 'true');
    moreButton.disabled = true;
    moreButton.textContent = 'Loading';

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
      const row = toBlogComment(comment, reactions);
      const article = renderCommentRow(row, parentId);
      wireCommentRow(article, row, parentId);
      replyBox.before(article);
    }
  }

  // --- Compose (root) submit ------------------------------------------------

  // Capture-phase so this runs before compose-reveal.ts's own bubble-phase
  // listener on the same button -- reading `identity.hidden` here always
  // sees the pre-click state, which is what decides "this press only
  // revealed the row" vs. "this press should actually submit". See the
  // task notes: this is the one place a click's meaning depends on state a
  // sibling script is about to mutate.
  document.addEventListener('click', (event) => {
    const submitBtn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-compose-submit]');
    if (!submitBtn) return;
    const box = submitBtn.closest<HTMLElement>('.blog-compose');
    if (!box) return;
    const identity = box.querySelector<HTMLElement>('[data-compose-identity]');
    const wasOpen = identity ? !identity.hidden : false;
    const boxPhase = box.dataset.phase ?? 'anonymous';
    if (boxPhase === 'anonymous' && !wasOpen) return; // let compose-reveal.ts do the reveal
    void handleSubmit(box);
  }, { capture: true });

  async function handleSubmit(box: HTMLElement): Promise<void> {
    const field = box.querySelector<HTMLTextAreaElement>('.blog-compose__field');
    const text = field?.value.trim() ?? '';
    if (!text) return;

    const isReply = box === replyBox;
    const parentId = isReply ? box.dataset.replyTarget ?? null : null;
    const identity = readIdentity(box);
    if (!identity) return; // anonymous with no name/email typed yet -- nothing to send

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

    const row = toBlogComment(comment, {});
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
        el('p', { class: 'blog-compose__error' }, [parseStaticSvg(ERROR_ICON_SVG), "Couldn't post that — your draft is still here. Try again."]),
      ]);
      box.append(node);
      return;
    }

    const line = el('p', { class: 'blog-compose__receipt-line' }, [receipt === 'held' ? '评论已提交，正在等待审核' : '已发布']);
    const children: Node[] = [line];

    if (receipt === 'nudge') {
      const nudge = el('div', { class: 'blog-compose__nudge', 'data-compose-nudge': '' }, [
        el('p', { class: 'blog-compose__nudge-text' }, ['确认邮箱后可管理评论、接收回复通知']),
        el('label', { class: 'blog-compose__nudge-sub' }, [
          el('input', { type: 'checkbox', 'data-compose-subscribe': '' }),
          '订阅新文章邮件',
        ]),
        el('button', { type: 'button', class: 'blog-compose__nudge-dismiss', 'data-compose-dismiss': '', 'aria-label': 'Dismiss' }, [
          parseStaticSvg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"></path></svg>`),
        ]),
      ]);
      nudge.querySelector('[data-compose-dismiss]')?.addEventListener('click', () => { nudge.hidden = true; });
      children.push(nudge);
    }

    box.append(el('div', { class: 'blog-compose__receipt', 'data-compose-receipt': '', 'aria-live': 'polite' }, children));
  }

  // --- Reply box --------------------------------------------------------

  function buildReplyBox(): HTMLElement {
    const box = el('div', { class: 'blog-compose blog-reply', id: 'blog-reply', 'data-phase': phase, hidden: '' }, [
      el('div', { class: 'blog-compose__box' }, [
        el('label', { class: 'sr-only', for: 'blog-reply-text' }, ['Write a reply']),
        el('textarea', { id: 'blog-reply-text', class: 'blog-compose__field blog-reply__field', rows: '2' }),
        buildIdentityRow('blog-reply-id'),
        el('div', { class: 'blog-compose__foot' }, [
          el('span', { class: 'blog-reply__label', 'data-reply-label': '' }),
          el('span', { class: 'blog-reply__buttons' }, [
            el('button', { type: 'button', class: 'blog-comment__act', 'data-reply-cancel': '' }, ['Cancel']),
            el('button', { type: 'button', class: 'blog-compose__go', 'data-compose-submit': '', 'aria-expanded': 'false', 'aria-controls': 'blog-reply-id' }, ['Reply']),
          ]),
        ]),
      ]),
    ]);
    return box;
  }

  function buildIdentityRow(id: string): HTMLElement {
    return el('div', { class: 'blog-compose__identity', id, 'data-compose-identity': '', hidden: '' }, [
      el('label', { class: 'sr-only', for: `${id}-name` }, ['Display name']),
      el('input', { id: `${id}-name`, class: 'blog-compose__input blog-compose__input--name', type: 'text', maxlength: '32', autocomplete: 'nickname', placeholder: 'Name', required: '' }),
      el('label', { class: 'sr-only', for: `${id}-email` }, ['Email']),
      el('input', { id: `${id}-email`, class: 'blog-compose__input', type: 'email', autocomplete: 'email', placeholder: 'Email', required: '' }),
      el('input', {
        type: 'text', name: 'website', 'data-honeypot': '', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true',
        style: 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;',
      }),
    ]);
  }

  function wireReplyBoxMechanics(): void {
    replyBox.querySelector('[data-reply-cancel]')?.addEventListener('click', closeReplyBox);
    replyBox.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') closeReplyBox();
    });
  }

  function openReplyBox(commentId: string, authorName: string, rowBody: HTMLElement): void {
    const wasOpenFor = replyBox.dataset.replyTarget;
    closeReplyBox();
    if (wasOpenFor === commentId) return; // pressing the same row's Reply again just closes it

    replyBox.dataset.replyTarget = commentId;
    const label = replyBox.querySelector<HTMLElement>('[data-reply-label]');
    if (label) label.textContent = `Replying to ${authorName}`;
    replyField.placeholder = `Reply to ${authorName}…`;
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
    const submit = replyBox.querySelector<HTMLButtonElement>('[data-compose-submit]');
    const identity = replyBox.querySelector<HTMLElement>('[data-compose-identity]');
    submit?.setAttribute('aria-expanded', 'false');
    if (identity) identity.hidden = true;
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
          el('p', { class: 'blog-comment__text blog-comment__text--tombstone' }, ['此评论已删除']),
        ]),
      ]);
      if (parentId) article.dataset.parentId = parentId;
      return article;
    }

    const meta = el('div', { class: 'blog-comment__meta' }, [el('span', { class: 'blog-comment__author' }, [comment.author])]);
    if (comment.byAuthor) meta.append(el('span', { class: 'blog-comment__badge' }, ['Author']));
    meta.append(el('span', { class: 'blog-comment__date' }, [comment.date]));
    if (comment.edited) meta.append(el('span', { class: 'blog-comment__edited' }, ['(edited)']));

    const body = el('div', { class: 'blog-comment__body' }, [
      meta,
      el('p', { class: 'blog-comment__text', 'data-comment-text': '' }, [comment.text]),
    ]);

    if (comment.own && !comment.held) {
      const editBox = el('div', { class: 'blog-compose__box blog-comment__edit', 'data-comment-edit-box': '', hidden: '' }, [
        el('label', { class: 'sr-only', for: `comment-edit-${comment.id}` }, ['Edit your comment']),
        el('textarea', { id: `comment-edit-${comment.id}`, class: 'blog-compose__field blog-comment__edit-field', 'data-comment-edit-field': '', rows: '2' }, [comment.text]),
        el('div', { class: 'blog-comment__edit-actions' }, [
          el('button', { type: 'button', class: 'blog-comment__act', 'data-comment-edit-cancel': '' }, ['Cancel']),
          el('button', { type: 'button', class: 'blog-compose__go', 'data-comment-edit-save': '' }, ['Save']),
        ]),
      ]);
      body.append(editBox);
    }

    if (comment.held) {
      body.append(el('p', { class: 'blog-comment__note' }, ['Held for review. Only you can see this until it clears.']));
    } else {
      const actions = el('div', { class: 'blog-comment__actions' }, [
        el('button', {
          type: 'button', class: 'blog-comment__act blog-comment__act--like', 'data-comment-like': '',
          'aria-pressed': comment.liked ? 'true' : 'false', 'aria-label': `Like ${comment.author}'s comment`,
        }, [heartIcon(), el('span', { class: 'blog-comment__act-count', 'data-like-count': '' }, [String(comment.likes ?? 0)])]),
        el('button', { type: 'button', class: 'blog-comment__act', 'data-reply-to': comment.id, 'data-reply-name': comment.author }, [parseStaticSvg(REPLY_ICON_SVG), 'Reply']),
      ]);
      if (comment.own) {
        actions.append(
          el('button', { type: 'button', class: 'blog-comment__act', 'data-comment-edit-open': '' }, ['Edit']),
          el('span', { class: 'blog-comment__edit-window', 'data-edit-countdown': '', hidden: '' }),
          el('button', { type: 'button', class: 'blog-comment__act', 'data-comment-delete': '' }, ['Delete']),
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
    const actions = article.querySelector<HTMLElement>('.blog-comment__actions');
    const text = article.querySelector<HTMLElement>('[data-comment-text]');
    const editBox = article.querySelector<HTMLElement>('[data-comment-edit-box]');
    const field = article.querySelector<HTMLTextAreaElement>('[data-comment-edit-field]');

    if (openBtn && text && editBox && field) {
      openBtn.addEventListener('click', () => {
        text.hidden = true;
        editBox.hidden = false;
        if (actions) actions.hidden = true;
        field.focus();
      });
      cancelBtn?.addEventListener('click', () => {
        field.value = text.textContent ?? '';
        editBox.hidden = true;
        text.hidden = false;
        if (actions) actions.hidden = false;
      });
      saveBtn?.addEventListener('click', () => void saveEdit(comment.id, article, text, editBox, field, actions));
    }

    deleteBtn?.addEventListener('click', () => void deleteComment(comment.id, article, parentId));

    if (comment.editDeadline) startEditCountdown(article, comment.editDeadline, openBtn);
  }

  async function saveEdit(
    commentId: string,
    article: HTMLElement,
    text: HTMLElement,
    editBox: HTMLElement,
    field: HTMLTextAreaElement,
    actions: HTMLElement | null,
  ): Promise<void> {
    const body = field.value.trim();
    if (!body) return;
    editBox.querySelector('.blog-comment__edit-error')?.remove();

    const input: CommentEditInput = { body };
    const response = await fetch(`/api/v2/comments/${encodeURIComponent(commentId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      editBox.append(el('p', { class: 'blog-comment__edit-error blog-compose__error' }, ["Couldn't save that edit."]));
      return;
    }

    const data = (await response.json()) as CommentEditResult;
    text.textContent = data.comment.body;
    editBox.hidden = true;
    text.hidden = false;
    if (actions) actions.hidden = false;

    const meta = article.querySelector('.blog-comment__meta');
    if (meta && !meta.querySelector('.blog-comment__edited')) {
      meta.append(el('span', { class: 'blog-comment__edited' }, ['(edited)']));
    }
  }

  async function deleteComment(commentId: string, article: HTMLElement, parentId: string | null): Promise<void> {
    if (!window.confirm('Delete this comment?')) return;
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

  function startEditCountdown(article: HTMLElement, deadline: number, editBtn: HTMLButtonElement | null): void {
    const countdown = article.querySelector<HTMLElement>('[data-edit-countdown]');
    if (!editBtn || !countdown) return;

    function tick(): boolean {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        editBtn!.hidden = true;
        countdown!.hidden = true;
        return false;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      countdown!.hidden = false;
      countdown!.textContent = `${mins}:${String(secs).padStart(2, '0')} to edit`;
      return true;
    }

    if (!tick()) return;
    const id = window.setInterval(() => {
      if (!tick()) window.clearInterval(id);
    }, 1000);
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
        who.append(face, `Posting as ${currentViewer.displayName}`);
      }
    }

    if (claim) {
      claim.replaceChildren();
      if (currentPhase === 'claimed' && claimedIdentity) {
        const switchBtn = el('button', { type: 'button', class: 'blog-compose__claim-switch', 'data-compose-switch': '' }, ['换一个']);
        switchBtn.addEventListener('click', () => {
          phase = 'anonymous';
          applyPhase(compose, phase, claimed, viewer);
          applyPhase(replyBox, phase, claimed, viewer);
          revealComposeIdentity(box);
        });
        claim.append(`以 ${claimedIdentity.name} 评论`, switchBtn);
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
    try {
      window.localStorage.setItem(CLAIMED_STORAGE_KEY, JSON.stringify(identity));
    } catch {
      // Private browsing or a full quota -- the claim just won't survive reload.
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
