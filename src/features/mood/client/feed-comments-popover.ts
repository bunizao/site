import {
  asText,
  buildCommentContentFragment,
  formatRelativeCommentDate,
  sanitizeImageUrl,
} from '@/features/mood/shared/comments';

interface AnimatedEmojiHydrator {
  hydrate(root?: ParentNode): Promise<void>;
}

interface CommentPreviewData {
  author?: string;
  authorAvatar?: string;
  datetime?: string;
  content?: string;
}

interface CommentsIndicatorOptions {
  postId: string;
  count: number;
  label: string;
}

interface FeedCommentsPopoverController {
  init(): void;
  createIndicator(options: CommentsIndicatorOptions): HTMLElement;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
}

function createLoadingPopover(): HTMLElement {
  const popover = document.createElement('div');
  popover.className = 'mood-comments-popover';
  popover.innerHTML = `
    <div class="mood-comments-popover-loading">
      <div class="mood-popover-skeleton">
        <div class="mood-popover-skeleton-avatar"></div>
        <div class="mood-popover-skeleton-body">
          <div class="mood-popover-skeleton-line mood-popover-skeleton-line--short"></div>
          <div class="mood-popover-skeleton-line mood-popover-skeleton-line--long"></div>
        </div>
      </div>
      <div class="mood-popover-skeleton">
        <div class="mood-popover-skeleton-avatar"></div>
        <div class="mood-popover-skeleton-body">
          <div class="mood-popover-skeleton-line mood-popover-skeleton-line--short"></div>
          <div class="mood-popover-skeleton-line mood-popover-skeleton-line--long"></div>
        </div>
      </div>
    </div>
  `;
  return popover;
}

function renderComment(comment: CommentPreviewData): HTMLElement {
  const root = document.createElement('div');
  root.className = 'mood-popover-comment';

  const avatar = document.createElement('div');
  avatar.className = 'mood-popover-comment-avatar';

  const author = asText(comment.author).trim() || 'Anonymous';
  const avatarUrl = sanitizeImageUrl(comment.authorAvatar);
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
  body.className = 'mood-popover-comment-body';

  const header = document.createElement('div');
  header.className = 'mood-popover-comment-header';

  const authorEl = document.createElement('span');
  authorEl.className = 'mood-popover-comment-author';
  authorEl.textContent = author;

  const datetimeRaw = asText(comment.datetime).trim();
  const dateEl = document.createElement('time');
  dateEl.className = 'mood-popover-comment-date';
  if (datetimeRaw) {
    dateEl.dateTime = datetimeRaw;
  }
  dateEl.textContent = formatRelativeCommentDate(datetimeRaw, { compact: true });

  header.appendChild(authorEl);
  header.appendChild(dateEl);
  body.appendChild(header);

  const content = document.createElement('div');
  content.className = 'mood-popover-comment-content';
  content.appendChild(buildCommentContentFragment(comment.content));
  body.appendChild(content);

  root.appendChild(body);
  return root;
}

export function createFeedCommentsPopoverController(
  animatedEmoji: AnimatedEmojiHydrator
): FeedCommentsPopoverController {
  const cache = new Map<string, CommentPreviewData[]>();
  const pendingFetches = new Map<string, Promise<CommentPreviewData[]>>();
  let initialized = false;

  const fetchComments = async (postId: string): Promise<CommentPreviewData[]> => {
    if (cache.has(postId)) {
      return cache.get(postId) ?? [];
    }

    if (pendingFetches.has(postId)) {
      return pendingFetches.get(postId) ?? Promise.resolve([]);
    }

    const promise = (async () => {
      try {
        const response = await fetch(`/api/comments?postId=${encodeURIComponent(postId)}`);
        const data = await response.json() as { comments?: CommentPreviewData[] };
        const comments = Array.isArray(data.comments) ? data.comments : [];
        cache.set(postId, comments);
        return comments;
      } catch (error) {
        console.error('Failed to fetch comments:', error);
        return [];
      } finally {
        pendingFetches.delete(postId);
      }
    })();

    pendingFetches.set(postId, promise);
    return promise;
  };

  const renderPopover = (popover: HTMLElement, comments: CommentPreviewData[], postId: string): void => {
    const maxComments = 3;
    const displayComments = comments.slice(0, maxComments);
    const hasMore = comments.length > maxComments;

    if (displayComments.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'mood-comments-popover-empty';
      empty.textContent = 'No comments yet';
      popover.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    const list = document.createElement('div');
    list.className = 'mood-comments-popover-list';
    displayComments.forEach((comment) => {
      list.appendChild(renderComment(comment));
    });
    fragment.appendChild(list);

    if (hasMore) {
      const viewAll = document.createElement('a');
      viewAll.className = 'mood-popover-view-all';
      viewAll.href = `/mood/${postId}#comments`;
      viewAll.textContent = `View all ${comments.length} comments`;
      fragment.appendChild(viewAll);
    }

    popover.replaceChildren(fragment);
    void animatedEmoji.hydrate(popover);
  };

  const handleHover = async (wrapper: HTMLElement): Promise<void> => {
    const postId = wrapper.dataset.postId;
    if (!postId) return;

    const popover = wrapper.querySelector<HTMLElement>('.mood-comments-popover');
    if (!popover) return;

    if (popover.dataset.loaded === 'true' || popover.dataset.loaded === 'pending') return;

    popover.dataset.loaded = 'pending';
    const comments = await fetchComments(postId);
    renderPopover(popover, comments, postId);
    popover.dataset.loaded = 'true';
  };

  const init = (): void => {
    if (initialized) return;
    initialized = true;

    document.addEventListener(
      'mouseenter',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const wrapper = target.closest('.mood-comments-wrapper') as HTMLElement | null;
        if (wrapper) {
          void handleHover(wrapper);
        }
      },
      true
    );
  };

  const createIndicator = ({ postId, count, label }: CommentsIndicatorOptions): HTMLElement => {
    const wrapper = document.createElement('div');
    wrapper.className = 'mood-comments-wrapper';
    wrapper.dataset.postId = postId;

    const commentsLink = document.createElement('a');
    commentsLink.className = 'mood-item-comments';
    commentsLink.href = `/mood/${postId}#comments`;

    const countLabel = label || String(count);
    commentsLink.title = `${countLabel} comment${count === 1 ? '' : 's'}`;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'mood-comments-icon';
    iconSpan.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';

    const countSpan = document.createElement('span');
    countSpan.className = 'mood-comments-count';
    countSpan.textContent = countLabel;

    commentsLink.appendChild(iconSpan);
    commentsLink.appendChild(countSpan);
    wrapper.appendChild(commentsLink);
    wrapper.appendChild(createLoadingPopover());

    return wrapper;
  };

  return { init, createIndicator };
}
