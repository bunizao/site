import {
  asText,
  buildCommentContentFragment,
  createCommentReplyQuote,
  createCommentSourceChip,
  dedupeNewComments,
  formatRelativeCommentDate,
  readCommentReplyTarget,
  sanitizeImageUrl,
  type CommentReplyTarget,
} from '@/features/mood/shared/comments';
import { readOwnCommentIds, rememberOwnCommentId } from '@/features/mood/shared/own-comments';
import { hydrateMoodRichText } from '@/features/mood/client/rich-text';
import { moodCommentsCopy } from '@/features/comments/copy';
import { initials } from '@/features/comments/identity';

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

  const avatar = document.createElement('div');
  avatar.className = 'mood-comment-avatar';
  const author = asText(comment?.author).trim() || 'Anonymous';
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
  dateEl.textContent = formatRelativeCommentDate(datetimeRaw);

  const sourceLabel =
    origin === 'web' ? moodCommentsCopy.sourceWeb : moodCommentsCopy.sourceTelegram;

  header.appendChild(authorEl);
  header.appendChild(dateEl);
  header.appendChild(
    createCommentSourceChip(origin, sourceLabel, moodCommentsCopy.sourceAria(sourceLabel)),
  );
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
  const canReply = origin === 'web' ? Boolean(siteCommentId) : discussionRepliesEnabled;
  if (canReply && commentId) {
    const replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.className = 'mood-comment-reply-btn';
    replyBtn.textContent = moodCommentsCopy.reply;
    replyBtn.dataset.commentReplyParentId = origin === 'web' ? siteCommentId : commentId;
    replyBtn.dataset.commentReplyAuthor = author;
    replyBtn.dataset.commentReplyText = plainTextPreview(contentHtml);
    footer.appendChild(replyBtn);
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
    const response = await fetch(`/api/comments?${new URLSearchParams({ postId })}`);
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

function startLiveRefresh(postId: string): void {
  const tick = (): void => {
    void refreshLiveComments(postId);
  };
  window.setInterval(tick, REFRESH_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  window.addEventListener('focus', tick);
}

/** Drops a just-posted own comment straight into the rendered thread --
    detail-compose.ts calls this on a `published` outcome, rather than
    duplicating renderComment's layout. Inserted at the top: this is always
    the newest comment on the page, and load-more only ever brings in older
    ones at the bottom. No-ops if the thread never finished mounting (a
    `#comments-readonly` post has no compose box to call this from anyway). */
export function insertOwnComment(comment: CommentData): void {
  if (!commentsListEl) return;
  const id = asText(comment?.id).trim();
  const siteCommentId = asText(comment?.commentId).trim();
  if (id && loadedCommentIds.has(id)) return;
  if (siteCommentId && loadedSiteCommentIds.has(siteCommentId)) return;

  if (siteCommentId) {
    ownCommentIds.add(siteCommentId);
    rememberOwnCommentId(siteCommentId);
  }
  if (id) loadedCommentIds.add(id);
  if (siteCommentId) loadedSiteCommentIds.add(siteCommentId);

  if (emptyEl) emptyEl.hidden = true;
  const node = renderComment(comment);
  commentsListEl.prepend(node);
  linkReplyQuotes();
  hydrateAnimatedEmoji?.(commentsListEl);
  hydrateMoodRichText(commentsListEl);
  syncCommentsCount();
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

  if (!commentsListEl) return;

  let nextBefore = '';

  const loadComments = async (before = ''): Promise<void> => {
    try {
      const query = new URLSearchParams({ postId });
      if (before) query.set('before', before);
      const response = await fetch(`/api/comments?${query}`);
      const data = await response.json() as {
        comments?: CommentData[];
        nextBefore?: string;
        hasMore?: boolean;
      };

      const comments = data.comments ?? [];

      if (comments.length > 0) {
        if (emptyEl) emptyEl.hidden = true;

        const addedCount = addComments(comments, Boolean(before));

        if (loadingEl) loadingEl.remove();

        syncCommentsCount();

        const previousCursor = nextBefore;
        const fallbackCursor = getOldestCommentId(comments);
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
        if (emptyEl) emptyEl.hidden = false;
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
          emptyText.textContent = 'Failed to load comments';
        }
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
      loadMoreBtn.textContent = 'Loading...';
      await loadComments(nextBefore);
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = 'Load more comments';
    });
  }

  await loadComments();
  startLiveRefresh(postId);
}
