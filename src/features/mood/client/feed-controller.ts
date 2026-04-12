import gsap from 'gsap';
import { asText, buildCommentContentFragment, sanitizeImageUrl } from '@/lib/comment-content';
import { createAnimatedEmojiManager } from '@/features/mood/client/animated-emoji';
import { createMoodGalleryElement, initMoodGalleries } from '@/features/mood/client/gallery';
import { buildMoodPreviewFragment } from '@/features/mood/shared/preview';
import type { MoodGallery } from '@/features/mood/shared/gallery';
import { applyResponsiveImage } from '@/lib/media/responsive-image';

export function initMoodFeedController(): void {
    const loadingEl = document.querySelector('[data-mood-loading]');
    const errorEl = document.querySelector('[data-mood-error]');
    const feedEl = document.querySelector('[data-mood-feed]');
    const list = document.querySelector('[data-mood-list]');
    const status = document.querySelector('[data-load-status]');
    const sentinel = document.querySelector('[data-mood-sentinel]');
    const updateNoticeEl = document.querySelector('[data-mood-update-notice]') as HTMLElement | null;
    const updateNoticeTextEl = document.querySelector('[data-mood-update-text]') as HTMLElement | null;
    const updateRefreshBtn = document.querySelector('[data-mood-update-refresh]') as HTMLButtonElement | null;
    const ALWAYS_LOADING = import.meta.env.PUBLIC_DEBUG_ALWAYS_LOADING === 'true';

    if (loadingEl && errorEl && feedEl && list && status && sentinel) {
      const loadButton = document.querySelector('[data-load-more]') as HTMLButtonElement | null;
      if (ALWAYS_LOADING) {
        loadingEl.classList.remove('is-hidden');
        errorEl.classList.add('is-hidden');
        feedEl.classList.add('is-hidden');
        list.setAttribute('aria-busy', 'true');
      } else {
        let isLoading = false;
        let hasMore = true;
        let observer: IntersectionObserver;
        let latestSeenId = '';
        let pendingUpdateId = '';
        let dismissedUpdateId = '';
        let isCheckingUpdates = false;
        let updatePollTimer = 0;
        let autoRefreshTimer = 0;
        let autoRefreshPending = false;
        let updateWatcherStarted = false;

        const UPDATE_POLL_INTERVAL_MS = 75_000;
        const AUTO_REFRESH_DELAY_MS = 6_000;
        const AUTO_REFRESH_MAX_SCROLL_Y = 120;
        const AUTO_REFRESH_CANCEL_SCROLL_Y = 220;
        const REFRESH_LABEL_IDLE = 'Refresh';
        const REFRESH_LABEL_PENDING = 'Refreshing...';

        // GSAP animation references for update notice
        let noticeShowTl: gsap.core.Timeline | null = null;
        let noticeCountdownTween: gsap.core.Tween | null = null;
        let noticeSpinnerTween: gsap.core.Tween | null = null;
        let noticeRefreshTl: gsap.core.Timeline | null = null;
        let noticeReloadCall: gsap.core.Tween | null = null;

        // Set initial hidden state with GSAP
        if (updateNoticeEl) {
          gsap.set(updateNoticeEl, { autoAlpha: 0, x: -10, display: 'none' });
        }

        const inlineSkeletonConfig = {
          dateWidth: '68px',
          items: [
            { lineWidth: '70%' },
            { lineWidth: '58%' },
          ],
        };

      const formatTime = (value: string): string => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
      };

      const formatDateKey = (value: string): string => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const formatDateHeader = (dateKey: string): string => {
        const [year, month, day] = dateKey.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        const now = new Date();

        const isToday =
          date.getFullYear() === now.getFullYear() &&
          date.getMonth() === now.getMonth() &&
          date.getDate() === now.getDate();

        if (isToday) return 'Today';

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday =
          date.getFullYear() === yesterday.getFullYear() &&
          date.getMonth() === yesterday.getMonth() &&
          date.getDate() === yesterday.getDate();

        if (isYesterday) return 'Yesterday';

        const months = ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'];

        if (date.getFullYear() === now.getFullYear()) {
          return `${months[date.getMonth()]} ${date.getDate()}`;
        }
        return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
      };

      const groupCache = new Map<string, { group: HTMLElement; items: HTMLElement }>();
      const moodIdSet = new Set<string>();
      const renderedIdSet = new Set<string>();
      let totalCount = 0;
      let oldestNumericId = Number.POSITIVE_INFINITY;
      let oldestId = '';
      let fallbackOldestId = '';
      let pendingDateKey: string | null = null;
      let pendingPosts: MoodData[] = [];

      const registerMoodId = (id?: string | null): void => {
        if (!id || moodIdSet.has(id)) return;
        moodIdSet.add(id);
        fallbackOldestId = id;
        const numericId = Number.parseInt(id, 10);
        if (!Number.isNaN(numericId) && numericId < oldestNumericId) {
          oldestNumericId = numericId;
          oldestId = id;
        }
      };

      const getGroupEntry = (dateKey: string): { group: HTMLElement; items: HTMLElement } | null => {
        const cached = groupCache.get(dateKey);
        if (cached) return cached;
        const existingGroup = list.querySelector(`[data-date="${dateKey}"]`) as HTMLElement | null;
        if (!existingGroup) return null;
        const items = existingGroup.querySelector('.mood-date-items') as HTMLElement | null;
        if (!items) return null;
        const entry = { group: existingGroup, items };
        groupCache.set(dateKey, entry);
        return entry;
      };

      const getBeforeId = (): string => {
        return oldestId || fallbackOldestId;
      };

      const stagePostsForRender = (posts: MoodData[]): MoodData[] => {
        const ready: MoodData[] = [];
        posts.forEach((post) => {
          if (!post?.id || moodIdSet.has(post.id)) return;
          registerMoodId(post.id);
          const dateKey = formatDateKey(post.datetime);
          if (!pendingDateKey) {
            pendingDateKey = dateKey;
            pendingPosts.push(post);
            return;
          }
          if (dateKey === pendingDateKey) {
            pendingPosts.push(post);
            return;
          }
          if (pendingPosts.length) {
            ready.push(...pendingPosts);
          }
          pendingPosts = [post];
          pendingDateKey = dateKey;
        });
        return ready;
      };

      const flushPendingPosts = (): MoodData[] => {
        if (!pendingPosts.length) return [];
        const flushed = pendingPosts;
        pendingPosts = [];
        pendingDateKey = null;
        return flushed;
      };

      const toNumericMoodId = (value: string): number => {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : Number.NaN;
      };

      const isNewerMoodId = (nextId: string, currentId: string): boolean => {
        if (!nextId) return false;
        if (!currentId) return true;
        const nextNumeric = toNumericMoodId(nextId);
        const currentNumeric = toNumericMoodId(currentId);
        if (!Number.isNaN(nextNumeric) && !Number.isNaN(currentNumeric)) {
          return nextNumeric > currentNumeric;
        }
        return nextId > currentId;
      };

      const getNewestRenderedMoodId = (): string => {
        const firstItem = list.querySelector('.mood-item[data-mood-id]') as HTMLElement | null;
        return firstItem?.dataset.moodId ?? '';
      };

      const cancelAutoRefresh = (): void => {
        autoRefreshPending = false;
        if (autoRefreshTimer) {
          window.clearTimeout(autoRefreshTimer);
          autoRefreshTimer = 0;
        }
        if (noticeCountdownTween) {
          noticeCountdownTween.kill();
          noticeCountdownTween = null;
        }
      };

      const clearRefreshMotion = (): void => {
        noticeRefreshTl?.kill();
        noticeRefreshTl = null;
        noticeReloadCall?.kill();
        noticeReloadCall = null;
      };

      const resetUpdateNoticeLayout = (): void => {
        clearRefreshMotion();
        if (!updateNoticeEl) return;

        const progressEl = updateNoticeEl.querySelector('.mood-update-progress') as HTMLElement | null;
        const refreshBtn = updateRefreshBtn as HTMLElement | null;
        const refreshLabel = refreshBtn?.querySelector('.mood-update-action-label') as HTMLElement | null;
        const refreshIcon = refreshBtn?.querySelector('.mood-update-action-icon') as HTMLElement | null;

        updateNoticeEl.classList.remove('is-refreshing');
        gsap.set(updateNoticeEl, { clearProps: 'width,gap,paddingLeft,paddingRight,x,overflow' });

        if (updateNoticeTextEl) {
          updateNoticeTextEl.style.display = '';
          gsap.set(updateNoticeTextEl, { clearProps: 'opacity,visibility,x,maxWidth,overflow,paddingRight,position,left,top,yPercent' });
        }

        if (progressEl) {
          progressEl.style.display = '';
          gsap.set(progressEl, { clearProps: 'opacity,visibility' });
        }

        if (refreshBtn) {
          refreshBtn.classList.remove('is-refreshing', 'is-hovered');
          refreshBtn.removeAttribute('aria-disabled');
          refreshBtn.setAttribute('aria-label', REFRESH_LABEL_IDLE);
          gsap.set(refreshBtn, { clearProps: 'width,paddingLeft,paddingRight,gap,pointerEvents,x' });
        }

        if (refreshLabel) {
          refreshLabel.textContent = REFRESH_LABEL_IDLE;
          gsap.set(refreshLabel, { clearProps: 'maxWidth,opacity' });
        }

        if (refreshIcon) {
          gsap.set(refreshIcon, { clearProps: 'rotation' });
        }
      };

      const triggerPageRefresh = (): void => {
        cancelAutoRefresh();
        clearRefreshMotion();
        if (!updateNoticeEl) {
          setTimeout(() => window.location.reload(), 100);
          return;
        }

        const progressEl = updateNoticeEl.querySelector('.mood-update-progress') as HTMLElement;
        const refreshBtn = updateRefreshBtn as HTMLElement | null;
        const refreshLabel = refreshBtn?.querySelector('.mood-update-action-label') as HTMLElement | null;
        const refreshIcon = refreshBtn?.querySelector('.mood-update-action-icon') as HTMLElement | null;

        if (refreshBtn?.classList.contains('is-refreshing')) {
          return;
        }

        // Kill idle animations
        noticeShowTl?.kill();
        noticeShowTl = null;
        noticeSpinnerTween?.kill();
        noticeSpinnerTween = null;
        gsap.killTweensOf(updateNoticeEl);
        if (progressEl) gsap.killTweensOf(progressEl);
        if (refreshBtn) gsap.killTweensOf(refreshBtn);
        if (refreshLabel) gsap.killTweensOf(refreshLabel);
        if (updateNoticeTextEl) gsap.killTweensOf(updateNoticeTextEl);

        if (refreshBtn) {
          refreshBtn.classList.remove('is-hovered');
          refreshBtn.classList.add('is-refreshing');
          refreshBtn.setAttribute('aria-disabled', 'true');
          refreshBtn.setAttribute('aria-label', REFRESH_LABEL_PENDING);
          gsap.set(refreshBtn, { pointerEvents: 'none' });
        }

        // Keep layout stable during refresh to avoid forced button movement.
        // Only animate compositor-friendly properties for smoother behavior.
        if (refreshLabel) {
          refreshLabel.textContent = REFRESH_LABEL_PENDING;
        }
        if (progressEl) {
          gsap.set(progressEl, { opacity: 0 });
        }

        const refreshTl = gsap.timeline({
          defaults: { overwrite: 'auto' },
          onComplete: () => {
            noticeRefreshTl = null;
          }
        });
        noticeRefreshTl = refreshTl;

        // Dim notice text slightly while refresh is pending without reflowing layout.
        if (updateNoticeTextEl) {
          refreshTl.to(updateNoticeTextEl, {
            opacity: 0.55, duration: 0.18, ease: 'power2.out',
          }, 0);
        }

        // Spin icon for active feedback.
        if (refreshIcon) {
          refreshTl.add(() => {
            void (noticeSpinnerTween = gsap.to(refreshIcon, {
              rotation: '+=360', duration: 0.8, ease: 'none', repeat: -1, overwrite: 'auto',
            }));
          }, 0);
        }

        // Phase 3: Reload after a brief pause so the user sees "Refreshing..."
        noticeReloadCall = gsap.delayedCall(0.72, () => {
          window.location.reload();
        });
      };

      const hideUpdateNotice = (): void => {
        cancelAutoRefresh();
        clearRefreshMotion();
        if (!updateNoticeEl) return;

        noticeShowTl?.kill();
        noticeShowTl = null;
        noticeSpinnerTween?.kill();
        noticeSpinnerTween = null;

        gsap.to(updateNoticeEl, {
          autoAlpha: 0, x: -10, scale: 0.98,
          duration: 0.24, ease: 'power2.in',
          onComplete: () => {
            const actionsEl = updateNoticeEl!.querySelector('[data-mood-update-actions]') as HTMLElement;
            if (actionsEl) {
              gsap.set(actionsEl, { clearProps: 'opacity,visibility,x' });
            }
            resetUpdateNoticeLayout();
            gsap.set(updateNoticeEl, { display: 'none' });
          }
        });
      };

      const showUpdateNotice = (autoRefresh: boolean): void => {
        if (!updateNoticeEl || !updateNoticeTextEl) {
          if (autoRefresh) { triggerPageRefresh(); }
          return;
        }

        cancelAutoRefresh();
        autoRefreshPending = autoRefresh;

        // Kill existing animations
        noticeShowTl?.kill();
        noticeShowTl = null;
        noticeSpinnerTween?.kill();
        noticeSpinnerTween = null;

        // Reset states
        const progressEl = updateNoticeEl.querySelector('.mood-update-progress') as HTMLElement;
        const actionsEl = updateNoticeEl.querySelector('[data-mood-update-actions]') as HTMLElement;
        resetUpdateNoticeLayout();

        if (actionsEl) {
          gsap.set(actionsEl, { clearProps: 'opacity,visibility,x' });
        }

        // Set text
        updateNoticeTextEl.textContent = 'New moods are in!';
        gsap.set(updateNoticeEl, { display: 'inline-flex' });

        // Entrance animation
        noticeShowTl = gsap.timeline();
        noticeShowTl.fromTo(updateNoticeEl,
          { autoAlpha: 0, x: -10, scale: 0.98 },
          { autoAlpha: 1, x: 0, scale: 1, duration: 0.42, ease: 'power3.out' }
        );

        // Countdown
        if (autoRefresh && progressEl) {
          const countdownDelayMs = AUTO_REFRESH_DELAY_MS;
          gsap.set(progressEl, { opacity: 1, '--progress': 1 });
          noticeCountdownTween = gsap.to(progressEl, {
            '--progress': 0,
            duration: countdownDelayMs / 1000,
            ease: 'none'
          });
          autoRefreshTimer = window.setTimeout(() => {
            triggerPageRefresh();
          }, countdownDelayMs);
        } else if (progressEl) {
          gsap.set(progressEl, { opacity: 0 });
        }
      };

      const syncLatestSeenId = (): void => {
        const newestId = getNewestRenderedMoodId();
        if (!newestId) return;
        if (!latestSeenId || isNewerMoodId(newestId, latestSeenId)) {
          latestSeenId = newestId;
        }

        if (pendingUpdateId && !isNewerMoodId(pendingUpdateId, latestSeenId)) {
          pendingUpdateId = '';
          dismissedUpdateId = '';
          hideUpdateNotice();
        }
      };

      const handleDetectedUpdate = (nextLatestId: string): void => {
        if (!nextLatestId || dismissedUpdateId === nextLatestId) return;
        if (!pendingUpdateId || isNewerMoodId(nextLatestId, pendingUpdateId)) {
          pendingUpdateId = nextLatestId;
        }

        const canAutoRefresh = document.visibilityState === 'visible'
          && window.scrollY <= AUTO_REFRESH_MAX_SCROLL_Y;
        showUpdateNotice(canAutoRefresh);
      };

      const fetchLatestMoodId = async (): Promise<string> => {
        const response = await fetch('/api/moods?probe=1&fresh=1', {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        if (!response.ok) {
          throw new Error('Failed to check mood updates.');
        }
        const data = await response.json() as { latestId?: unknown };
        return typeof data.latestId === 'string' ? data.latestId : '';
      };

      const checkForUpdates = async (): Promise<void> => {
        if (!updateWatcherStarted || document.visibilityState !== 'visible') return;
        if (isLoading || isCheckingUpdates) return;

        isCheckingUpdates = true;
        try {
          const remoteLatestId = await fetchLatestMoodId();
          if (!remoteLatestId) return;

          if (!latestSeenId) {
            if (totalCount === 0) {
              handleDetectedUpdate(remoteLatestId);
            } else {
              latestSeenId = remoteLatestId;
            }
            return;
          }

          if (isNewerMoodId(remoteLatestId, latestSeenId)) {
            handleDetectedUpdate(remoteLatestId);
          }
        } catch (error) {
          console.error('Failed to check mood updates:', error);
        } finally {
          isCheckingUpdates = false;
        }
      };

      const clearUpdatePollTimer = (): void => {
        if (updatePollTimer) {
          window.clearTimeout(updatePollTimer);
          updatePollTimer = 0;
        }
      };

      const scheduleNextUpdateCheck = (delay = UPDATE_POLL_INTERVAL_MS): void => {
        clearUpdatePollTimer();
        updatePollTimer = window.setTimeout(async () => {
          await checkForUpdates();
          scheduleNextUpdateCheck();
        }, delay);
      };

      const startUpdateWatcher = (): void => {
        if (updateWatcherStarted) return;
        updateWatcherStarted = true;
        syncLatestSeenId();
        scheduleNextUpdateCheck();

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            if (pendingUpdateId && isNewerMoodId(pendingUpdateId, latestSeenId) && dismissedUpdateId !== pendingUpdateId) {
              const canAutoRefresh = window.scrollY <= AUTO_REFRESH_MAX_SCROLL_Y;
              showUpdateNotice(canAutoRefresh);
            }
            checkForUpdates();
            return;
          }
          cancelAutoRefresh();
        });

        window.addEventListener('online', () => {
          checkForUpdates();
        });

        window.addEventListener(
          'scroll',
          () => {
            if (!autoRefreshPending) return;
            if (window.scrollY > AUTO_REFRESH_CANCEL_SCROLL_Y) {
              showUpdateNotice(false);
            }
          },
          { passive: true }
        );

        window.addEventListener('beforeunload', clearUpdatePollTimer, { once: true });
      };

      const fetchMoods = async (beforeId?: string): Promise<{ posts: MoodData[]; channel?: ChannelInfo }> => {
        const url = beforeId ? `/api/moods?before=${encodeURIComponent(beforeId)}` : '/api/moods';
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to load moods.');
        }
        return response.json() as Promise<{ posts: MoodData[]; channel?: ChannelInfo }>;
      };

      const setStatus = (message: string): void => {
        status.textContent = message;
      };

      const setLoadingState = (loading: boolean): void => {
        if (loadButton) {
          loadButton.disabled = loading || !hasMore;
          loadButton.setAttribute('aria-busy', loading ? 'true' : 'false');
        }

        if (loading) {
          list.setAttribute('aria-busy', 'true');
        } else {
          list.removeAttribute('aria-busy');
        }
      };

      const showInlineLoading = (): void => {
        if (feedEl.querySelector('.mood-loading-inline')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'mood-loading-inline';
        wrapper.setAttribute('aria-hidden', 'true');

        // Create a single skeleton group for inline loading
        const group = document.createElement('div');
        group.className = 'mood-skeleton-group';
        group.style.setProperty('--group-index', '0');
        group.style.setProperty('--date-width', inlineSkeletonConfig.dateWidth);

        const header = document.createElement('div');
        header.className = 'mood-skeleton-header';

        const dateEl = document.createElement('span');
        dateEl.className = 'mood-skeleton-date';

        const headerLine = document.createElement('div');
        headerLine.className = 'mood-skeleton-header-line';

        header.appendChild(dateEl);
        header.appendChild(headerLine);

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'mood-skeleton-items';

        inlineSkeletonConfig.items.forEach((itemConfig, index) => {
          const item = document.createElement('div');
          item.className = 'mood-skeleton-item';
          item.style.setProperty('--item-index', String(index));
          item.style.setProperty('--line-width', itemConfig.lineWidth);

          const time = document.createElement('span');
          time.className = 'mood-skeleton-time';

          const content = document.createElement('div');
          content.className = 'mood-skeleton-content';

          const line = document.createElement('span');
          line.className = 'mood-skeleton-line';

          content.appendChild(line);
          item.appendChild(time);
          item.appendChild(content);
          itemsContainer.appendChild(item);
        });

        group.appendChild(header);
        group.appendChild(itemsContainer);
        wrapper.appendChild(group);

        const controls = feedEl.querySelector('.mood-load-controls');
        if (controls) {
          feedEl.insertBefore(wrapper, controls);
        } else {
          feedEl.appendChild(wrapper);
        }
      };

      const hideInlineLoading = (): void => {
        feedEl.querySelector('.mood-loading-inline')?.remove();
      };

      const isLongContent = (text: string): boolean => (text || '').length > 280;
      const buildPreviewFragment = (previewText: string, previewHtml?: string): DocumentFragment => (
        buildMoodPreviewFragment(previewText, previewHtml, {
          preserveRichTextTags: true,
        })
      );

      const getQuoteTargetId = (href: string): string | null => {
        if (!href) return null;
        try {
          const url = new URL(href, window.location.origin);
          const match = url.pathname.match(/\/mood\/(\d+)/);
          return match ? match[1] : null;
        } catch {
          return null;
        }
      };

      const scrollToMood = (id: string): boolean => {
        if (!list) return false;
        const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(id)
          : id.replace(/"/g, '\\"');
        const target = list.querySelector(`[data-mood-id="${escapedId}"]`) as HTMLElement | null;
        if (!target) return false;
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'center',
        });
        return true;
      };

      const animatedEmoji = createAnimatedEmojiManager();

      // Comments popover manager
  	    const commentsPopoverManager = (() => {
  	      interface CommentPreviewData {
  	        id?: string;
  	        author?: string;
  	        authorAvatar?: string;
  	        datetime?: string;
  	        content?: string;
  	        reactions?: ReactionData[];
  	      }

  	      const cache = new Map<string, CommentPreviewData[]>();
  	      const pendingFetches = new Map<string, Promise<CommentPreviewData[]>>();

        const formatDate = (datetime: string): string => {
          const date = new Date(datetime);
          const now = new Date();
          const diffMs = now.getTime() - date.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMs / 3600000);
          const diffDays = Math.floor(diffMs / 86400000);

          if (diffMins < 1) return 'just now';
          if (diffMins < 60) return `${diffMins}m`;
          if (diffHours < 24) return `${diffHours}h`;
          if (diffDays < 7) return `${diffDays}d`;
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        };

        const getInitials = (name: string): string => {
          return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
        };

  	      const fetchComments = async (postId: string): Promise<CommentPreviewData[]> => {
          if (cache.has(postId)) {
            return cache.get(postId)!;
          }

          if (pendingFetches.has(postId)) {
            return pendingFetches.get(postId)!;
          }

          const promise = (async () => {
            try {
              const response = await fetch(`/api/comments?postId=${postId}`);
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

        const renderComment = (comment: any): HTMLElement => {
          const root = document.createElement('div');
          root.className = 'mood-popover-comment';

          const avatar = document.createElement('div');
          avatar.className = 'mood-popover-comment-avatar';

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
          body.className = 'mood-popover-comment-body';

          const header = document.createElement('div');
          header.className = 'mood-popover-comment-header';

          const authorEl = document.createElement('span');
          authorEl.className = 'mood-popover-comment-author';
          authorEl.textContent = author;

          const datetimeRaw = asText(comment?.datetime).trim();
          const dateEl = document.createElement('time');
          dateEl.className = 'mood-popover-comment-date';
          if (datetimeRaw) {
            dateEl.dateTime = datetimeRaw;
          }
          dateEl.textContent = formatDate(datetimeRaw);

          header.appendChild(authorEl);
          header.appendChild(dateEl);
          body.appendChild(header);

          const content = document.createElement('div');
          content.className = 'mood-popover-comment-content';
          content.appendChild(buildCommentContentFragment(comment?.content));
          body.appendChild(content);

          root.appendChild(body);
          return root;
        };

        const renderPopover = (popover: HTMLElement, comments: any[], postId: string): void => {
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

          // Hydrate animated emojis in popover
          animatedEmoji.hydrate(popover);
        };

        const handleHover = async (wrapper: HTMLElement): Promise<void> => {
          const postId = wrapper.dataset.postId;
          if (!postId) return;

          const popover = wrapper.querySelector('.mood-comments-popover') as HTMLElement;
          if (!popover) return;

          // Skip if already loaded
          if (popover.dataset.loaded === 'true') return;

          const comments = await fetchComments(postId);
          renderPopover(popover, comments, postId);
          popover.dataset.loaded = 'true';
        };

        const init = (): void => {
          document.addEventListener(
            'mouseenter',
            (event) => {
              const target = event.target;
              if (!(target instanceof Element)) return;
              const wrapper = target.closest('.mood-comments-wrapper') as HTMLElement | null;
              if (wrapper) {
                handleHover(wrapper);
              }
            },
            true
          );
        };

        return { init, handleHover };
      })();

      commentsPopoverManager.init();

      interface ReactionData {
        emoji: string;
        emojiId?: string;
        emojiImage?: string;
        count: string;
        isPaid: boolean;
      }

      interface ForwardedFromData {
        name: string;
        href?: string;
        author?: string;
      }

      interface QuoteData {
        text: string;
        author?: string;
        href?: string;
        thumbnailSrc?: string;
      }

      interface ChannelInfo {
        slug?: string;
        title?: string;
        titleHTML?: string;
        emojiId?: string;
        avatar?: string;
        description?: string;
        descriptionHTML?: string;
      }

      let channelInfo: ChannelInfo | null = null;

      const setImageHints = (
        img: HTMLImageElement,
        options: { priority?: boolean; lazy?: boolean } = {}
      ): void => {
        const { priority = false, lazy = true } = options;
        if (!img.getAttribute('decoding')) {
          img.decoding = 'async';
        }
        if (priority) {
          img.loading = 'eager';
          img.setAttribute('fetchpriority', 'high');
          return;
        }
        if (lazy && !img.getAttribute('loading')) {
          img.loading = 'lazy';
        }
      };

      const applyMediaHints = (root: HTMLElement, priority = false): void => {
        root.querySelectorAll('img').forEach((node) => {
          if (!(node instanceof HTMLImageElement)) return;
          setImageHints(node, { priority });
        });

        root.querySelectorAll('iframe').forEach((node) => {
          if (!(node instanceof HTMLIFrameElement)) return;
          if (!node.getAttribute('loading')) {
            node.loading = 'lazy';
          }
        });

        root.querySelectorAll('video').forEach((node) => {
          if (!(node instanceof HTMLVideoElement)) return;
          const classify = () => {
            const w = node.videoWidth;
            const h = node.videoHeight;
            if (!w || !h) return;
            const ratio = w / h;
            if (ratio < 0.6) {
              node.classList.add('video--ultra-tall');
            } else if (ratio < 0.8) {
              node.classList.add('video--portrait');
            }
          };
          if (node.readyState >= 1) {
            classify();
          } else {
            node.addEventListener('loadedmetadata', classify, { once: true });
          }
        });
      };

      const responsiveImageWidths = [480, 800, 1200];
      const thumbnailImageSizes = '(min-width: 1024px) 560px, (min-width: 640px) 480px, 100vw';
      const deferredImageRootMargin = '600px 0px';
      let deferredImageObserver: IntersectionObserver | null = null;

      const hydrateDeferredImage = (img: HTMLImageElement): void => {
        if (img.dataset.deferredHydrated === '1') return;
        const src = img.dataset.deferredSrc || '';
        if (!src) return;

        img.dataset.deferredHydrated = '1';
        img.src = src;
        applyResponsiveImage(img, src, thumbnailImageSizes, responsiveImageWidths);
      };

      const getDeferredImageObserver = (): IntersectionObserver | null => {
        if (!('IntersectionObserver' in window)) {
          return null;
        }

        if (deferredImageObserver) {
          return deferredImageObserver;
        }

        deferredImageObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;

              deferredImageObserver?.unobserve(entry.target);
              const target = entry.target as HTMLElement;
              const img = target.querySelector('img');
              if (!(img instanceof HTMLImageElement)) return;

              hydrateDeferredImage(img);
            });
          },
          {
            rootMargin: deferredImageRootMargin,
          }
        );

        return deferredImageObserver;
      };

      const registerDeferredImage = (container: HTMLElement, img: HTMLImageElement): void => {
        const observer = getDeferredImageObserver();
        if (!observer) {
          hydrateDeferredImage(img);
          return;
        }

        observer.observe(container);
      };

      // Hero hydration function
      const hydrateHero = (channel: ChannelInfo): void => {
        const heroEl = document.querySelector('[data-mood-hero]');
        if (!heroEl) return;

        const avatarEl = heroEl.querySelector('[data-hero-avatar]');
        const titleEl = heroEl.querySelector('[data-hero-title]');
        const descEl = heroEl.querySelector('[data-hero-description]');

        // Hydrate avatar
        if (avatarEl && channel.avatar) {
          const img = document.createElement('img');
          img.src = channel.avatar;
          img.alt = channel.title || 'Channel avatar';
          img.className = 'mood-hero-avatar-img';
          setImageHints(img, { priority: true, lazy: false });
          img.onload = () => {
            avatarEl.classList.add('is-loaded');
          };
          avatarEl.appendChild(img);
        } else if (avatarEl) {
          avatarEl.classList.add('is-loaded');
        }

        // Hydrate title with custom emoji support
        if (titleEl) {
          if (channel.titleHTML) {
            titleEl.innerHTML = channel.titleHTML;
            // Hydrate animated emoji in title
            animatedEmoji.hydrate(titleEl);
          } else if (channel.title) {
            titleEl.textContent = channel.title;
          }
          // Append custom emoji from env variable (supports animated Telegram emoji)
          if (channel.emojiId) {
            const emojiSpan = document.createElement('span');
            emojiSpan.className = 'tg-emoji mood-hero-emoji';
            emojiSpan.dataset.emojiId = channel.emojiId;
            // Add static fallback image
            const img = document.createElement('img');
            img.src = `/static/https://t.me/i/emoji/${channel.emojiId}.webp`;
            img.alt = 'emoji';
            setImageHints(img, { lazy: false });
            emojiSpan.appendChild(img);
            titleEl.appendChild(emojiSpan);
            // Hydrate for Lottie animation
            animatedEmoji.hydrate(titleEl);
          }
          titleEl.classList.add('is-loaded');
        }

        // Hydrate description with custom emoji support
        if (descEl) {
          if (channel.descriptionHTML) {
            descEl.innerHTML = channel.descriptionHTML;
            // Hydrate animated emoji in description
            animatedEmoji.hydrate(descEl);
          } else if (channel.description) {
            descEl.textContent = channel.description;
          }
          descEl.classList.add('is-loaded');
        }

        // Mark hero as loaded
        heroEl.classList.add('is-loaded');
      };

      const normalizeAuthorName = (value: string): string =>
        value.replace(/\s+/g, ' ').trim().replace(/^@/, '').toLowerCase().replace(/[^\w-]+$/g, '');

      const shouldHideQuoteAuthor = (value?: string): boolean => {
        if (!value) return false;
        const normalized = normalizeAuthorName(value);
        const slug = channelInfo?.slug ? normalizeAuthorName(channelInfo.slug) : '';
        const title = channelInfo?.title ? normalizeAuthorName(channelInfo.title) : '';
        return Boolean(
          (slug && normalized === slug) ||
          (title && normalized === title)
        );
      };

      interface MoodData {
        id: string;
        datetime: string;
        tag?: string;
        previewText: string;
        previewHtml?: string;
        previewMediaType?: string;
        gallery?: MoodGallery | null;
        image?: string | null;
        imageFallback?: string | null;
        imageWidth?: number | null;
        imageHeight?: number | null;
        imageLayout?: 'landscape' | 'portrait' | 'ultra-tall' | null;
        mediaHtml?: string;
        needsDetailPage?: boolean;
        forwardedFrom?: ForwardedFromData | null;
        quote?: QuoteData | null;
        reactions?: ReactionData[];
        commentsCount?: number | string;
      }

      const getCommentsCountInfo = (value: MoodData['commentsCount']): { count: number; label: string } => {
        if (typeof value === 'number' && Number.isFinite(value)) {
          return { count: value, label: String(value) };
        }

        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (!trimmed) {
            return { count: 0, label: '' };
          }

          const direct = Number(trimmed.replace(/,/g, ''));
          if (Number.isFinite(direct)) {
            return { count: direct, label: trimmed };
          }

          const match = trimmed.match(/(\d+(?:[.,]\d+)?)(\s*[kKmM])?/);
          if (!match) {
            return { count: 0, label: '' };
          }

          let count = Number(match[1].replace(',', '.'));
          const suffix = match[2]?.trim() ?? '';
          if (/k/i.test(suffix)) {
            count *= 1000;
          } else if (/m/i.test(suffix)) {
            count *= 1_000_000;
          }

          if (!Number.isFinite(count)) {
            return { count: 0, label: '' };
          }

          return { count, label: trimmed };
        }

        return { count: 0, label: '' };
      };

      const createMoodItem = (mood: MoodData, index: number): HTMLElement => {
        const mediaHtml = typeof mood.mediaHtml === 'string' ? mood.mediaHtml.trim() : '';
        const hasMediaHtml = mediaHtml.length > 0;
        const previewMediaType = typeof mood.previewMediaType === 'string' ? mood.previewMediaType.trim() : '';
        const needsDetailPage = typeof mood.needsDetailPage === 'boolean'
          ? mood.needsDetailPage
          : isLongContent(mood.previewText);
        const shouldLink = needsDetailPage && !hasMediaHtml;
        const isPriorityItem = index === 0;
        const element = document.createElement('div');

        if (shouldLink) {
          element.className = 'mood-item mood-item--clickable';
          element.dataset.href = `/mood/${mood.id}`;
          element.setAttribute('role', 'link');
          element.tabIndex = 0;
        } else {
          element.className = 'mood-item';
        }

        element.dataset.moodId = mood.id;
        element.style.setProperty('--item-index', String(index));

        const time = document.createElement('time');
        time.className = 'mood-item-time';
        time.dateTime = mood.datetime;
        time.textContent = formatTime(mood.datetime);

        const content = document.createElement('div');
        content.className = 'mood-item-content';

        const forwardedFrom = mood.forwardedFrom && mood.forwardedFrom.name ? mood.forwardedFrom : null;
        if (forwardedFrom) {
          const forwarded = document.createElement('div');
          forwarded.className = 'mood-item-forwarded';

          const label = document.createElement('span');
          label.className = 'mood-forwarded-label';
          label.textContent = 'Forwarded from';
          forwarded.appendChild(label);

          const source = document.createElement(forwardedFrom.href ? 'a' : 'span');
          source.className = 'mood-forwarded-source';
          source.textContent = forwardedFrom.name;
          if (source instanceof HTMLAnchorElement && forwardedFrom.href) {
            source.href = forwardedFrom.href;
            source.target = '_blank';
            source.rel = 'noopener noreferrer';
          }
          forwarded.appendChild(source);

          const author = forwardedFrom.author && forwardedFrom.author !== forwardedFrom.name
            ? forwardedFrom.author
            : '';
          if (author) {
            const authorSpan = document.createElement('span');
            authorSpan.className = 'mood-forwarded-author';
            authorSpan.textContent = `(${author})`;
            forwarded.appendChild(authorSpan);
          }

          content.appendChild(forwarded);
        }

        const quote = mood.quote && mood.quote.text ? mood.quote : null;
        if (quote) {
          const quoteWrap = document.createElement(quote.href ? 'a' : 'div');
          quoteWrap.className = 'mood-item-quote';
          const isMediaOnlyQuote = Boolean(quote.thumbnailSrc && /^(Media|Video)$/i.test(quote.text));
          if (isMediaOnlyQuote) {
            quoteWrap.classList.add('mood-item-quote--media-only');
          } else if (quote.thumbnailSrc) {
            quoteWrap.classList.add('mood-item-quote--with-media');
          }
          if (quoteWrap instanceof HTMLAnchorElement && quote.href) {
            quoteWrap.href = quote.href;
            if (/^https?:\/\//i.test(quote.href)) {
              quoteWrap.target = '_blank';
              quoteWrap.rel = 'noopener noreferrer';
            }
          }
          const quoteTargetId = quote.href ? getQuoteTargetId(quote.href) : null;
          if (quoteTargetId) {
            quoteWrap.dataset.quoteId = quoteTargetId;
          }

          if (quote.thumbnailSrc) {
            const quoteMedia = document.createElement('span');
            quoteMedia.className = 'mood-item-quote-media';

            const quoteImage = document.createElement('img');
            quoteImage.className = 'mood-item-quote-image';
            quoteImage.src = quote.thumbnailSrc;
            quoteImage.alt = '';
            quoteImage.loading = 'lazy';
            quoteImage.decoding = 'async';

            quoteMedia.appendChild(quoteImage);
            quoteWrap.appendChild(quoteMedia);
          }

          const quoteBody = document.createElement('span');
          quoteBody.className = 'mood-item-quote-body';

          const quoteMeta = document.createElement('div');
          quoteMeta.className = 'mood-item-quote-meta';

          const authorToShow = quote.author && !shouldHideQuoteAuthor(quote.author) ? quote.author : '';
          if (authorToShow) {
            const quoteAuthor = document.createElement('span');
            quoteAuthor.className = 'mood-item-quote-author';
            quoteAuthor.textContent = authorToShow;
            quoteMeta.appendChild(quoteAuthor);
          }

          if (quoteMeta.childNodes.length > 0) {
            quoteBody.appendChild(quoteMeta);
          }

          if (!isMediaOnlyQuote) {
            const quoteText = document.createElement('p');
            quoteText.className = 'mood-item-quote-text';
            quoteText.textContent = quote.text;
            quoteBody.appendChild(quoteText);
          }

          if (quoteBody.childNodes.length > 0) {
            quoteWrap.appendChild(quoteBody);
          }
          content.appendChild(quoteWrap);
        }

        const text = document.createElement('p');
        text.className = 'mood-item-text';
        const previewText = mood.previewText || '';
        const previewHtml = mood.previewHtml || '';
        const hasTextPreview = Boolean(previewText.trim() || previewHtml.trim());
        const isLongPreview = isLongContent(previewText);
        if (hasTextPreview) {
          text.appendChild(buildPreviewFragment(previewText, previewHtml));
          content.appendChild(text);
        }
        if (hasTextPreview && isLongPreview) {
          text.classList.add('mood-item-text--clamped');
        }

        const isTooBigVideoPreview = previewMediaType === 'too-big-video' && Boolean(mood.image);
        const isMediaOnlyVideoPreview =
          isTooBigVideoPreview &&
          !hasTextPreview &&
          !hasMediaHtml &&
          !forwardedFrom &&
          !quote;

        if (isMediaOnlyVideoPreview) {
          element.classList.add('mood-item--media-only');
          content.classList.add('mood-item-content--media-only');
        }

        if (hasMediaHtml) {
          const media = document.createElement('div');
          media.className = 'mood-item-media';
          media.innerHTML = mediaHtml;
          applyMediaHints(media, isPriorityItem);
          content.appendChild(media);
        } else if (!isTooBigVideoPreview && (mood.gallery?.items.length ?? 0) > 1) {
          const gallery = createMoodGalleryElement(mood.gallery, {
            variant: 'feed',
            priority: isPriorityItem,
          });
          content.appendChild(gallery);
        } else if (mood.image) {
          const thumbWrap = document.createElement('div');
          thumbWrap.className = 'mood-item-thumb';
          if (isTooBigVideoPreview) {
            thumbWrap.classList.add('mood-item-thumb--video');
          }
          const imageLayout = isTooBigVideoPreview
            ? null
            : mood.imageLayout === 'portrait' || mood.imageLayout === 'ultra-tall'
              ? mood.imageLayout
              : mood.imageLayout === 'landscape'
                ? 'landscape'
                : null;
          if (imageLayout === 'portrait') {
            thumbWrap.classList.add('mood-item-thumb--portrait');
          } else if (imageLayout === 'ultra-tall') {
            thumbWrap.classList.add('mood-item-thumb--ultra-tall');
          }
          const img = document.createElement('img');
          img.alt = '';
          if (typeof mood.imageWidth === 'number' && mood.imageWidth > 0) {
            img.width = mood.imageWidth;
          }
          if (typeof mood.imageHeight === 'number' && mood.imageHeight > 0) {
            img.height = mood.imageHeight;
          }
          const fallback = typeof mood.imageFallback === 'string' ? mood.imageFallback.trim() : '';
          if (fallback) {
            img.dataset.fallbackSrc = fallback;
            img.onerror = () => {
              if (img.dataset.fallbackApplied === '1') return;
              const fallbackSrc = img.dataset.fallbackSrc || '';
              if (!fallbackSrc) return;
              img.dataset.fallbackApplied = '1';
              img.src = fallbackSrc;
              applyResponsiveImage(img, fallbackSrc, thumbnailImageSizes, responsiveImageWidths);
            };
          }
          setImageHints(img, { priority: isPriorityItem });
          if (isPriorityItem) {
            img.src = mood.image;
            applyResponsiveImage(img, mood.image, thumbnailImageSizes, responsiveImageWidths);
          } else {
            img.dataset.deferredSrc = mood.image;
          }
          const classifyLoadedImage = () => {
            if (!img.naturalWidth || !img.naturalHeight) return;
            if (isTooBigVideoPreview) {
              const aspectRatio = img.naturalWidth / img.naturalHeight;
              thumbWrap.style.setProperty('--mood-thumb-ratio', `${img.naturalWidth} / ${img.naturalHeight}`);
              if (aspectRatio < 0.6) {
                thumbWrap.classList.add('mood-item-thumb--video-ultra-tall');
              } else if (aspectRatio < 0.8) {
                thumbWrap.classList.add('mood-item-thumb--video-portrait');
              }
              return;
            }

            const aspectRatio = img.naturalWidth / img.naturalHeight;

            if (aspectRatio < 0.6) {
              thumbWrap.classList.add('mood-item-thumb--ultra-tall');
            } else if (aspectRatio < 0.8) {
              thumbWrap.classList.add('mood-item-thumb--portrait');
            }
          };
          if (!imageLayout) {
            const pollForImageDimensions = (): void => {
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                classifyLoadedImage();
                return;
              }
              if (!img.isConnected || img.complete) {
                return;
              }
              window.requestAnimationFrame(pollForImageDimensions);
            };
            if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
              classifyLoadedImage();
            } else {
              img.addEventListener('load', classifyLoadedImage, { once: true });
              window.requestAnimationFrame(pollForImageDimensions);
            }
          }
          if (
            isTooBigVideoPreview &&
            typeof mood.imageWidth === 'number' &&
            mood.imageWidth > 0 &&
            typeof mood.imageHeight === 'number' &&
            mood.imageHeight > 0
          ) {
            thumbWrap.style.setProperty('--mood-thumb-ratio', `${mood.imageWidth} / ${mood.imageHeight}`);
            const aspectRatio = mood.imageWidth / mood.imageHeight;
            if (aspectRatio < 0.6) {
              thumbWrap.classList.add('mood-item-thumb--video-ultra-tall');
            } else if (aspectRatio < 0.8) {
              thumbWrap.classList.add('mood-item-thumb--video-portrait');
            }
          }
          thumbWrap.appendChild(img);
          if (isTooBigVideoPreview) {
            const overlay = document.createElement('div');
            overlay.className = 'mood-item-thumb-video-overlay';
            overlay.setAttribute('aria-hidden', 'true');

            const label = document.createElement('span');
            label.className = 'mood-item-thumb-video-label';
            label.textContent = 'Media is too big';

            const cta = document.createElement('span');
            cta.className = 'mood-item-thumb-video-cta';
            cta.textContent = 'View details';

            overlay.appendChild(label);
            overlay.appendChild(cta);
            thumbWrap.appendChild(overlay);
          }
          if (!isPriorityItem) {
            registerDeferredImage(thumbWrap, img);
          }
          content.appendChild(thumbWrap);
        }

        if (isLongPreview) {
          const details = document.createElement('a');
          details.className = 'mood-item-details link';
          details.href = `/mood/${mood.id}`;
          details.textContent = 'View details';
          content.appendChild(details);
        }

        // Add reactions, comments, and expand icon
        const hasReactions = mood.reactions && mood.reactions.length > 0;
        const commentsInfo = getCommentsCountInfo(mood.commentsCount);
        const hasComments = commentsInfo.count > 0;

        // Always create reactions wrapper for the expand icon
        const reactionsWrap = document.createElement('div');
        reactionsWrap.className = 'mood-item-reactions';

          // Add reaction pills
          if (hasReactions) {
            (mood.reactions ?? []).forEach((reaction) => {
              const pill = document.createElement('span');
              pill.className = reaction.isPaid ? 'mood-reaction mood-reaction--paid' : 'mood-reaction';
              const emojiSpan = document.createElement('span');
              emojiSpan.className = 'mood-reaction-emoji';
              if (reaction.isPaid) {
                emojiSpan.textContent = '⭐';
              } else if (reaction.emojiImage || reaction.emojiId) {
                const wrapper = document.createElement('span');
                wrapper.className = 'tg-emoji';
                if (reaction.emojiId) {
                  wrapper.dataset.emojiId = reaction.emojiId;
                }
                if (reaction.emojiImage) {
                  const img = document.createElement('img');
                  img.src = reaction.emojiImage;
                  img.alt = reaction.emoji || 'emoji';
                  img.loading = 'lazy';
                  img.decoding = 'async';
                  img.width = 16;
                  img.height = 16;
                  wrapper.appendChild(img);
                } else if (reaction.emoji) {
                  wrapper.textContent = reaction.emoji;
                }
                emojiSpan.appendChild(wrapper);
              } else {
                emojiSpan.textContent = reaction.emoji;
              }
              const count = document.createElement('span');
              count.className = 'mood-reaction-count';
              count.textContent = reaction.count;
              pill.appendChild(emojiSpan);
              pill.appendChild(count);
              reactionsWrap.appendChild(pill);
            });
          }

          // Add comments indicator with hover popover
          if (hasComments) {
            const wrapper = document.createElement('div');
            wrapper.className = 'mood-comments-wrapper';
            wrapper.dataset.postId = mood.id;

            const commentsLink = document.createElement('a');
            commentsLink.className = 'mood-item-comments';
            commentsLink.href = `/mood/${mood.id}#comments`;
            const commentsLabel = commentsInfo.label || String(commentsInfo.count);
            commentsLink.title = `${commentsLabel} comment${commentsInfo.count === 1 ? '' : 's'}`;

            // Chat bubble icon (SVG)
            const iconSpan = document.createElement('span');
            iconSpan.className = 'mood-comments-icon';
            iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;

            const countSpan = document.createElement('span');
            countSpan.className = 'mood-comments-count';
            countSpan.textContent = commentsLabel;

            commentsLink.appendChild(iconSpan);
            commentsLink.appendChild(countSpan);

            // Create popover
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

            wrapper.appendChild(commentsLink);
            wrapper.appendChild(popover);
            reactionsWrap.appendChild(wrapper);
          }

        content.appendChild(reactionsWrap);

        // Add floating expand button for all items
        const expandBtn = document.createElement('a');
        expandBtn.className = 'mood-item-expand-float';
        expandBtn.href = `/mood/${mood.id}`;
        expandBtn.title = 'View full post';
        expandBtn.setAttribute('aria-label', 'View full post');
        expandBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`;
        element.appendChild(expandBtn);

        if (mood.tag) {
          const tag = document.createElement('span');
          tag.className = 'mood-item-tag';
          tag.textContent = `#${mood.tag}`;
          content.appendChild(tag);
        }

        element.appendChild(time);
        element.appendChild(content);
        return element;
      };

      const createDateGroup = (dateKey: string): HTMLElement => {
        const group = document.createElement('div');
        group.className = 'mood-date-group';
        group.dataset.date = dateKey;

        const header = document.createElement('div');
        header.className = 'mood-date-header';

        const dateText = document.createElement('span');
        dateText.className = 'mood-date-text';
        dateText.textContent = formatDateHeader(dateKey);

        const dateLine = document.createElement('div');
        dateLine.className = 'mood-date-line';

        header.appendChild(dateText);
        header.appendChild(dateLine);

        const items = document.createElement('div');
        items.className = 'mood-date-items';

        group.appendChild(header);
        group.appendChild(items);

        return group;
      };

      const navigateToMood = (target: HTMLElement | null): void => {
        if (!target) return;
        if (target.closest('.mood-item-quote')) return;
        if (target.closest('.mood-gallery')) return;
        if (target.closest('a')) return;

        const item = target.closest('.mood-item--clickable') as HTMLElement | null;
        if (!item) return;

        const href = item.dataset.href;
        if (href) {
          window.location.href = href;
        }
      };

      const handleQuoteJump = (target: HTMLElement | null, event: Event): boolean => {
        const quoteEl = target?.closest('.mood-item-quote') as HTMLElement | null;
        if (!quoteEl) return false;
        const quoteId = quoteEl.dataset.quoteId;
        if (quoteId && scrollToMood(quoteId)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return true;
      };

      list.addEventListener('click', (event) => {
        const target = event.target as HTMLElement | null;
        if (handleQuoteJump(target, event)) return;
        navigateToMood(target);
      });

      list.addEventListener('keydown', (event) => {
        const keyEvent = event as KeyboardEvent;
        if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;
        const target = event.target as HTMLElement | null;
        if (!target || target.closest('a')) return;
        event.preventDefault();
        navigateToMood(target);
      });

      const appendMoods = (posts: MoodData[], startIndex = totalCount): void => {
        const grouped = new Map<string, MoodData[]>();

        posts.forEach((post) => {
          const dateKey = formatDateKey(post.datetime);
          if (!grouped.has(dateKey)) {
            grouped.set(dateKey, []);
          }
          grouped.get(dateKey)!.push(post);
        });

        let globalIndex = startIndex;
        const listFragment = document.createDocumentFragment();
        grouped.forEach((datePosts, dateKey) => {
          let entry = getGroupEntry(dateKey);
          let group = entry?.group ?? null;
          let itemsContainer = entry?.items ?? null;

          if (!group) {
            group = createDateGroup(dateKey);
            itemsContainer = group.querySelector('.mood-date-items') as HTMLElement | null;
            if (itemsContainer) {
              groupCache.set(dateKey, { group, items: itemsContainer });
            }
            listFragment.appendChild(group);
          }

          if (!itemsContainer) return;

          const itemsFragment = document.createDocumentFragment();
          datePosts.forEach((post) => {
            if (!post?.id || renderedIdSet.has(post.id)) return;
            const item = createMoodItem(post, globalIndex);
            itemsFragment.appendChild(item);
            renderedIdSet.add(post.id);
            registerMoodId(post.id);
            globalIndex++;
          });
          itemsContainer.appendChild(itemsFragment);
        });

        if (listFragment.childNodes.length > 0) {
          list.appendChild(listFragment);
          initMoodGalleries(list);
        }

        totalCount = globalIndex;
        syncLatestSeenId();
      };

      const handleNoMore = (): void => {
        hasMore = false;
        if (loadButton) {
          loadButton.classList.add('is-hidden');
        }
        setStatus('No more moods.');
        if (observer) {
          observer.disconnect();
        }
      };

      const showError = (): void => {
        loadingEl.classList.add('is-hidden');
        feedEl.classList.add('is-hidden');
        errorEl.classList.remove('is-hidden');
      };

      const showFeed = (): void => {
        loadingEl.classList.add('is-hidden');
        errorEl.classList.add('is-hidden');
        feedEl.classList.remove('is-hidden');
      };

      const loadInitial = async (): Promise<void> => {
        try {
          let ready: MoodData[] = [];
          let beforeId = '';
          let lastBefore = '';
          while (hasMore && ready.length === 0) {
            const data = await fetchMoods(beforeId);
            const posts = Array.isArray(data.posts) ? data.posts : [];
            if (data.channel && !channelInfo) {
              channelInfo = data.channel;
              hydrateHero(channelInfo);
            }
            if (!posts.length) {
              hasMore = false;
              break;
            }

            ready = ready.concat(stagePostsForRender(posts));
            const nextBefore = getBeforeId();
            if (!nextBefore || nextBefore === lastBefore) {
              hasMore = false;
              break;
            }
            lastBefore = nextBefore;
            beforeId = nextBefore;
          }

          if (!hasMore) {
            ready = ready.concat(flushPendingPosts());
          }

          if (!ready.length && !pendingPosts.length) {
            showFeed();
            handleNoMore();
            setStatus('No moods yet.');
            startUpdateWatcher();
            return;
          }

          if (ready.length) {
            appendMoods(ready, totalCount);
          }
          showFeed();
          startUpdateWatcher();

          if (!hasMore) {
            handleNoMore();
            return;
          }

          observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  loadMore();
                }
              });
            },
            {
              rootMargin: '300px 0px',
            }
          );

          observer.observe(sentinel);
        } catch (error) {
          console.error(error);
          showError();
        }
      };

      const loadMore = async (): Promise<void> => {
        if (isLoading || !hasMore) {
          return;
        }

        let beforeId = getBeforeId();
        if (!beforeId) {
          handleNoMore();
          return;
        }

        isLoading = true;
        setStatus('');
        setLoadingState(true);
        showInlineLoading();

        try {
          let ready: MoodData[] = [];
          let lastBefore = beforeId;
          while (hasMore && ready.length === 0) {
            const data = await fetchMoods(beforeId);
            const posts = Array.isArray(data.posts) ? data.posts : [];
            if (data.channel) {
              channelInfo = data.channel;
            }
            if (!posts.length) {
              hasMore = false;
              break;
            }

            ready = ready.concat(stagePostsForRender(posts));
            const nextBefore = getBeforeId();
            if (!nextBefore || nextBefore === lastBefore) {
              hasMore = false;
              break;
            }
            lastBefore = nextBefore;
            beforeId = nextBefore;
          }

          if (!hasMore) {
            ready = ready.concat(flushPendingPosts());
          }

          if (!ready.length && !hasMore) {
            handleNoMore();
            return;
          }

          if (ready.length) {
            appendMoods(ready, totalCount);
            setStatus('');
          }

          if (!hasMore) {
            handleNoMore();
          }
        } catch (error) {
          console.error(error);
          setStatus('Unable to load more moods.');
        } finally {
          isLoading = false;
          setLoadingState(false);
          hideInlineLoading();
        }
      };

        if (loadButton) {
          loadButton.addEventListener('click', loadMore);
        }

        if (updateRefreshBtn) {
          updateRefreshBtn.addEventListener('click', triggerPageRefresh);
        }

        // Hover color feedback for refresh button (no width expansion)
        (() => {
          const refreshBtn = updateNoticeEl?.querySelector('[data-mood-update-refresh]') as HTMLElement;
          if (!refreshBtn) return;
          const isRefreshLocked = (): boolean => (
            refreshBtn.classList.contains('is-refreshing')
            || refreshBtn.getAttribute('aria-disabled') === 'true'
          );

          refreshBtn.addEventListener('mouseenter', () => {
            if (isRefreshLocked()) {
              return;
            }
            refreshBtn.classList.add('is-hovered');
          });

          refreshBtn.addEventListener('mouseleave', () => {
            if (isRefreshLocked()) {
              return;
            }
            refreshBtn.classList.remove('is-hovered');
          });
        })();

        animatedEmoji.observe(list);
        loadInitial();
      }
    }
}
