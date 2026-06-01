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

const OPEN_CLASS = 'is-popover-open';
const ITEM_OPEN_CLASS = 'mood-item--comments-open';
const CLOSE_DELAY_MS = 180;
const POPOVER_MARGIN = 12;
const POPOVER_GAP = 10;
const MIN_POPOVER_HEIGHT = 160;
const MAX_POPOVER_HEIGHT = 420;
const MAX_PREVIEW_COMMENTS = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getCommentsPopoverId(postId: string): string {
  return `mood-comments-popover-${postId.replace(/[^\w-]/g, '-')}`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
}

function createLoadingPopover({ postId, label, count }: CommentsIndicatorOptions): HTMLElement {
  const popover = document.createElement('div');
  popover.className = 'mood-comments-popover';
  popover.id = getCommentsPopoverId(postId);
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', `${label} comment${count === 1 ? '' : 's'} preview`);
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
  const popoversByWrapper = new WeakMap<HTMLElement, HTMLElement>();
  const wrappersByPopover = new WeakMap<HTMLElement, HTMLElement>();
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

  const getPopover = (wrapper: HTMLElement): HTMLElement | null => (
    popoversByWrapper.get(wrapper)
    ?? wrapper.querySelector<HTMLElement>('.mood-comments-popover')
  );

  const getTrigger = (wrapper: HTMLElement): HTMLElement => (
    wrapper.querySelector<HTMLElement>('.mood-item-comments') ?? wrapper
  );

  const readTotalCount = (wrapper: HTMLElement, fallback: number): number => {
    const rawCount = Number(wrapper.dataset.commentsCount);
    return Number.isFinite(rawCount) && rawCount > 0 ? rawCount : fallback;
  };

  const readTotalLabel = (wrapper: HTMLElement, fallback: number): string => (
    wrapper.dataset.commentsLabel?.trim() || String(fallback)
  );

  const renderPopover = (
    popover: HTMLElement,
    comments: CommentPreviewData[],
    postId: string,
    options: { totalCount: number; totalLabel: string }
  ): void => {
    const displayComments = comments.slice(0, MAX_PREVIEW_COMMENTS);
    const hasMore = options.totalCount > displayComments.length || comments.length > MAX_PREVIEW_COMMENTS;

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
      viewAll.textContent = `View all ${options.totalLabel} comment${options.totalCount === 1 ? '' : 's'}`;
      fragment.appendChild(viewAll);
    }

    popover.replaceChildren(fragment);
    void animatedEmoji.hydrate(popover);
  };

  const updateExpandedState = (wrapper: HTMLElement, isOpen: boolean): void => {
    const trigger = wrapper.querySelector<HTMLElement>('.mood-item-comments');
    trigger?.setAttribute('aria-expanded', String(isOpen));
  };

  const mountPopoverOverlay = (wrapper: HTMLElement, popover: HTMLElement): void => {
    popoversByWrapper.set(wrapper, popover);
    wrappersByPopover.set(popover, wrapper);
    if (popover.parentElement !== document.body) {
      document.body.appendChild(popover);
    }
  };

  const restorePopover = (wrapper: HTMLElement): void => {
    const popover = popoversByWrapper.get(wrapper);
    if (!popover) return;
    popover.classList.remove(OPEN_CLASS);
    if (wrapper.isConnected && popover.parentElement === document.body) {
      wrapper.appendChild(popover);
    }
  };

  const positionPopover = (wrapper: HTMLElement): void => {
    if (!wrapper.classList.contains(OPEN_CLASS)) return;

    const popover = getPopover(wrapper);
    if (!popover) return;

    const trigger = getTrigger(wrapper);
    const triggerRect = trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = window.innerHeight;
    const availableAbove = triggerRect.top - POPOVER_MARGIN - POPOVER_GAP;
    const availableBelow = viewportHeight - triggerRect.bottom - POPOVER_MARGIN - POPOVER_GAP;
    const side = availableAbove >= availableBelow || availableAbove >= MIN_POPOVER_HEIGHT ? 'top' : 'bottom';
    const availableHeight = Math.max(side === 'top' ? availableAbove : availableBelow, MIN_POPOVER_HEIGHT);
    const maxHeight = clamp(availableHeight, MIN_POPOVER_HEIGHT, MAX_POPOVER_HEIGHT);
    const width = Math.min(360, Math.max(260, viewportWidth - (POPOVER_MARGIN * 2)));

    popover.dataset.positioned = 'true';
    popover.dataset.side = side;
    popover.style.setProperty('--mood-comments-popover-width', `${width}px`);
    popover.style.setProperty('--mood-comments-popover-max-height', `${maxHeight}px`);

    const popoverRect = popover.getBoundingClientRect();
    const popoverWidth = popoverRect.width || width;
    const popoverHeight = Math.min(popoverRect.height || maxHeight, maxHeight);
    const halfWidth = popoverWidth / 2;
    const triggerCenter = triggerRect.left + (triggerRect.width / 2);
    const left = clamp(
      triggerCenter,
      POPOVER_MARGIN + halfWidth,
      viewportWidth - POPOVER_MARGIN - halfWidth
    );
    const top = side === 'top'
      ? clamp(triggerRect.top - POPOVER_GAP - popoverHeight, POPOVER_MARGIN, viewportHeight - POPOVER_MARGIN - popoverHeight)
      : clamp(triggerRect.bottom + POPOVER_GAP, POPOVER_MARGIN, viewportHeight - POPOVER_MARGIN - popoverHeight);
    const popoverLeftEdge = left - halfWidth;
    const arrowLeft = clamp(triggerCenter - popoverLeftEdge, 18, popoverWidth - 18);

    popover.style.setProperty('--mood-comments-popover-left', `${left}px`);
    popover.style.setProperty('--mood-comments-popover-top', `${top}px`);
    popover.style.setProperty('--mood-comments-popover-arrow-left', `${arrowLeft}px`);
  };

  const closePopover = (wrapper: HTMLElement): void => {
    wrapper.classList.remove(OPEN_CLASS);
    wrapper.closest('.mood-item')?.classList.remove(ITEM_OPEN_CLASS);
    updateExpandedState(wrapper, false);
    restorePopover(wrapper);
  };

  const closeOtherPopovers = (currentWrapper: HTMLElement): void => {
    document.querySelectorAll<HTMLElement>(`.mood-comments-wrapper.${OPEN_CLASS}`).forEach((wrapper) => {
      if (wrapper !== currentWrapper) {
        closePopover(wrapper);
      }
    });
  };

  const openPopover = async (wrapper: HTMLElement): Promise<void> => {
    const postId = wrapper.dataset.postId;
    if (!postId) return;

    const popover = getPopover(wrapper);
    if (!popover) return;

    closeOtherPopovers(wrapper);
    mountPopoverOverlay(wrapper, popover);
    wrapper.classList.add(OPEN_CLASS);
    popover.classList.add(OPEN_CLASS);
    wrapper.closest('.mood-item')?.classList.add(ITEM_OPEN_CLASS);
    updateExpandedState(wrapper, true);
    positionPopover(wrapper);

    if (popover.dataset.loaded === 'true' || popover.dataset.loaded === 'pending') return;

    popover.dataset.loaded = 'pending';
    const comments = await fetchComments(postId);
    const totalCount = readTotalCount(wrapper, comments.length);
    const totalLabel = readTotalLabel(wrapper, totalCount);
    renderPopover(popover, comments, postId, { totalCount, totalLabel });
    popover.dataset.loaded = 'true';
    positionPopover(wrapper);
  };

  const closeTimers = new WeakMap<HTMLElement, number>();

  const cancelClose = (wrapper: HTMLElement): void => {
    const timer = closeTimers.get(wrapper);
    if (timer) {
      window.clearTimeout(timer);
      closeTimers.delete(wrapper);
    }
  };

  const scheduleClose = (wrapper: HTMLElement): void => {
    cancelClose(wrapper);
    const timer = window.setTimeout(() => {
      closePopover(wrapper);
      closeTimers.delete(wrapper);
    }, CLOSE_DELAY_MS);
    closeTimers.set(wrapper, timer);
  };

  const getEventWrapper = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null;
    const wrapper = target.closest('.mood-comments-wrapper') as HTMLElement | null;
    if (wrapper) return wrapper;
    const popover = target.closest('.mood-comments-popover') as HTMLElement | null;
    return popover ? wrappersByPopover.get(popover) ?? null : null;
  };

  const getPopoverOwnerFromTarget = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null;
    const popover = target.closest('.mood-comments-popover') as HTMLElement | null;
    return popover ? wrappersByPopover.get(popover) ?? null : null;
  };

  const isStillInsideWrapper = (wrapper: HTMLElement, nextTarget: EventTarget | null): boolean => (
    nextTarget instanceof Node
    && (
      wrapper.contains(nextTarget)
      || getPopoverOwnerFromTarget(nextTarget) === wrapper
    )
  );

  const positionOpenPopovers = (): void => {
    document.querySelectorAll<HTMLElement>(`.mood-comments-wrapper.${OPEN_CLASS}`).forEach(positionPopover);
  };

  const init = (): void => {
    if (initialized) return;
    initialized = true;

    document.addEventListener(
      'pointerover',
      (event) => {
        const wrapper = getEventWrapper(event.target);
        if (wrapper) {
          cancelClose(wrapper);
          void openPopover(wrapper);
        }
      }
    );

    document.addEventListener(
      'pointerout',
      (event) => {
        const wrapper = getEventWrapper(event.target);
        if (!wrapper || isStillInsideWrapper(wrapper, event.relatedTarget)) return;
        scheduleClose(wrapper);
      }
    );

    document.addEventListener('focusin', (event) => {
      const wrapper = getEventWrapper(event.target);
      if (wrapper) {
        cancelClose(wrapper);
        void openPopover(wrapper);
      }
    });

    document.addEventListener('focusout', (event) => {
      const wrapper = getEventWrapper(event.target);
      if (!wrapper || isStillInsideWrapper(wrapper, event.relatedTarget)) return;
      scheduleClose(wrapper);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      document.querySelectorAll<HTMLElement>(`.mood-comments-wrapper.${OPEN_CLASS}`).forEach(closePopover);
    });

    window.addEventListener('resize', positionOpenPopovers);
    window.addEventListener('scroll', positionOpenPopovers, { passive: true });
  };

  const createIndicator = ({ postId, count, label }: CommentsIndicatorOptions): HTMLElement => {
    const wrapper = document.createElement('div');
    wrapper.className = 'mood-comments-wrapper';
    wrapper.dataset.postId = postId;
    wrapper.dataset.commentsCount = String(count);
    wrapper.dataset.commentsLabel = label;

    const commentsLink = document.createElement('a');
    commentsLink.className = 'mood-item-comments';
    commentsLink.href = `/mood/${postId}#comments`;
    commentsLink.setAttribute('aria-haspopup', 'dialog');
    commentsLink.setAttribute('aria-expanded', 'false');
    commentsLink.setAttribute('aria-controls', getCommentsPopoverId(postId));

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
    wrapper.appendChild(createLoadingPopover({ postId, count, label: countLabel }));

    return wrapper;
  };

  return { init, createIndicator };
}
