import { createAnimatedEmojiManager } from '@/features/mood/client/animated-emoji';
import { createFeedCommentsPopoverController } from '@/features/mood/client/feed-comments-popover';
import { createFeedMediaHydrator } from '@/features/mood/client/feed-media-hydration';
import { createFeedRenderer } from '@/features/mood/client/feed-renderer';
import { createFeedUpdateWatcher } from '@/features/mood/client/feed-update-watcher';
import { initMoodGalleries } from '@/features/mood/client/gallery';
import { createMoodMetaPatcher } from '@/features/mood/client/meta-patcher';
import { hydrateMoodRichText } from '@/features/mood/client/rich-text';
import {
  getMoodFeedAnchorBeforeCursor,
  getMoodFeedAnchorWindowBeforeCursor,
  mergeMoodFeedWindowPosts,
  MOOD_FEED_RETURN_ANCHOR_STORAGE_KEY,
  readMoodFeedAnchorId,
} from '@/features/mood/shared/feed-anchor';
import type {
  ChannelInfo,
  MoodData,
} from '@/features/mood/client/feed-types';

export function initMoodFeedController(): void {
    const loadingEl = document.querySelector('[data-mood-loading]');
    const errorEl = document.querySelector('[data-mood-error]');
    const feedEl = document.querySelector('[data-mood-feed]') as HTMLElement | null;
    const list = document.querySelector('[data-mood-list]') as HTMLElement | null;
    const status = document.querySelector('[data-load-status]');
    const sentinel = document.querySelector('[data-mood-sentinel]');
    const updateNoticeEl = document.querySelector('[data-mood-update-notice]') as HTMLElement | null;
    const updateNoticeTextEl = document.querySelector('[data-mood-update-text]') as HTMLElement | null;
    const updateRefreshBtn = document.querySelector('[data-mood-update-refresh]') as HTMLButtonElement | null;
    const ALWAYS_LOADING = import.meta.env.PUBLIC_DEBUG_ALWAYS_LOADING === 'true';
    const ANCHOR_COMPENSATION_MAX_MS = 2600;
    const ANCHOR_COMPENSATION_MIN_MS = 1000;
    const ANCHOR_COMPENSATION_QUIET_FRAMES = 8;
    const ANCHOR_COMPENSATION_EPSILON = 0.5;
    const RETURN_ANCHOR_MAX_AGE_MS = 5 * 60 * 1000;

    if (loadingEl && errorEl && feedEl && list && status && sentinel) {
      const loadButton = document.querySelector('[data-load-more]') as HTMLButtonElement | null;
      if (ALWAYS_LOADING) {
        loadingEl.classList.remove('is-hidden');
        errorEl.classList.add('is-hidden');
        feedEl.classList.add('is-hidden');
        list.setAttribute('aria-busy', 'true');
      } else {
        let isLoading = false;
        let isLoadingNewer = false;
        let hasMore = true;
        let hasNewer = false;
        let observer: IntersectionObserver;
        let newerObserver: IntersectionObserver | null = null;
        let anchorNewerBaselineY = 0;
        let anchorNewerScrollListenerActive = false;
        let anchorOlderBaselineY = 0;
        let anchorOlderScrollListenerActive = false;
        const initialFeedPageHref = window.location.href;

        const inlineSkeletonConfig = {
          dateWidth: '68px',
          items: [
            { lineWidth: '70%' },
            { lineWidth: '58%' },
          ],
        };

      const getMoodFeedAnchorId = (): string => {
        const configuredAnchorId = feedEl.dataset.moodAnchorId?.trim() ?? '';
        if (configuredAnchorId) return configuredAnchorId;

        return readCurrentUrlAnchorId();
      };

      const readCurrentUrlAnchorId = (): string => {
        try {
          return readMoodFeedAnchorId(new URL(window.location.href));
        } catch {
          return '';
        }
      };

      const formatDateKey = (value: string): string => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      const moodIdSet = new Set<string>();
      let totalCount = 0;
      let newestNumericId = Number.NEGATIVE_INFINITY;
      let newestId = '';
      let fallbackNewestId = '';
      let oldestNumericId = Number.POSITIVE_INFINITY;
      let oldestId = '';
      let fallbackOldestId = '';
      let pendingDateKey: string | null = null;
      let pendingPosts: MoodData[] = [];
      const feedAnchorId = getMoodFeedAnchorId();
      let feedAnchorHandled = !feedAnchorId;
      let feedAnchorRevealInFlight = false;
      hasNewer = Boolean(feedAnchorId);
      const updateWatcher = createFeedUpdateWatcher({
        list,
        updateNoticeEl,
        updateNoticeTextEl,
        updateRefreshBtn,
        isLoading: () => isLoading,
        getTotalCount: () => totalCount,
      });
      const metaPatcher = createMoodMetaPatcher({
        root: feedEl,
        readSource: feedEl.dataset.moodReadSource,
      });
      let metaPatchFrame = 0;

      const patchVisibleMoodMeta = (): void => {
        if (metaPatchFrame) return;
        metaPatchFrame = window.requestAnimationFrame(() => {
          metaPatchFrame = 0;
          void metaPatcher.patchVisible();
        });
      };

      const registerMoodId = (id?: string | null): void => {
        if (!id || moodIdSet.has(id)) return;
        moodIdSet.add(id);
        fallbackNewestId ||= id;
        fallbackOldestId = id;
        const numericId = Number.parseInt(id, 10);
        if (!Number.isNaN(numericId) && numericId > newestNumericId) {
          newestNumericId = numericId;
          newestId = id;
        }
        if (!Number.isNaN(numericId) && numericId < oldestNumericId) {
          oldestNumericId = numericId;
          oldestId = id;
        }
      };

      const getBeforeId = (): string => {
        return oldestId || fallbackOldestId;
      };

      const getAfterId = (): string => {
        return newestId || fallbackNewestId;
      };

      const isMoodIdGreaterThan = (candidate?: string | null, target?: string | null): boolean => {
        const left = candidate?.trim() ?? '';
        const right = target?.trim() ?? '';
        if (!left || !right) return false;

        try {
          return BigInt(left) > BigInt(right);
        } catch {
          return left > right;
        }
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

      const collectUnseenPosts = (posts: MoodData[]): MoodData[] => {
        const ready: MoodData[] = [];
        posts.forEach((post) => {
          if (!post?.id || moodIdSet.has(post.id)) return;
          registerMoodId(post.id);
          ready.push(post);
        });
        return ready;
      };

      const readInitialFeed = (): { posts: MoodData[]; channel?: ChannelInfo } | null => {
        const source = feedEl.querySelector('[data-mood-initial-feed]');
        if (!(source instanceof HTMLScriptElement) || !source.textContent) return null;

        try {
          const parsed = JSON.parse(source.textContent) as { posts?: unknown; channel?: ChannelInfo };
          return {
            posts: Array.isArray(parsed.posts) ? parsed.posts as MoodData[] : [],
            channel: parsed.channel,
          };
        } catch (error) {
          console.error(error);
          return null;
        }
      };

      const fetchMoods = async (
        options: { beforeId?: string; afterId?: string } = {}
      ): Promise<{ posts: MoodData[]; channel?: ChannelInfo }> => {
        const query = new URLSearchParams();
        if (options.beforeId) {
          query.set('before', options.beforeId);
        }
        if (options.afterId) {
          query.set('after', options.afterId);
        }
        const queryString = query.toString();
        const url = queryString ? `/api/moods?${queryString}` : '/api/moods';
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

      const animatedEmoji = createAnimatedEmojiManager();
      const commentsPopover = createFeedCommentsPopoverController(animatedEmoji);
      const mediaHydrator = createFeedMediaHydrator(animatedEmoji);
      let channelInfo: ChannelInfo | null = null;
      const renderer = createFeedRenderer({
        list,
        commentsPopover,
        mediaHydrator,
        getChannelInfo: () => channelInfo,
        formatDateKey,
      });

      const waitForImageToSettle = (image: HTMLImageElement): Promise<void> => {
        if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
          return Promise.resolve();
        }

        return new Promise((resolve) => {
          const finish = (): void => {
            image.removeEventListener('load', finish);
            image.removeEventListener('error', finish);
            resolve();
          };
          image.addEventListener('load', finish, { once: true });
          image.addEventListener('error', finish, { once: true });
        });
      };

      const waitForAnchorPrecedingMedia = async (id: string): Promise<void> => {
        const target = list.querySelector<HTMLElement>(`[data-mood-id="${id}"]`);
        if (!target) return;

        const unsettledImages: HTMLImageElement[] = [];
        const items = Array.from(list.querySelectorAll<HTMLElement>('.mood-item[data-mood-id]'));
        for (const item of items) {
          if (item === target) break;

          item.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
            if (image.height > 0 || image.closest('.mood-gallery')) return;
            if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) return;
            unsettledImages.push(image);
          });
        }

        if (!unsettledImages.length) return;

        await Promise.race([
          Promise.all(unsettledImages.slice(0, 4).map(waitForImageToSettle)),
          new Promise((resolve) => window.setTimeout(resolve, 1200)),
        ]);
      };

      const getMoodAnchorTarget = (id: string): HTMLElement | null => (
        Array.from(list.querySelectorAll<HTMLElement>('[data-mood-id]')).find(
          (item) => item.dataset.moodId === id
        ) ?? null
      );

      const isTargetFullyVisible = (target: HTMLElement): boolean => {
        const rect = target.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      };

      const runOnNextFrame = (callback: () => void): void => {
        let hasRun = false;
        const run = (): void => {
          if (hasRun) return;
          hasRun = true;
          callback();
        };

        window.requestAnimationFrame(run);
        window.setTimeout(run, 50);
      };

      const readStoredReturnAnchorTop = (id: string): number | null => {
        try {
          const raw = window.sessionStorage.getItem(MOOD_FEED_RETURN_ANCHOR_STORAGE_KEY);
          if (!raw) return null;
          const parsed = JSON.parse(raw) as {
            createdAt?: unknown;
            id?: unknown;
            top?: unknown;
          };
          if (parsed.id !== id) return null;
          const createdAt = typeof parsed.createdAt === 'number' ? parsed.createdAt : 0;
          if (!createdAt || Date.now() - createdAt > RETURN_ANCHOR_MAX_AGE_MS) return null;
          const top = typeof parsed.top === 'number' ? parsed.top : Number.NaN;
          return Number.isFinite(top) ? top : null;
        } catch {
          return null;
        }
      };

      const alignAnchorToTop = (id: string, top: number): boolean => {
        const target = getMoodAnchorTarget(id);
        if (!target) return false;
        const delta = target.getBoundingClientRect().top - top;
        if (Math.abs(delta) > ANCHOR_COMPENSATION_EPSILON) {
          window.scrollBy({ top: delta, behavior: 'auto' });
        }
        return true;
      };

      const isScrollIntentKey = (event: KeyboardEvent): boolean => (
        event.key === 'ArrowDown'
        || event.key === 'ArrowUp'
        || event.key === 'End'
        || event.key === 'Home'
        || event.key === 'PageDown'
        || event.key === 'PageUp'
        || event.key === ' '
      );

      const stabilizeAnchorPosition = async (id: string, preferredTop?: number | null): Promise<boolean> => {
        const target = getMoodAnchorTarget(id);
        if (!target) return false;

        const expectedTop = typeof preferredTop === 'number' && Number.isFinite(preferredTop)
          ? preferredTop
          : target.getBoundingClientRect().top;

        return new Promise((resolve) => {
          let frame = 0;
          let timer = 0;
          let quietFrames = 0;
          let stopped = false;
          const startedAt = performance.now();

          const clearScheduledTick = (): void => {
            if (frame) {
              window.cancelAnimationFrame(frame);
              frame = 0;
            }
            if (timer) {
              window.clearTimeout(timer);
              timer = 0;
            }
          };

          const cleanup = (): void => {
            clearScheduledTick();
            window.removeEventListener('wheel', stop);
            window.removeEventListener('touchstart', stop);
            window.removeEventListener('keydown', stopOnScrollKey);
          };

          const finish = (result: boolean): void => {
            if (stopped) return;
            stopped = true;
            cleanup();
            resolve(result);
          };

          const stop = (): void => finish(false);
          const stopOnScrollKey = (event: KeyboardEvent): void => {
            if (isScrollIntentKey(event)) stop();
          };

          const compensate = (): void => {
            const delta = target.getBoundingClientRect().top - expectedTop;
            if (Math.abs(delta) <= ANCHOR_COMPENSATION_EPSILON) {
              quietFrames += 1;
              return;
            }

            quietFrames = 0;
            window.scrollBy({ top: delta, behavior: 'auto' });
          };

          const tick = (now: number): void => {
            if (stopped) return;
            if (!target.isConnected) {
              finish(false);
              return;
            }

            compensate();

            const elapsed = now - startedAt;
            if (
              elapsed >= ANCHOR_COMPENSATION_MAX_MS
              || (
                preferredTop === null
                && elapsed >= ANCHOR_COMPENSATION_MIN_MS
                && quietFrames >= ANCHOR_COMPENSATION_QUIET_FRAMES
              )
            ) {
              finish(true);
              return;
            }

            scheduleTick();
          };

          function scheduleTick(): void {
            clearScheduledTick();
            let hasRun = false;
            const run = (now = performance.now()): void => {
              if (hasRun) return;
              hasRun = true;
              clearScheduledTick();
              tick(now);
            };

            frame = window.requestAnimationFrame(run);
            timer = window.setTimeout(run, 50);
          }

          window.addEventListener('wheel', stop, { passive: true });
          window.addEventListener('touchstart', stop, { passive: true });
          window.addEventListener('keydown', stopOnScrollKey);
          scheduleTick();
        });
      };

      const revealAndStabilizeAnchor = async (
        id: string,
        options: { highlight?: boolean; preferredTop?: number | null } = {}
      ): Promise<boolean> => {
        await waitForAnchorPrecedingMedia(id);
        const preferredTop = options.preferredTop ?? null;
        const target = getMoodAnchorTarget(id);
        if (!target) return false;

        const aligned = typeof preferredTop === 'number'
          ? alignAnchorToTop(id, preferredTop)
          : isTargetFullyVisible(target) || renderer.scrollToMood(id, { behavior: 'auto', highlight: options.highlight });
        if (!aligned) return false;

        await stabilizeAnchorPosition(id, preferredTop);
        return true;
      };

      const revealFeedAnchor = (): void => {
        if (!feedAnchorId || feedAnchorHandled || feedAnchorRevealInFlight) return;

        feedAnchorRevealInFlight = true;
        runOnNextFrame(() => {
          void (async () => {
            if (feedAnchorHandled) {
              feedAnchorRevealInFlight = false;
              return;
            }
            try {
              if (await revealAndStabilizeAnchor(feedAnchorId, { highlight: true }) && !feedAnchorHandled) {
                feedAnchorHandled = true;
                setStatus('');
                runOnNextFrame(() => {
                  armAnchorNewerObserver();
                  armAnchorOlderObserver();
                });
              }
            } finally {
              feedAnchorRevealInFlight = false;
            }
          })();
        });
      };

      const revealCurrentUrlFeedAnchor = (options: { force?: boolean } = {}): void => {
        if (!options.force && window.location.href === initialFeedPageHref) return;
        const currentAnchorId = readCurrentUrlAnchorId();
        if (!currentAnchorId) return;

        const preferredTop = readStoredReturnAnchorTop(currentAnchorId);

        runOnNextFrame(() => {
          void revealAndStabilizeAnchor(currentAnchorId, {
            highlight: preferredTop === null,
            preferredTop,
          });
        });
      };

      const reportMissingFeedAnchor = (): void => {
        if (!feedAnchorId || feedAnchorHandled) return;

        window.setTimeout(() => {
          if (!feedAnchorHandled && !getMoodAnchorTarget(feedAnchorId)) {
            setStatus(`Mood ${feedAnchorId} is not available in this feed.`);
          }
        }, 250);
      };

      const startUpdateWatcher = (): void => {
        if (!feedAnchorId) {
          updateWatcher.start();
        }
      };

      commentsPopover.init();
      const serverRenderedCount = list.querySelectorAll('.mood-item[data-mood-id]').length;
      if (serverRenderedCount > 0) {
        totalCount = serverRenderedCount;
        initMoodGalleries(list);
      }

      const appendMoods = (posts: MoodData[], startIndex = totalCount): void => {
        totalCount = renderer.appendMoods(posts, startIndex);
        if (!feedAnchorId) {
          updateWatcher.syncLatestSeenId();
        }
        hydrateMoodRichText(list);
        patchVisibleMoodMeta();
        revealFeedAnchor();
      };

      const prependMoods = (posts: MoodData[]): void => {
        const previousScrollHeight = document.documentElement.scrollHeight;
        const insertedCount = renderer.prependMoods(posts, 0);
        if (insertedCount <= 0) return;

        totalCount += insertedCount;
        const nextScrollHeight = document.documentElement.scrollHeight;
        const heightDelta = nextScrollHeight - previousScrollHeight;
        if (heightDelta > 0) {
          window.scrollTo({ top: window.scrollY + heightDelta, behavior: 'auto' });
        }
        patchVisibleMoodMeta();
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

      const handleNoMoreNewer = (): void => {
        hasNewer = false;
        if (newerObserver) {
          newerObserver.disconnect();
          newerObserver = null;
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
        revealFeedAnchor();
        reportMissingFeedAnchor();
        patchVisibleMoodMeta();
      };

      const startObserver = (): void => {
        if (!hasMore || observer) return;

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
      };

      function enableAnchorOlderObserverOnScroll(): void {
        if (!anchorOlderScrollListenerActive) return;
        if (window.scrollY < anchorOlderBaselineY + 80) return;

        window.removeEventListener('scroll', enableAnchorOlderObserverOnScroll);
        anchorOlderScrollListenerActive = false;
        startObserver();
      }

      function armAnchorOlderObserver(): void {
        if (!feedAnchorId || !hasMore || observer || anchorOlderScrollListenerActive) return;

        anchorOlderBaselineY = window.scrollY;
        anchorOlderScrollListenerActive = true;
        window.addEventListener('scroll', enableAnchorOlderObserverOnScroll, { passive: true });
      }

      function startNewerObserver(): void {
        if (!feedAnchorId || !hasNewer || newerObserver) return;

        const newerSentinel = document.querySelector('[data-mood-newer-sentinel]');
        if (!newerSentinel) return;

        newerObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                loadNewer();
              }
            });
          },
          {
            rootMargin: '600px 0px 0px',
          }
        );

        newerObserver.observe(newerSentinel);
      }

      function enableAnchorNewerObserverOnScroll(): void {
        if (!anchorNewerScrollListenerActive) return;
        if (window.scrollY > Math.max(0, anchorNewerBaselineY - 80)) return;

        window.removeEventListener('scroll', enableAnchorNewerObserverOnScroll);
        anchorNewerScrollListenerActive = false;
        startNewerObserver();
      }

      function armAnchorNewerObserver(): void {
        if (!feedAnchorId || !hasNewer || newerObserver || anchorNewerScrollListenerActive) return;

        anchorNewerBaselineY = window.scrollY;
        anchorNewerScrollListenerActive = true;
        window.addEventListener('scroll', enableAnchorNewerObserverOnScroll, { passive: true });
      }

      const loadAnchorWindow = async (): Promise<{ posts: MoodData[]; channel?: ChannelInfo }> => {
        const windowBeforeId = getMoodFeedAnchorWindowBeforeCursor(feedAnchorId);
        const beforeId = getMoodFeedAnchorBeforeCursor(feedAnchorId);
        const emptyFeed: { posts: MoodData[]; channel?: ChannelInfo } = { posts: [] };
        const focused = windowBeforeId
          ? await fetchMoods({ beforeId: windowBeforeId })
          : emptyFeed;
        const focusedPosts = Array.isArray(focused.posts) ? focused.posts : [];
        if (focusedPosts.some((post) => post.id === feedAnchorId)) {
          return { posts: focusedPosts, channel: focused.channel };
        }

        const fallback = (
          beforeId
          && beforeId !== windowBeforeId
        )
          ? await fetchMoods({ beforeId })
          : emptyFeed;
        const fallbackPosts = Array.isArray(fallback.posts) ? fallback.posts : [];
        if (fallbackPosts.length > 0) {
          return { posts: fallbackPosts, channel: fallback.channel ?? focused.channel };
        }

        return {
          posts: mergeMoodFeedWindowPosts(focusedPosts),
          channel: focused.channel,
        };
      };

      const loadInitial = async (): Promise<void> => {
        try {
          const initialFeed = readInitialFeed();
          if (initialFeed) {
            const posts = Array.isArray(initialFeed.posts) ? initialFeed.posts : [];
            if (initialFeed.channel) {
              channelInfo = initialFeed.channel;
              mediaHydrator.hydrateHero(channelInfo);
            }

            const ready = stagePostsForRender(posts);
            if (ready.length) {
              appendMoods(ready, totalCount);
            }

            showFeed();
            startUpdateWatcher();

            if (!posts.length) {
              handleNoMore();
              setStatus('No moods yet.');
              return;
            }

            if (!feedAnchorId) {
              startObserver();
            }
            return;
          }

          if (feedAnchorId) {
            const data = await loadAnchorWindow();
            const posts = Array.isArray(data.posts) ? data.posts : [];
            if (data.channel) {
              channelInfo = data.channel;
              mediaHydrator.hydrateHero(channelInfo);
            }

            if (!posts.length) {
              showFeed();
              handleNoMore();
              setStatus(`Mood ${feedAnchorId} is not available in this feed.`);
              return;
            }

            const ready = collectUnseenPosts(posts);
            if (ready.length) {
              appendMoods(ready, totalCount);
            }

            showFeed();
            if (!feedAnchorId) {
              startObserver();
            }
            return;
          }

          let ready: MoodData[] = [];
          let beforeId = '';
          let lastBefore = '';
          while (hasMore && ready.length === 0) {
            const data = await fetchMoods(beforeId ? { beforeId } : {});
            const posts = Array.isArray(data.posts) ? data.posts : [];
            if (data.channel && !channelInfo) {
              channelInfo = data.channel;
              mediaHydrator.hydrateHero(channelInfo);
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

          startObserver();
        } catch (error) {
          console.error(error);
          showError();
        }
      };

      const loadNewer = async (): Promise<void> => {
        if (isLoadingNewer || !hasNewer) {
          return;
        }

        const currentNewestId = getAfterId();
        const beforeId = getMoodFeedAnchorWindowBeforeCursor(currentNewestId);
        if (!currentNewestId || !beforeId) {
          handleNoMoreNewer();
          return;
        }

        isLoadingNewer = true;

        try {
          const data = await fetchMoods({ beforeId });
          const posts = Array.isArray(data.posts)
            ? data.posts.filter((post) => isMoodIdGreaterThan(post.id, currentNewestId))
            : [];
          if (data.channel) {
            channelInfo = data.channel;
          }
          if (!posts.length) {
            handleNoMoreNewer();
            return;
          }

          const ready = collectUnseenPosts(posts);
          if (!ready.length) {
            handleNoMoreNewer();
            return;
          }

          prependMoods(ready);
        } catch (error) {
          console.error(error);
        } finally {
          isLoadingNewer = false;
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
            const data = await fetchMoods({ beforeId });
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

        if (!feedAnchorId) {
          updateWatcher.init();
        }
        const scheduleCurrentUrlFeedAnchorReveal = (): void => {
          runOnNextFrame(() => {
            revealCurrentUrlFeedAnchor({ force: true });
          });
        };
        const scheduleStoredReturnAnchorReveal = (): void => {
          runOnNextFrame(() => {
            const currentAnchorId = readCurrentUrlAnchorId();
            if (!currentAnchorId || readStoredReturnAnchorTop(currentAnchorId) === null) return;
            revealCurrentUrlFeedAnchor({ force: true });
          });
        };

        window.addEventListener('pageshow', () => {
          scheduleCurrentUrlFeedAnchorReveal();
          patchVisibleMoodMeta();
        });
        window.addEventListener('popstate', scheduleCurrentUrlFeedAnchorReveal);
        window.addEventListener('hashchange', scheduleCurrentUrlFeedAnchorReveal);
        window.addEventListener('scroll', patchVisibleMoodMeta, { passive: true });
        renderer.bindInteractions();
        animatedEmoji.observe(list);
        hydrateMoodRichText(list);
        void loadInitial().then(scheduleStoredReturnAnchorReveal);
      }
    }
}
