import type { Comment, CommentListResult, CommentsMode } from '@bunizao/contracts/comments';
import {
  asText,
  buildCommentContentFragment,
  createCommentReplyQuote,
  createCommentSourceChip,
  dedupeNewComments,
  formatRelativeCommentDate,
  pinFirst,
  readCommentReplyTarget,
  sanitizeImageUrl,
  type CommentReplyTarget,
} from '@/features/mood/shared/comments';
import { readOwnCommentIds, rememberOwnCommentId } from '@/features/mood/shared/own-comments';
import { hydrateMoodRichText } from '@/features/mood/client/rich-text';
import {
  resolveCommentsCopy,
  resolveMoodCommentsCopy,
  type CommentsCopy,
  type MoodCommentsCopy,
} from '@/features/comments/copy';
import { initials } from '@/features/comments/identity';
import { markEmailRequired } from '@/features/comments/compose-validate';
import { moodCommentsUrl, moodSiteCommentsUrl } from '@/features/comments/api-urls';
import { NO_THREAD_MARKS, readThreadMarks, type ThreadMarks } from '@/features/comments/thread-marks';
import { commentMarkdownToHtml } from '@/features/comments/comment-markdown';
import { safeReaderAvatarUrl } from '@/features/comments/reader-avatar';
import { fetchPrefetched } from '@/lib/api-prefetch';
import { SLOW_VERDICT_MS } from '@/features/comments/verdict-poll';

interface CommentReactionData {
  emoji?: string;
  emojiId?: string;
  emojiImage?: string;
  count?: string;
  isPaid?: boolean;
}

export interface CommentData {
  id?: string;
  author?: string;
  authorAvatar?: string;
  datetime?: string;
  content?: string;
  reactions?: CommentReactionData[];
  replyTo?: {
    id?: string;
    author?: string;
    text?: string;
  };
  /** Omitted means `telegram` -- see MoodComment in packages/contracts. */
  origin?: 'telegram' | 'web';
  /** The site comment row behind a `web` item. Also what a reply to it sends
      back as `parentId` -- a `telegram` item's parent is its own `id`
      instead, the scraped Telegram message id (see
      plans/mood-comments-bridge.md "Interaction matrix"). */
  commentId?: string;
  /** `commentAnchorToken(commentId)`; present rows render as `id="c-<token>"`
      instead of the legacy `id="comment-<id>"`. */
  anchorToken?: string;
}

interface DetailCommentsOptions {
  alwaysLoading?: boolean;
  hydrateAnimatedEmoji?: (root?: ParentNode) => void;
}

const REFRESH_INTERVAL_MS = 45_000;
const MIN_REFRESH_GAP_MS = 5_000;
// The live poll pauses while the thread is further than this below the
// viewport, and slows down after this long with no pointer, key or scroll
// input.
const LIVE_REFRESH_ROOT_MARGIN = '0px 0px 400px 0px';
const LIVE_REFRESH_IDLE_MS = 10 * 60_000;
// Idle never means stopped -- a reader who is still on the tab, still
// looking at the thread, but has not touched anything (no scroll left to
// make, nothing to type) still gets replies within a few minutes rather than
// never. Well above REFRESH_INTERVAL_MS so idle really does cost less, well
// under LIVE_REFRESH_IDLE_MS so it has already ticked at least once before a
// reader could plausibly have left instead.
const LIVE_REFRESH_IDLE_INTERVAL_MS = 3 * 60_000;

// Module-level rather than closed over by initMoodDetailComments: both the
// page script and detail-compose.ts import this module, and ES modules are
// singletons per specifier, so this is one shared thread state either way --
// no event bus needed for detail-compose.ts's optimistic insert to land in
// the same list the poll and load-more are also touching.
let commentsListEl: HTMLElement | null = null;
let countEl: HTMLElement | null = null;
let emptyEl: HTMLElement | null = null;
let hydrateAnimatedEmoji: ((root?: ParentNode) => void) | undefined;
let discussionRepliesEnabled = false;
// The page decides the language and stamps it on the thread root; init reads
// it once, the same way it reads discussionRepliesEnabled.
let locale = 'en';
let t: MoodCommentsCopy = resolveMoodCommentsCopy(locale);
// The pin and lock words are the blog's, so both threads say them the same way.
let shared: CommentsCopy = resolveCommentsCopy(locale);
// The owner's pin and locks, read off the site's first page (thread-marks.ts),
// and whether the post takes new comments at all (`policy.mode`). Both are
// known before the first row is drawn, so no row changes after it lands.
let marks: ThreadMarks = NO_THREAD_MARKS;
let repliesOpen = true;

const loadedCommentIds = new Set<string>();
const loadedSiteCommentIds = new Set<string>();
const anchorTokens = new Map<string, string>();
const ownCommentIds = readOwnCommentIds();
// Reply cards whose parent was not on the page when they rendered. They are
// upgraded to anchors once a later batch brings the parent in.
let unlinkedReplyQuotes: Array<{ quote: HTMLElement; replyTo: CommentReplyTarget }> = [];

const getCommentAnchor = (commentId: string): string => {
  const token = anchorTokens.get(commentId);
  return token ? `#c-${token}` : `#comment-${commentId}`;
};

const getOldestCommentId = (comments: CommentData[]): string => {
  let oldest: CommentData | null = null;
  for (const comment of comments) {
    if (!comment?.datetime) continue;
    const currentTime = Date.parse(comment.datetime);
    if (Number.isNaN(currentTime)) continue;
    if (!oldest) {
      oldest = comment;
      continue;
    }
    const oldestTime = Date.parse(oldest.datetime ?? '');
    if (Number.isNaN(oldestTime) || currentTime < oldestTime) {
      oldest = comment;
    }
  }
  return oldest?.id || comments[0]?.id || '';
};

const getInitials = (name: string): string => initials(name).toUpperCase() || '?';

/** Text a reader typed, out of the HTML `content` a Telegram scrape or the
    server's markdown renderer produced -- for the reply button's preview
    attribute only, never rendered as markup. */
function plainTextPreview(html: string, maxLen = 160): string {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const text = (holder.textContent || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

function renderComment(comment: CommentData): HTMLElement {
  const root = document.createElement('div');
  root.className = 'mood-comment';
  const commentId = asText(comment?.id).trim();
  const siteCommentId = asText(comment?.commentId).trim();
  const anchorToken = asText(comment?.anchorToken).trim();
  // Omitted origin means `telegram` -- see MoodComment in packages/contracts.
  const origin = comment?.origin === 'web' ? 'web' : 'telegram';
  root.dataset.origin = origin;

  if (commentId) {
    root.dataset.commentId = commentId;
    if (anchorToken) {
      anchorTokens.set(commentId, anchorToken);
      root.id = `c-${anchorToken}`;
    } else {
      root.id = getCommentAnchor(commentId).slice(1);
    }
  }
  if (siteCommentId) {
    root.dataset.siteCommentId = siteCommentId;
    if (ownCommentIds.has(siteCommentId)) root.classList.add('mood-comment--mine');
  }
  // Only a site row can carry the owner's marks; a Telegram message never
  // matches, since the marks are keyed by site comment id.
  const pinned = siteCommentId !== '' && siteCommentId === marks.pinnedId;
  const locked = siteCommentId !== '' && marks.lockedRoots.has(siteCommentId);
  if (pinned) root.dataset.pinned = 'true';
  if (locked) root.dataset.locked = 'true';

  const avatar = document.createElement('div');
  avatar.className = 'mood-comment-avatar';
  const author = asText(comment?.author).trim() || t.anonymous;
  const avatarUrl = sanitizeImageUrl(comment?.authorAvatar);
  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = author;
    img.loading = 'lazy';
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitials(author);
  }
  root.appendChild(avatar);

  const body = document.createElement('div');
  body.className = 'mood-comment-body';

  const header = document.createElement('div');
  header.className = 'mood-comment-header';

  const authorEl = document.createElement('span');
  authorEl.className = 'mood-comment-author';
  authorEl.textContent = author;

  const datetimeRaw = asText(comment?.datetime).trim();
  const dateEl = document.createElement('time');
  dateEl.className = 'mood-comment-date';
  if (datetimeRaw) {
    dateEl.dateTime = datetimeRaw;
  }
  dateEl.textContent = formatRelativeCommentDate(datetimeRaw, { locale });

  const sourceLabel =
    origin === 'web' ? t.sourceWeb : t.sourceTelegram;

  header.appendChild(authorEl);
  if (pinned) {
    const badge = document.createElement('span');
    badge.className = 'mood-comment-badge';
    badge.textContent = shared.pinnedBadge;
    header.appendChild(badge);
  }
  header.appendChild(dateEl);
  header.appendChild(createCommentSourceChip(origin, t.sourceAria(sourceLabel)));
  body.appendChild(header);

  const contentEl = document.createElement('div');
  contentEl.className = 'mood-comment-content';
  const replyTo = readCommentReplyTarget(comment?.replyTo);
  if (replyTo) {
    const linked = loadedCommentIds.has(replyTo.id);
    const quote = createCommentReplyQuote(replyTo, linked ? getCommentAnchor(replyTo.id) : '');
    if (!linked) {
      unlinkedReplyQuotes.push({ quote, replyTo });
    }
    contentEl.appendChild(quote);
  }
  const contentHtml = asText(comment?.content);
  contentEl.appendChild(buildCommentContentFragment(contentHtml));
  body.appendChild(contentEl);

  // Reactions and the reply button share one row. Stacked, they cost the
  // bubble two lines of height for two small controls.
  const footer = document.createElement('div');
  footer.className = 'mood-comment-footer';

  const reactions = Array.isArray(comment?.reactions) ? comment.reactions : [];
  if (reactions.length > 0) {
    const reactionsWrap = document.createElement('div');
    reactionsWrap.className = 'mood-comment-reactions';

    reactions.forEach((reaction) => {
      const pill = document.createElement('span');
      pill.className = `mood-reaction${reaction?.isPaid ? ' mood-reaction--paid' : ''}`;

      const emojiEl = document.createElement('span');
      emojiEl.className = 'mood-reaction-emoji';
      if (reaction?.isPaid) {
        emojiEl.textContent = '⭐';
      } else if (reaction?.emojiImage || reaction?.emojiId) {
        const wrapper = document.createElement('span');
        wrapper.className = 'tg-emoji';
        if (reaction?.emojiId) {
          wrapper.dataset.emojiId = reaction.emojiId;
        }
        if (reaction?.emojiImage) {
          const img = document.createElement('img');
          img.src = reaction.emojiImage;
          img.alt = reaction.emoji || 'emoji';
          img.loading = 'lazy';
          img.decoding = 'async';
          img.width = 16;
          img.height = 16;
          wrapper.appendChild(img);
        } else if (reaction?.emoji) {
          wrapper.textContent = reaction.emoji;
        }
        emojiEl.appendChild(wrapper);
      } else {
        emojiEl.textContent = asText(reaction?.emoji).trim() || '👍';
      }

      const reactionCountEl = document.createElement('span');
      reactionCountEl.className = 'mood-reaction-count';
      reactionCountEl.textContent = asText(reaction?.count).trim();

      pill.appendChild(emojiEl);
      pill.appendChild(reactionCountEl);
      reactionsWrap.appendChild(pill);
    });

    footer.appendChild(reactionsWrap);
  }

  // Reply affordance. A `web` item always has a site comment row behind it,
  // so replying to it is always safe -- the parent id is that row's own id.
  // A `telegram` item (or one with no `origin`, which means the same thing)
  // only accepts a reply once the read path has verified the scrape's ids
  // really are the group's message ids -- discussionRepliesEnabled, read off
  // MoodContentDocument by the page and passed down as a data attribute.
  //
  // Neither holds on a post the owner closed (`repliesOpen`), nor in a thread
  // they locked: the root and every reply under it (thread-marks.ts). A lock
  // reaches site replies only -- a Telegram message's Reply answers the
  // message itself, which the server never checks against a lock.
  const canReply = repliesOpen
    && !(siteCommentId && marks.noReply.has(siteCommentId))
    && (origin === 'web' ? Boolean(siteCommentId) : discussionRepliesEnabled);
  if (canReply && commentId) {
    const replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.className = 'mood-comment-reply-btn';
    replyBtn.textContent = t.reply;
    replyBtn.dataset.commentReplyParentId = origin === 'web' ? siteCommentId : commentId;
    replyBtn.dataset.commentReplyAuthor = author;
    replyBtn.dataset.commentReplyText = plainTextPreview(contentHtml);
    footer.appendChild(replyBtn);
  } else if (locked && repliesOpen) {
    // Said once, on the root, where Reply would have been. On a closed post
    // the capsule already says it for the whole thread.
    const closed = document.createElement('span');
    closed.className = 'mood-comment-closed';
    closed.textContent = shared.repliesClosed;
    footer.appendChild(closed);
  }

  if (footer.childElementCount > 0) body.appendChild(footer);

  root.appendChild(body);
  return root;
}

function linkReplyQuotes(): void {
  unlinkedReplyQuotes = unlinkedReplyQuotes.filter(({ quote, replyTo }) => {
    if (!loadedCommentIds.has(replyTo.id)) return true;
    quote.replaceWith(createCommentReplyQuote(replyTo, getCommentAnchor(replyTo.id)));
    return false;
  });
}

function syncCommentsCount(): void {
  if (countEl) countEl.textContent = String(loadedCommentIds.size);
}

function addComments(comments: CommentData[], append: boolean): number {
  if (!commentsListEl) return 0;

  if (!append) {
    loadedCommentIds.clear();
    loadedSiteCommentIds.clear();
    anchorTokens.clear();
    unlinkedReplyQuotes = [];
  }

  const uniqueComments = dedupeNewComments(comments, loadedCommentIds, loadedSiteCommentIds);
  uniqueComments.forEach((comment) => {
    const id = asText(comment.id).trim();
    const siteId = asText(comment.commentId).trim();
    if (id) loadedCommentIds.add(id);
    if (siteId) loadedSiteCommentIds.add(siteId);
  });

  const fragment = document.createDocumentFragment();
  uniqueComments.forEach((comment) => {
    fragment.appendChild(renderComment(comment));
  });

  if (append) {
    commentsListEl.appendChild(fragment);
  } else {
    commentsListEl.replaceChildren(fragment);
  }
  linkReplyQuotes();

  return uniqueComments.length;
}

/** The periodic and focus-regain refresh. Fetches only the newest page --
    anything genuinely new is newer than everything a `before` cursor could
    have paged in, so this alone is enough to catch it regardless of how many
    older pages "load more" has already brought in. Comments already on the
    page (by `id` or by `commentId`, see dedupeNewComments) are dropped before
    a single DOM node is touched: no re-render, no layout shift, on the
    ordinary tick where nothing changed. */
let lastRefreshAt = 0;

async function refreshLiveComments(postId: string): Promise<void> {
  if (document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (now - lastRefreshAt < MIN_REFRESH_GAP_MS) return;
  lastRefreshAt = now;

  try {
    const response = await fetch(moodCommentsUrl(postId));
    if (!response.ok) return;
    const data = await response.json() as { comments?: CommentData[] };
    const comments = data.comments ?? [];
    if (comments.length === 0) return;

    const added = addComments(comments, true);
    if (added > 0 && commentsListEl) {
      // A thread that first rendered empty still has the empty note on
      // screen; the first comment to arrive on a tick has to clear it.
      if (emptyEl) emptyEl.hidden = true;
      hydrateAnimatedEmoji?.(commentsListEl);
      hydrateMoodRichText(commentsListEl);
      syncCommentsCount();
    }
  } catch {
    /* Best effort -- the next tick or the next focus regain tries again. */
  }
}

/** Polls only while someone could see the result: the tab visible, the
    thread within LIVE_REFRESH_ROOT_MARGIN of the viewport. Full speed while
    the reader has done something in the last LIVE_REFRESH_IDLE_MS; once idle
    it drops to LIVE_REFRESH_IDLE_INTERVAL_MS rather than stopping outright --
    a reader who is still there, tab focused, just not touching anything,
    fires none of visibilitychange/focus (both need a transition, and this
    reader never left) or pointerdown/keydown/scroll/touchstart (nothing left
    to scroll, nothing to type), so a hard stop here would never resume on
    its own. Coming back -- scrolling the thread into view, returning to the
    tab, any input after an idle stretch -- still refreshes at once when the
    last fetch is older than one interval. */
function startLiveRefresh(postId: string, section: Element): void {
  // The initial load just ran; the next fetch is a full interval away.
  lastRefreshAt = Date.now();
  // Assume the thread is on screen until the observer says otherwise, so a
  // missing IntersectionObserver never stops the poll.
  let inView = true;
  let lastActivityAt = Date.now();

  const isIdle = (): boolean => Date.now() - lastActivityAt >= LIVE_REFRESH_IDLE_MS;
  const tick = (): void => {
    if (!inView) return;
    if (isIdle() && Date.now() - lastRefreshAt < LIVE_REFRESH_IDLE_INTERVAL_MS) return;
    void refreshLiveComments(postId);
  };
  const tickIfStale = (): void => {
    if (Date.now() - lastRefreshAt >= REFRESH_INTERVAL_MS) tick();
  };
  const markActive = (): void => {
    const wasIdle = isIdle();
    lastActivityAt = Date.now();
    if (wasIdle) tickIfStale();
  };

  window.setInterval(tick, REFRESH_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    lastActivityAt = Date.now();
    tick();
  });
  window.addEventListener('focus', () => {
    lastActivityAt = Date.now();
    tick();
  });
  for (const type of ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const) {
    window.addEventListener(type, markActive, { passive: true, capture: true });
  }

  if (typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.at(-1);
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) tickIfStale();
    }, { rootMargin: LIVE_REFRESH_ROOT_MARGIN });
    observer.observe(section);
  }
}

/* --- The reader's own comment, from press to verdict --------------------

   Three states, one row. It appears under the finger the moment Post is
   pressed (`insertGhostComment`), takes on the server's version of itself
   when the write comes back (`replaceGhostComment`), and stops breathing
   when the moderation verdict lands (`settleOwnComment`). A refused write
   takes it back (`dropGhostComment`) and detail-compose.ts puts the words
   back in the box.

   This replaced a banner over the compose box that said the comment had
   been posted somewhere the reader could not see it. It was shown on nearly
   every comment, because site-api gives the spam check 1.5 seconds and
   finishes the request without it -- so `held` is the ordinary answer, not
   a verdict -- and it never came down, because nothing on the page was
   watching for the flip. The reader was told their comment was invisible,
   and then the thread went on not containing it. */

/** The stand-in, keyed by a throwaway id. Registered in the loaded-id sets
    like any other row so the refresh tick cannot render a second copy
    underneath it. Inserted at the top, under the owner's pin if there is one:
    this is always the newest comment on the page, and load-more only ever
    brings in older ones at the bottom.
    No-ops if the thread never finished mounting (a `#comments-readonly` post
    has no compose box to call this from anyway). */
export function insertGhostComment(key: string, comment: CommentData): void {
  if (!commentsListEl) return;
  loadedCommentIds.add(key);
  loadedSiteCommentIds.add(key);
  ownCommentIds.add(key);

  if (emptyEl) emptyEl.hidden = true;
  const node = renderComment({ ...comment, id: key, commentId: key });
  markPending(node);
  prependRow(node);
  linkReplyQuotes();
  hydrateAnimatedEmoji?.(commentsListEl);
  hydrateMoodRichText(commentsListEl);
  syncCommentsCount();
}

/** Swaps the stand-in for a row built from what the server actually returned
    -- the real id, the anchor token a bridged reply will later match on, the
    avatar behind a verified address. The stand-in is thrown away whole
    rather than patched, which is what let it guess freely at the parts it
    could not know.

    The row stays pending: this swap is about identity, and the verdict is
    what settleOwnComment is waiting on.

    It also survives the scrape catching up. `commentId` is the id the read
    path's overlay carries for a bridged row (see mood/shared/own-comments.ts),
    and it is registered here, so `dedupeNewComments` drops the server's copy
    on a later refresh tick instead of rendering it twice. */
export function replaceGhostComment(key: string, comment: CommentData): void {
  const node = findOwnComment(key);
  forgetOwnComment(key);

  const id = asText(comment?.id).trim();
  const siteCommentId = asText(comment?.commentId).trim();
  if (id) loadedCommentIds.add(id);
  if (siteCommentId) {
    loadedSiteCommentIds.add(siteCommentId);
    ownCommentIds.add(siteCommentId);
    rememberOwnCommentId(siteCommentId);
  }

  const fresh = renderComment(comment);
  markPending(fresh, Number(node?.dataset.pendingSince) || Date.now());
  if (node) node.replaceWith(fresh);
  else prependRow(fresh);
  linkReplyQuotes();
  if (commentsListEl) {
    hydrateAnimatedEmoji?.(commentsListEl);
    hydrateMoodRichText(commentsListEl);
  }
  syncCommentsCount();
}

/** Takes the stand-in back when the write was refused. Nothing the reader
    wrote is lost by the row going -- detail-compose.ts returns the words to
    the box in the same breath. */
export function dropGhostComment(key: string): void {
  const node = findOwnComment(key);
  forgetOwnComment(key);
  node?.remove();
  syncCommentsCount();
  if (emptyEl && commentsListEl && !commentsListEl.querySelector('.mood-comment')) {
    emptyEl.hidden = false;
  }
}

/** The verdict landed, or the wait for it ran out.

    Published is the overwhelmingly common ending and it leaves nothing
    behind: the bubble stops breathing, the note goes, and the row is a
    comment in the thread like any other. Only a wait that genuinely ended in
    a hold keeps a note, and then it says the one fact that matters --
    everyone else is looking at a thread this row is not in.

    No-ops on a row the page no longer has; the poll can outlive it. */
export function settleOwnComment(siteCommentId: string, held: boolean, awaitingEmail = false): void {
  const node = findOwnComment(siteCommentId);
  if (!node) return;
  delete node.dataset.pending;
  const note = node.querySelector<HTMLElement>('.mood-comment__note');
  if (!held) {
    note?.remove();
    const reply = node.querySelector<HTMLButtonElement>('.mood-comment-reply-btn');
    if (reply) reply.hidden = false;
    return;
  }
  if (note) note.textContent = awaitingEmail ? t.awaitingEmail : t.held;
}

/** The breathing bubble and the word under it -- see `.mood-comment
    [data-pending]` in CommentCompose.astro for why it breathes rather than
    spins.

    Reply goes away for the duration. A reply is addressed to a comment by
    id, and a row that is still waiting on its verdict either has no id the
    server would recognise (the stand-in's is a throwaway) or has one whose
    thread nobody else can see. Offering the button would buy a THREAD
    refusal at best. settleOwnComment gives it back. */
function markPending(node: HTMLElement, since = Date.now()): void {
  node.dataset.pending = 'true';
  // Carried from the stand-in to the row that replaces it, so a long wait
  // does not start over at "Publishing".
  node.dataset.pendingSince = String(since);
  const body = node.querySelector<HTMLElement>('.mood-comment-body') ?? node;
  const note = document.createElement('p');
  note.className = 'mood-comment__note';
  note.setAttribute('role', 'status');
  const slowIn = since + SLOW_VERDICT_MS - Date.now();
  note.textContent = slowIn > 0 ? t.publishing : t.publishingSlow;
  if (slowIn > 0) {
    window.setTimeout(() => {
      if (node.dataset.pending) note.textContent = t.publishingSlow;
    }, slowIn);
  }
  // Under the words, above the footer -- it is about the comment, not one
  // more control in the row of them.
  body.insertBefore(note, body.querySelector('.mood-comment-footer'));
  const reply = node.querySelector<HTMLButtonElement>('.mood-comment-reply-btn');
  if (reply) reply.hidden = true;
}

/** The top of the thread is the row under the pin: the pin leads whatever
    is written after it, the way the blog thread keeps it. */
function prependRow(node: HTMLElement): void {
  const pin = commentsListEl?.querySelector(':scope > .mood-comment[data-pinned]');
  if (pin) pin.after(node);
  else commentsListEl?.prepend(node);
}

/** A site comment row as a thread item, in the shape the read path's overlay
    gives a `web` row: the writer's own row once the create answers, and a
    pinned row this page of the scrape does not carry. Its Telegram
    reactions are not known here, so it has none. */
export function moodItemFromSiteComment(comment: Comment): CommentData {
  return {
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
}

function findOwnComment(key: string): HTMLElement | null {
  return commentsListEl?.querySelector<HTMLElement>(
    `.mood-comment[data-site-comment-id="${CSS.escape(key)}"]`,
  ) ?? null;
}

function forgetOwnComment(key: string): void {
  loadedCommentIds.delete(key);
  loadedSiteCommentIds.delete(key);
  ownCommentIds.delete(key);
}

/** The site's first page of this thread: the owner's pin, locks and mode,
    which the scrape behind `/api/comments` has no field for. Any failure
    means none of them -- the thread draws as the scrape has it, and the
    server still refuses a write the owner closed. */
async function readSiteThread(postId: string): Promise<CommentListResult | null> {
  try {
    const response = await fetchPrefetched(moodSiteCommentsUrl(postId));
    if (!response.ok) return null;
    const page = await response.json() as Partial<CommentListResult>;
    return Array.isArray(page.comments) ? page as CommentListResult : null;
  } catch {
    return null;
  }
}

/** The owner's portal override (`policy.mode`, absent when there is none).
    The page draws every mood thread open, so two answers change it:
      off      -- the section goes before a row is drawn into it;
      readonly -- the capsule stays, closed and the same size, and says why
                  (CommentCompose.astro); no row offers Reply.
    Nothing under the capsule moves either way. */
function applyMode(section: HTMLElement, mode: CommentsMode | undefined): void {
  if (mode === 'off') {
    section.hidden = true;
    return;
  }
  if (mode !== 'readonly') return;
  repliesOpen = false;
  section.dataset.mode = 'readonly';
  // Opened already only by a `#comments` arrival; a closed post has nothing
  // to open it for.
  section.querySelector('[data-compose-shell]')?.removeAttribute('data-open');
  const seed = section.querySelector<HTMLButtonElement>('[data-compose-seed]');
  if (seed) seed.disabled = true;
}

export async function initMoodDetailComments(
  options: DetailCommentsOptions = {}
): Promise<void> {
  if (options.alwaysLoading) return;

  const commentsSection = document.querySelector('[data-post-id]') as HTMLElement | null;
  if (!commentsSection) return;

  const postId = commentsSection.dataset.postId;
  if (!postId) return;

  commentsListEl = document.querySelector('[data-comments-list]');
  const loadingEl = document.querySelector('[data-comments-loading]') as HTMLElement | null;
  emptyEl = document.querySelector('[data-comments-empty]');
  const loadMoreBtn = document.querySelector('[data-load-more]') as HTMLButtonElement | null;
  countEl = document.querySelector('[data-comments-count]');
  hydrateAnimatedEmoji = options.hydrateAnimatedEmoji;
  discussionRepliesEnabled = commentsSection.dataset.discussionRepliesEnabled === 'true';
  locale = commentsSection.dataset.locale || 'en';
  t = resolveMoodCommentsCopy(locale);
  shared = resolveCommentsCopy(locale);

  if (!commentsListEl) return;

  // Both first reads were started by the section's inline prefetch. Taken
  // together here, so they stay parallel even where that script did not run.
  const firstPage = fetchPrefetched(moodCommentsUrl(postId));
  const sitePage = commentsSection.dataset.siteThread === 'true' ? await readSiteThread(postId) : null;
  // The mode lands as soon as the site page does, without waiting on the
  // scrape: an `off` thread leaves before its rows ever would have arrived.
  applyMode(commentsSection, sitePage?.policy?.mode);
  if (commentsSection.hidden) return;
  // The owner's site-wide email rule reaches the page only through this
  // first page; the box then asks for an address, as the blog's does.
  if (sitePage?.policy?.requireVerifiedEmail) {
    const box = document.querySelector<HTMLElement>('[data-mood-compose]');
    if (box) markEmailRequired(box);
  }
  marks = readThreadMarks(sitePage?.comments ?? []);
  const pinnedRow = sitePage?.comments.find((comment) => comment.id === marks.pinnedId);
  const pinnedFallback = pinnedRow ? moodItemFromSiteComment(pinnedRow) : undefined;

  let nextBefore = '';

  const loadComments = async (before = ''): Promise<void> => {
    try {
      const response = await (before ? fetch(moodCommentsUrl(postId, before)) : firstPage);
      const data = await response.json() as {
        comments?: CommentData[];
        nextBefore?: string;
        hasMore?: boolean;
      };

      const page = data.comments ?? [];
      // The pin leads the first page: the scrape's copy of it, or the site's
      // when this page does not reach back that far. Later pages only bring
      // older rows, and dedupe drops the pin if one of them carries it.
      const comments = before ? page : pinFirst(page, marks.pinnedId, pinnedFallback);

      if (comments.length > 0) {
        if (emptyEl) emptyEl.hidden = true;

        const addedCount = addComments(comments, Boolean(before));

        if (loadingEl) loadingEl.remove();

        syncCommentsCount();

        const previousCursor = nextBefore;
        // From the scrape's own rows: a pin drawn from the site page is no
        // Telegram message, so it can never be a cursor.
        const fallbackCursor = getOldestCommentId(page);
        nextBefore = data.nextBefore || fallbackCursor || '';

        const canLoadMore = Boolean(data.hasMore && nextBefore && nextBefore !== previousCursor);
        if (loadMoreBtn) loadMoreBtn.hidden = !canLoadMore;

        if (before && addedCount === 0) {
          nextBefore = '';
          if (loadMoreBtn) loadMoreBtn.hidden = true;
        }

        options.hydrateAnimatedEmoji?.(commentsListEl!);
        hydrateMoodRichText(commentsListEl!);
      } else if (!before) {
        commentsListEl!.replaceChildren();
        if (emptyEl) {
          const emptyText = emptyEl.querySelector('p');
          if (emptyText) emptyText.textContent = t.empty;
          delete emptyEl.dataset.commentsState;
          emptyEl.hidden = false;
        }
        if (loadMoreBtn) loadMoreBtn.hidden = true;
      } else {
        nextBefore = '';
        if (loadMoreBtn) loadMoreBtn.hidden = true;
      }
    } catch (error) {
      console.error('Failed to load comments:', error);
      if (loadingEl) loadingEl.remove();
      if (!before && emptyEl) {
        commentsListEl!.replaceChildren();
        const emptyText = emptyEl.querySelector('p');
        if (emptyText) {
          emptyText.textContent = t.loadError;
        }
        // An empty thread stays silent, but a failed load has to say so --
        // see `.mood-comments-empty[data-comments-state='error']`.
        emptyEl.dataset.commentsState = 'error';
        emptyEl.hidden = false;
      }
    }
  };

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
      if (!nextBefore) {
        loadMoreBtn.hidden = true;
        return;
      }
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = t.loading;
      await loadComments(nextBefore);
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = t.loadMore;
    });
  }

  await loadComments();
  startLiveRefresh(postId, commentsSection);
}
