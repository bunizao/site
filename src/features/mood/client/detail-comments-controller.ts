import {
  asText,
  buildCommentContentFragment,
  formatRelativeCommentDate,
  sanitizeImageUrl,
} from '@/features/mood/shared/comments';
import { hydrateMoodRichText } from '@/features/mood/client/rich-text';

interface CommentReactionData {
  emoji?: string;
  emojiId?: string;
  emojiImage?: string;
  count?: string;
  isPaid?: boolean;
}

interface CommentData {
  id?: string;
  author?: string;
  authorAvatar?: string;
  datetime?: string;
  content?: string;
  reactions?: CommentReactionData[];
}

interface DetailCommentsOptions {
  alwaysLoading?: boolean;
  hydrateAnimatedEmoji?: (root?: ParentNode) => void;
}

export async function initMoodDetailComments(
  options: DetailCommentsOptions = {}
): Promise<void> {
  if (options.alwaysLoading) return;

  const commentsSection = document.querySelector('[data-post-id]') as HTMLElement | null;
  if (!commentsSection) return;

  const postId = commentsSection.dataset.postId;
  if (!postId) return;

  const commentsList = document.querySelector('[data-comments-list]') as HTMLElement | null;
  const loadingEl = document.querySelector('[data-comments-loading]') as HTMLElement | null;
  const emptyEl = document.querySelector('[data-comments-empty]') as HTMLElement | null;
  const loadMoreBtn = document.querySelector('[data-load-more]') as HTMLButtonElement | null;
  const countEl = document.querySelector('[data-comments-count]') as HTMLElement | null;

  if (!commentsList) return;

  let nextBefore = '';
  const loadedCommentIds = new Set<string>();

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

  const getInitials = (name: string): string =>
    name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || '?';

  const renderComment = (comment: CommentData): HTMLElement => {
    const root = document.createElement('div');
    root.className = 'mood-comment';
    const commentId = asText(comment?.id).trim();
    if (commentId) {
      root.dataset.commentId = commentId;
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

    header.appendChild(authorEl);
    header.appendChild(dateEl);
    body.appendChild(header);

    const contentEl = document.createElement('div');
    contentEl.className = 'mood-comment-content';
    contentEl.appendChild(buildCommentContentFragment(comment?.content));
    body.appendChild(contentEl);

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

      body.appendChild(reactionsWrap);
    }

    root.appendChild(body);
    return root;
  };

  const addComments = (comments: CommentData[], append: boolean): number => {
    if (!append) {
      loadedCommentIds.clear();
    }

    const uniqueComments = comments.filter((comment) => {
      if (!comment?.id) return false;
      if (loadedCommentIds.has(comment.id)) return false;
      loadedCommentIds.add(comment.id);
      return true;
    });

    const fragment = document.createDocumentFragment();
    uniqueComments.forEach((comment) => {
      fragment.appendChild(renderComment(comment));
    });

    if (append) {
      commentsList.appendChild(fragment);
    } else {
      commentsList.replaceChildren(fragment);
    }

    return uniqueComments.length;
  };

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

        if (countEl) countEl.textContent = String(loadedCommentIds.size);

        const previousCursor = nextBefore;
        const fallbackCursor = getOldestCommentId(comments);
        nextBefore = data.nextBefore || fallbackCursor || '';

        const canLoadMore = Boolean(data.hasMore && nextBefore && nextBefore !== previousCursor);
        if (loadMoreBtn) loadMoreBtn.hidden = !canLoadMore;

        if (before && addedCount === 0) {
          nextBefore = '';
          if (loadMoreBtn) loadMoreBtn.hidden = true;
        }

        options.hydrateAnimatedEmoji?.(commentsList);
        hydrateMoodRichText(commentsList);
      } else if (!before) {
        commentsList.replaceChildren();
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
        commentsList.replaceChildren();
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
}
