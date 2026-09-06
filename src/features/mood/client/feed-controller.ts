import { createAnimatedEmojiManager } from '@/features/mood/client/animated-emoji';
import { createFeedCommentsPopoverController } from '@/features/mood/client/feed-comments-popover';
import { createFeedMediaHydrator } from '@/features/mood/client/feed-media-hydration';
import { createFeedRenderer } from '@/features/mood/client/feed-renderer';
import { createFeedUpdateWatcher } from '@/features/mood/client/feed-update-watcher';
import { initMoodGalleries } from '@/features/mood/client/gallery';
import { createMoodMetaPatcher } from '@/features/mood/client/meta-patcher';
import { hydrateMoodRichText } from '@/features/mood/client/rich-text';
import { pageScroll } from '@/lib/page-scroll';
import { formatMoodDateKey, rekeyMoodServerRenderedGroups } from '@/features/mood/shared/date-grouping';
import {
  getMoodFeedAnchorBeforeCursor,
  getMoodFeedAnchorWindowBeforeCursor,
  getMoodFeedPostIds,
  mergeMoodFeedWindowPosts,
  MOOD_FEED_RETURN_ANCHOR_STORAGE_KEY,
  moodFeedElementHasId,
  moodFeedPostHasId,
  readMoodFeedAnchorId,
} from '@/features/mood/shared/feed-anchor';
import type {
  ChannelInfo,
  MoodData,
} from '@/features/mood/client/feed-types';

// Listening cards and YouTube embeds are rare in the feed. Their controllers
// (plus the MusicKit player behind the listening one) load only when matching
// markup is actually in the tree, instead of shipping in the startup bundle.
// Their stylesheets cannot ride along as CSS imports here — Astro hoists any
// CSS reachable from a page script into <head> unconditionally — so the feed
// element carries the built asset URLs and this injects a <link> on demand.
function ensureStylesheet(href: string | undefined): void {
  if (!href) return;
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]');
  for (const link of links) {
    if (link.getAttribute('href') === href) return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function hydrateFeedEmbeds(root: HTMLElement): void {
  const feed = root.closest<HTMLElement>('[data-mood-feed]');
  if (root.querySelector('[data-listening]')) {
    ensureStylesheet(feed?.dataset.listeningCss);
    void import('@/lib/listening/controller').then(({ initListeningCards }) => {
      initListeningCards(root);
    });
  }
  if (root.querySelector('[data-yt]')) {
    ensureStylesheet(feed?.dataset.embedYoutubeCss);
    void import('@/lib/embed/youtube-controller').then(({ initYouTubeEmbeds }) => {
      initYouTubeEmbeds(root);
    });
  }
}

const MOOD_FETCH_ATTEMPTS = 2;
const MOOD_FETCH_RETRY_DELAY_MS = 200;
const RETRYABLE_MOOD_FETCH_STATUSES = new Set([408, 425, 500, 502, 503, 504]);
// A flick on iPad covers several thousand pixels while a page is still on the
// wire, so the next page has to start well before the last one is in view.
const FEED_PREFETCH_MARGIN_PX = 2400;

export function initMoodFeedController(): void {
    const scroll = pageScroll();
    const loadingEl = document.querySelector('[data-mood-loading]');
    const errorEl = document.querySelector('[data-mood-error]');
    const feedEl = document.querySelector('[data-mood-feed]') as HTMLElement | null;
    const list = document.querySelector('[data-mood-list]') as HTMLElement | null;
    const status = document.querySelector('[data-load-status]');
    const sentinel = document.querySelector('[data-mood-sentinel]');
    const updateNoticeEl = document.querySelector('[data-mood-update-notice]') as HTMLElement | null;
    const updateNoticeTextEl = document.querySelector('[data-mood-update-text]') as HTMLElement | null;
    const updateRefreshBtn = document.querySelector('[data-mood-update-refresh]') as HTMLButtonElement | null;
    const loadRetryButton = document.querySelector('[data-mood-load-retry]') as HTMLButtonElement | null;
    const newerStatus = document.querySelector('[data-mood-newer-status]');
    const newerRetryButton = document.querySelector('[data-mood-newer-retry]') as HTMLButtonElement | null;
    const initialRetryButton = document.querySelector('[data-mood-initial-retry]') as HTMLButtonElement | null;
    const ALWAYS_LOADING = import.meta.env.PUBLIC_DEBUG_ALWAYS_LOADING === 'true';
    const ANCHOR_COMPENSATION_MAX_MS = 2600;
    const ANCHOR_COMPENSATION_EPSILON = 1;
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
        let loadMoreQueued = false;
        let isLoadingNewer = false;
        let hasMore = true;
        let hasNewer = false;
        let observer: IntersectionObserver | null = null;
        let newerObserver: IntersectionObserver | null = null;
        let anchorNewerBaselineY = 0;
        let anchorNewerScrollListenerActive = false;
        let anchorNewerTouchStartY: number | null = null;
        let anchorOlderBaselineY = 0;
        let anchorOlderScrollListenerActive = false;
        let anchorOlderTouchStartY: number | null = null;
        const initialFeedPageHref = window.location.href;

        const inlineSkeletonConfig = {
          dateWidth: '68px',
          items: [
            { lineWidth: '70%' },
            { lineWidth: '58%' },
          ],
        };

      const getMoodFeedAnchorId = (): string => {
        const currentUrlAnchorId = readCurrentUrlAnchorId();
        if (currentUrlAnchorId) return currentUrlAnchorId;

        const configuredAnchorId = feedEl.dataset.moodAnchorId?.trim() ?? '';
        if (configuredAnchorId) return configuredAnchorId;

        return '';
      };

      const readCurrentUrlAnchorId = (): string => {
        try {
          return readMoodFeedAnchorId(new URL(window.location.href));
        } catch {
          return '';
        }
      };

      const formatDateKey = (value: string): string => formatMoodDateKey(value);
      const moodIdSet = new Set<string>();
      let totalCount = 0;
      let newestNumericId = Number.NEGATIVE_INFINITY;
      let newestId = '';
      let fallbackNewestId = '';
      let oldestNumericId = Number.POSITIVE_INFINITY;
      let oldestId = '';
      let fallbackOldestId = '';
      // Tag mode: plain filtered feed. No anchors, and the update watcher stays
      // off (its probe checks channel-latest, meaningless under a tag filter).
      const feedTagFilter = feedEl.dataset.moodTag?.trim() ?? '';
      const feedAnchorId = feedTagFilter ? '' : getMoodFeedAnchorId();
      let feedAnchorHandled = !feedAnchorId;
      let feedAnchorRevealInFlight = false;
      type AnchorPaginationDirection = 'newer' | 'older';
      type AnchorIntentCapture = {
        direction: AnchorPaginationDirection | null;
      };
      const consumePendingAnchorIntent = (): AnchorPaginationDirection | null => {
        const browserWindow = window as typeof window & {
          __moodAnchorIntentCapture?: AnchorIntentCapture;
        };
        const capture = browserWindow.__moodAnchorIntentCapture;
        if (!capture) return null;

        const direction = capture.direction;
        capture.direction = null;
        return direction;
      };
      hasNewer = Boolean(feedAnchorId);
      const updateWatcher = createFeedUpdateWatcher({
        list,
        updateNoticeEl,
        updateNoticeTextEl,
        updateRefreshBtn,
        isLoading: () => isLoading,
        getTotalCount: () => totalCount,
        readSource: feedEl.dataset.moodReadSource,
      });
      const metaPatcher = createMoodMetaPatcher({
        root: feedEl,
        readSource: feedEl.dataset.moodReadSource,
      });
      let metaPatchFrame = 0;

      const patchVisibleMoodMeta = (): void => {
        // An anchored window is hydrated in one batch before its first visible
        // positioning. Starting a viewport-only request here would race that
        // batch and let card heights change after Safari begins scrolling.
        if (feedAnchorId && !feedAnchorHandled) return;
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

      const registerMoodPost = (post: Pick<MoodData, 'id' | 'groupIds'>): void => {
        getMoodFeedPostIds(post).forEach(registerMoodId);
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

      const collectUnseenPosts = (posts: MoodData[]): MoodData[] => {
        const ready: MoodData[] = [];
        posts.forEach((post) => {
          const ids = getMoodFeedPostIds(post);
          if (!ids.length || ids.some((id) => moodIdSet.has(id))) return;
          registerMoodPost(post);
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
        if (feedTagFilter) {
          query.set('tag', feedTagFilter);
        }
        // Tag filtering only exists on the archive route; tag mode always SSRs
        // with readSource=archive, so both flags agree here.
        const archiveRead = feedEl.dataset.moodReadSource === 'archive' || Boolean(feedTagFilter);
        if (archiveRead) {
          query.set('fallback', '0');
        }
        const queryString = query.toString();
        // Archive reads degrade to the live mirror once /api/v2/mood exhausts
        // its retries. Tag filters only exist on the archive route, so they
        // stay strict.
        const endpoints = archiveRead
          ? (feedTagFilter ? ['/api/v2/mood'] : ['/api/v2/mood', '/api/moods'])
          : ['/api/moods'];
        let lastError: unknown = new Error('Failed to load moods.');

        for (const endpoint of endpoints) {
          const url = queryString ? `${endpoint}?${queryString}` : endpoint;
          if (endpoint !== endpoints[0]) {
            console.warn(`Mood feed degraded to ${endpoint}.`, lastError);
          }
          for (let attempt = 0; attempt < MOOD_FETCH_ATTEMPTS; attempt += 1) {
            let response: Response;
            try {
              response = await fetch(url);
            } catch (error) {
              lastError = error;
              if (attempt + 1 >= MOOD_FETCH_ATTEMPTS) break;
              await new Promise((resolve) => window.setTimeout(resolve, MOOD_FETCH_RETRY_DELAY_MS));
              continue;
            }

            if (response.ok) {
              try {
                const payload = await response.json() as { posts: MoodData[]; channel?: ChannelInfo };
                feedEl.dataset.moodFeedSource = endpoint === '/api/moods' ? 'live' : 'archive';
                return payload;
              } catch (error) {
                lastError = error;
                if (attempt + 1 >= MOOD_FETCH_ATTEMPTS) break;
                await new Promise((resolve) => window.setTimeout(resolve, MOOD_FETCH_RETRY_DELAY_MS));
                continue;
              }
            }

            lastError = new Error(`Failed to load moods (${response.status}).`);
            if (!RETRYABLE_MOOD_FETCH_STATUSES.has(response.status)) {
              throw lastError;
            }
            if (attempt + 1 < MOOD_FETCH_ATTEMPTS) {
              await new Promise((resolve) => window.setTimeout(resolve, MOOD_FETCH_RETRY_DELAY_MS));
            }
          }
        }

        throw lastError;
      };

      const setStatus = (message: string): void => {
        status.textContent = message;
      };

      const setLoadRetryVisible = (visible: boolean): void => {
        if (loadRetryButton) loadRetryButton.hidden = !visible;
      };

      const setNewerStatus = (message: string): void => {
        if (newerStatus) newerStatus.textContent = message;
      };

      const setNewerRetryVisible = (visible: boolean): void => {
        if (newerRetryButton) newerRetryButton.hidden = !visible;
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

        // An anchored feed carries a second .mood-load-controls above the
        // stream for the newer end, and it matches first. Pinning to the older
        // controls keeps this skeleton under the last item, where the reader
        // scrolling down is actually looking.
        const controls = feedEl.querySelector('.mood-load-controls:not(.mood-load-controls--newer)');
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
        const target = getMoodAnchorTarget(id);
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
          (item) => moodFeedElementHasId(item, id)
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
          scroll.el.scrollBy({ top: delta, behavior: 'auto' });
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

      const isDownwardScrollIntentKey = (event: KeyboardEvent): boolean => (
        event.key === 'ArrowDown'
        || event.key === 'End'
        || event.key === 'PageDown'
        || (event.key === ' ' && !event.shiftKey)
      );

      const isUpwardScrollIntentKey = (event: KeyboardEvent): boolean => (
        event.key === 'ArrowUp'
        || event.key === 'Home'
        || event.key === 'PageUp'
        || (event.key === ' ' && event.shiftKey)
      );

      const stabilizeReturnedAnchorPosition = (id: string, top: number): Promise<boolean> => {
        const target = getMoodAnchorTarget(id);
        if (!target) return Promise.resolve(false);

        return new Promise((resolve) => {
          let maxTimer = 0;
          let stopped = false;

          const cleanup = (): void => {
            window.clearTimeout(maxTimer);
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            window.removeEventListener('touchstart', stop);
            window.removeEventListener('wheel', stop);
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
          const correct = (): void => {
            if (!target.isConnected) {
              finish(false);
              return;
            }
            alignAnchorToTop(id, top);
          };
          // ResizeObserver and MutationObserver run only when layout or content
          // actually changes. Correcting at those boundaries preserves a saved
          // return position without the old every-frame feedback loop.
          const resizeObserver = new ResizeObserver(correct);
          const mutationObserver = new MutationObserver(correct);

          resizeObserver.observe(list);
          mutationObserver.observe(list, { childList: true, subtree: true });
          window.addEventListener('touchstart', stop, { passive: true });
          window.addEventListener('wheel', stop, { passive: true });
          window.addEventListener('keydown', stopOnScrollKey);
          maxTimer = window.setTimeout(() => {
            correct();
            finish(true);
          }, ANCHOR_COMPENSATION_MAX_MS);
        });
      };

      const revealAndStabilizeAnchor = async (
        id: string,
        options: { highlight?: boolean; preferredTop?: number | null } = {}
      ): Promise<boolean> => {
        if (!getMoodAnchorTarget(id)) return false;

        let interrupted = false;
        const interrupt = (): void => {
          interrupted = true;
        };
        const interruptOnScrollKey = (event: KeyboardEvent): void => {
          if (isScrollIntentKey(event)) interrupt();
        };
        const cleanup = (): void => {
          window.removeEventListener('wheel', interrupt);
          window.removeEventListener('touchstart', interrupt);
          window.removeEventListener('keydown', interruptOnScrollKey);
        };

        window.addEventListener('wheel', interrupt, { passive: true });
        window.addEventListener('touchstart', interrupt, { passive: true });
        window.addEventListener('keydown', interruptOnScrollKey);

        try {
          await waitForAnchorPrecedingMedia(id);
          if (interrupted) return true;

          const preferredTop = options.preferredTop ?? null;
          const ids = Array.from(list.querySelectorAll<HTMLElement>('[data-mood-id]'))
            .map((item) => item.dataset.moodId?.trim() ?? '')
            .filter(Boolean);
          await metaPatcher.patch(ids);
          await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
          });
          if (interrupted) return true;

          const target = getMoodAnchorTarget(id);
          if (!target) return false;

          const aligned = typeof preferredTop === 'number'
            ? alignAnchorToTop(id, preferredTop)
            : isTargetFullyVisible(target) || renderer.scrollToMood(id, { behavior: 'auto', highlight: options.highlight });
          if (!aligned) return false;

          if (typeof preferredTop === 'number') {
            await stabilizeReturnedAnchorPosition(id, preferredTop);
          }
          return true;
        } finally {
          cleanup();
        }
      };

      const revealFeedAnchor = (): void => {
        if (!feedAnchorId || feedAnchorHandled || feedAnchorRevealInFlight) return;

        feedAnchorRevealInFlight = true;
        const preferredTop = readStoredReturnAnchorTop(feedAnchorId);
        armAnchorNewerObserver({ trackScroll: false });
        armAnchorOlderObserver({ trackScroll: false });
        runOnNextFrame(() => {
          const pendingIntent = consumePendingAnchorIntent();
          if (applyAnchorPaginationIntent(pendingIntent)) {
            feedAnchorHandled = true;
            feedAnchorRevealInFlight = false;
            setStatus('');
            return;
          }

          void (async () => {
            if (feedAnchorHandled) {
              feedAnchorRevealInFlight = false;
              return;
            }
            try {
              if (await revealAndStabilizeAnchor(feedAnchorId, {
                highlight: preferredTop === null,
                preferredTop,
              }) && !feedAnchorHandled) {
                feedAnchorHandled = true;
                setStatus('');
                runOnNextFrame(() => {
                  trackAnchorNewerObserverScroll();
                  trackAnchorOlderObserverScroll();
                });
              }
            } finally {
              feedAnchorRevealInFlight = false;
            }
          })();
        });
      };

      const resetAnchorPaginationObservers = (): void => {
        observer?.disconnect();
        observer = null;
        newerObserver?.disconnect();
        newerObserver = null;
        clearAnchorOlderObserverGate();
        clearAnchorNewerObserverGate();
      };

      const revealCurrentUrlFeedAnchor = (
        options: { force?: boolean; trackPagination?: boolean } = {}
      ): void => {
        if (!options.force && window.location.href === initialFeedPageHref) return;
        const currentAnchorId = readCurrentUrlAnchorId();
        if (!currentAnchorId) return;

        const preferredTop = readStoredReturnAnchorTop(currentAnchorId);

        runOnNextFrame(() => {
          void (async () => {
            const handled = await revealAndStabilizeAnchor(currentAnchorId, {
              highlight: preferredTop === null,
              preferredTop,
            });
            if (handled && options.trackPagination) {
              runOnNextFrame(() => {
                trackAnchorNewerObserverScroll();
                trackAnchorOlderObserverScroll();
              });
            }
          })();
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
        if (!feedAnchorId && !feedTagFilter) {
          updateWatcher.start();
        }
      };

      commentsPopover.init();
      const serverRenderedCount = list.querySelectorAll('.mood-item[data-mood-id]').length;
      if (serverRenderedCount > 0) {
        totalCount = serverRenderedCount;
        // SSR grouped posts by UTC day; regroup them under the visitor's local
        // timezone so per-post times read local and later client appends merge
        // into the same date groups. Runs before any append or anchor reveal.
        rekeyMoodServerRenderedGroups(list);
        // The SSR list ships visibility:hidden until the inline pre-paint
        // script reveals it; keep the feed usable if that script was stripped.
        list.style.removeProperty('visibility');
        mediaHydrator.applyMediaHints(list);
        initMoodGalleries(list);
        hydrateFeedEmbeds(list);
      }

      const appendMoods = (posts: MoodData[], startIndex = totalCount): void => {
        totalCount = renderer.appendMoods(posts, startIndex);
        if (!feedAnchorId) {
          updateWatcher.syncLatestSeenId();
        }
        hydrateMoodRichText(list);
        hydrateFeedEmbeds(list);
        patchVisibleMoodMeta();
        revealFeedAnchor();
      };

      const prependMoods = (posts: MoodData[]): void => {
        const previousScrollHeight = scroll.el.scrollHeight;
        const insertedCount = renderer.prependMoods(posts, 0);
        if (insertedCount <= 0) return;

        totalCount += insertedCount;
        const nextScrollHeight = scroll.el.scrollHeight;
        const heightDelta = nextScrollHeight - previousScrollHeight;
        if (heightDelta > 0) {
          scroll.el.scrollTo({ top: scroll.el.scrollTop + heightDelta, behavior: 'auto' });
        }
        hydrateFeedEmbeds(list);
        patchVisibleMoodMeta();
      };

      const handleNoMore = (): void => {
        hasMore = false;
        setLoadRetryVisible(false);
        clearAnchorOlderObserverGate();
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
        clearAnchorNewerObserverGate();
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
            rootMargin: `${FEED_PREFETCH_MARGIN_PX}px 0px`,
          }
        );

        observer.observe(sentinel);
      };

      function clearAnchorOlderObserverGate(): void {
        scroll.events.removeEventListener('scroll', enableAnchorOlderObserverOnScroll);
        window.removeEventListener('wheel', enableAnchorOlderObserverOnWheel);
        window.removeEventListener('keydown', enableAnchorOlderObserverOnKeydown);
        window.removeEventListener('touchstart', rememberAnchorOlderTouchStart);
        window.removeEventListener('touchmove', enableAnchorOlderObserverOnTouchMove);
        anchorOlderScrollListenerActive = false;
        anchorOlderTouchStartY = null;
      }

      const isSentinelNear = (): boolean => {
        const rect = sentinel.getBoundingClientRect();
        return rect.top <= window.innerHeight + FEED_PREFETCH_MARGIN_PX
          && rect.bottom >= -FEED_PREFETCH_MARGIN_PX;
      };

      function openAnchorOlderObserverGate(): void {
        if (!anchorOlderScrollListenerActive) return;
        clearAnchorOlderObserverGate();
        startObserver();
        if (isSentinelNear()) void loadMore();
      }

      function applyAnchorPaginationIntent(
        direction: AnchorPaginationDirection | null
      ): boolean {
        if (!direction) return false;

        if (direction === 'newer') {
          openAnchorNewerObserverGate();
          void loadNewer();
        } else {
          openAnchorOlderObserverGate();
          void loadMore();
        }
        return true;
      }

      function enableAnchorOlderObserverOnScroll(): void {
        if (!anchorOlderScrollListenerActive) return;
        if (scroll.el.scrollTop < anchorOlderBaselineY + 80) return;

        openAnchorOlderObserverGate();
      }

      function enableAnchorOlderObserverOnWheel(event: WheelEvent): void {
        if (event.deltaY > 0) openAnchorOlderObserverGate();
      }

      function enableAnchorOlderObserverOnKeydown(event: KeyboardEvent): void {
        if (isDownwardScrollIntentKey(event)) openAnchorOlderObserverGate();
      }

      function rememberAnchorOlderTouchStart(event: TouchEvent): void {
        anchorOlderTouchStartY = event.touches.item(0)?.clientY ?? null;
      }

      function enableAnchorOlderObserverOnTouchMove(event: TouchEvent): void {
        const currentY = event.touches.item(0)?.clientY;
        if (anchorOlderTouchStartY === null || currentY === undefined) return;
        if (anchorOlderTouchStartY - currentY >= 12) openAnchorOlderObserverGate();
      }

      function trackAnchorOlderObserverScroll(): void {
        if (!anchorOlderScrollListenerActive) return;
        anchorOlderBaselineY = scroll.el.scrollTop;
        scroll.events.addEventListener('scroll', enableAnchorOlderObserverOnScroll, { passive: true });
      }

      function armAnchorOlderObserver(options: { trackScroll?: boolean } = {}): void {
        if (!feedAnchorId || !hasMore || observer || anchorOlderScrollListenerActive) return;

        anchorOlderBaselineY = scroll.el.scrollTop;
        anchorOlderScrollListenerActive = true;
        if (options.trackScroll !== false) {
          scroll.events.addEventListener('scroll', enableAnchorOlderObserverOnScroll, { passive: true });
        }
        window.addEventListener('wheel', enableAnchorOlderObserverOnWheel, { passive: true });
        window.addEventListener('keydown', enableAnchorOlderObserverOnKeydown);
        window.addEventListener('touchstart', rememberAnchorOlderTouchStart, { passive: true });
        window.addEventListener('touchmove', enableAnchorOlderObserverOnTouchMove, { passive: true });
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
            rootMargin: `${FEED_PREFETCH_MARGIN_PX}px 0px 0px`,
          }
        );

        newerObserver.observe(newerSentinel);
      }

      function clearAnchorNewerObserverGate(): void {
        scroll.events.removeEventListener('scroll', enableAnchorNewerObserverOnScroll);
        window.removeEventListener('wheel', enableAnchorNewerObserverOnWheel);
        window.removeEventListener('keydown', enableAnchorNewerObserverOnKeydown);
        window.removeEventListener('touchstart', rememberAnchorNewerTouchStart);
        window.removeEventListener('touchmove', enableAnchorNewerObserverOnTouchMove);
        anchorNewerScrollListenerActive = false;
        anchorNewerTouchStartY = null;
      }

      function openAnchorNewerObserverGate(): void {
        if (!anchorNewerScrollListenerActive) return;
        clearAnchorNewerObserverGate();
        startNewerObserver();
        const newerSentinel = document.querySelector('[data-mood-newer-sentinel]');
        if (!newerSentinel) return;

        const sentinelRect = newerSentinel.getBoundingClientRect();
        if (
          sentinelRect.top <= window.innerHeight
          && sentinelRect.bottom >= -FEED_PREFETCH_MARGIN_PX
        ) {
          void loadNewer();
        }
      }

      function enableAnchorNewerObserverOnScroll(): void {
        if (!anchorNewerScrollListenerActive) return;
        if (scroll.el.scrollTop > Math.max(0, anchorNewerBaselineY - 80)) return;

        openAnchorNewerObserverGate();
      }

      function enableAnchorNewerObserverOnWheel(event: WheelEvent): void {
        if (event.deltaY < 0) openAnchorNewerObserverGate();
      }

      function enableAnchorNewerObserverOnKeydown(event: KeyboardEvent): void {
        if (isUpwardScrollIntentKey(event)) openAnchorNewerObserverGate();
      }

      function rememberAnchorNewerTouchStart(event: TouchEvent): void {
        anchorNewerTouchStartY = event.touches.item(0)?.clientY ?? null;
      }

      function enableAnchorNewerObserverOnTouchMove(event: TouchEvent): void {
        const currentY = event.touches.item(0)?.clientY;
        if (anchorNewerTouchStartY === null || currentY === undefined) return;
        if (currentY - anchorNewerTouchStartY >= 12) openAnchorNewerObserverGate();
      }

      function trackAnchorNewerObserverScroll(): void {
        if (!anchorNewerScrollListenerActive) return;
        anchorNewerBaselineY = scroll.el.scrollTop;
        scroll.events.addEventListener('scroll', enableAnchorNewerObserverOnScroll, { passive: true });
      }

      function armAnchorNewerObserver(options: { trackScroll?: boolean } = {}): void {
        if (!feedAnchorId || !hasNewer || newerObserver || anchorNewerScrollListenerActive) return;

        anchorNewerBaselineY = scroll.el.scrollTop;
        anchorNewerScrollListenerActive = true;
        if (options.trackScroll !== false) {
          scroll.events.addEventListener('scroll', enableAnchorNewerObserverOnScroll, { passive: true });
        }
        window.addEventListener('wheel', enableAnchorNewerObserverOnWheel, { passive: true });
        window.addEventListener('keydown', enableAnchorNewerObserverOnKeydown);
        window.addEventListener('touchstart', rememberAnchorNewerTouchStart, { passive: true });
        window.addEventListener('touchmove', enableAnchorNewerObserverOnTouchMove, { passive: true });
      }

      const loadAnchorWindow = async (): Promise<{ posts: MoodData[]; channel?: ChannelInfo }> => {
        const windowBeforeId = getMoodFeedAnchorWindowBeforeCursor(feedAnchorId);
        const beforeId = getMoodFeedAnchorBeforeCursor(feedAnchorId);
        const emptyFeed: { posts: MoodData[]; channel?: ChannelInfo } = { posts: [] };
        const focused = windowBeforeId
          ? await fetchMoods({ beforeId: windowBeforeId })
          : emptyFeed;
        const focusedPosts = Array.isArray(focused.posts) ? focused.posts : [];
        if (focusedPosts.some((post) => moodFeedPostHasId(post, feedAnchorId))) {
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

            const ready = collectUnseenPosts(posts);
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

          const data = await fetchMoods();
          const posts = Array.isArray(data.posts) ? data.posts : [];
          if (data.channel && !channelInfo) {
            channelInfo = data.channel;
            mediaHydrator.hydrateHero(channelInfo);
          }
          if (!posts.length) {
            showFeed();
            handleNoMore();
            setStatus('No moods yet.');
            startUpdateWatcher();
            return;
          }

          const ready = collectUnseenPosts(posts);
          if (ready.length) {
            appendMoods(ready, totalCount);
          }
          showFeed();
          startUpdateWatcher();

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
        if (!currentNewestId) {
          handleNoMoreNewer();
          return;
        }

        isLoadingNewer = true;
        setNewerStatus('');
        setNewerRetryVisible(false);

        try {
          const data = await fetchMoods({ afterId: currentNewestId });
          const posts = Array.isArray(data.posts)
            ? data.posts.filter((post) => (
                getMoodFeedPostIds(post).some((id) => isMoodIdGreaterThan(id, currentNewestId))
              ))
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
          setNewerStatus('Unable to load newer moods.');
          setNewerRetryVisible(true);
        } finally {
          isLoadingNewer = false;
        }
      };

      const loadMore = async (): Promise<void> => {
        if (!hasMore) return;
        if (isLoading) {
          // The sentinel observer only fires on a transition. A request that
          // arrives while a page is in flight would otherwise be lost, and a
          // fast flick would sit at the end of the feed with nothing loading
          // until the reader scrolled away and back.
          loadMoreQueued = true;
          return;
        }

        const beforeId = getBeforeId();
        if (!beforeId) {
          handleNoMore();
          return;
        }

        isLoading = true;
        setStatus('');
        setLoadRetryVisible(false);
        setLoadingState(true);
        showInlineLoading();

        try {
          const data = await fetchMoods({ beforeId });
          const posts = Array.isArray(data.posts) ? data.posts : [];
          if (data.channel) {
            channelInfo = data.channel;
          }
          if (!posts.length) {
            handleNoMore();
            return;
          }

          const ready = collectUnseenPosts(posts);
          if (ready.length) {
            appendMoods(ready, totalCount);
            setStatus('');
          }

          if (!ready.length) {
            handleNoMore();
          }
        } catch (error) {
          console.error(error);
          setStatus('Unable to load more moods.');
          setLoadRetryVisible(true);
        } finally {
          isLoading = false;
          setLoadingState(false);
          hideInlineLoading();
          if (loadMoreQueued) {
            loadMoreQueued = false;
            if (hasMore && isSentinelNear()) void loadMore();
          }
        }
      };

        if (loadButton) {
          loadButton.addEventListener('click', loadMore);
        }
        loadRetryButton?.addEventListener('click', loadMore);
        newerRetryButton?.addEventListener('click', loadNewer);
        initialRetryButton?.addEventListener('click', () => window.location.reload());

        if (!feedAnchorId && !feedTagFilter) {
          updateWatcher.init();
        }
        const scheduleCurrentUrlFeedAnchorReveal = (
          options: { trackPagination?: boolean } = {}
        ): void => {
          runOnNextFrame(() => {
            revealCurrentUrlFeedAnchor({ force: true, ...options });
          });
        };

        window.addEventListener('pageshow', (event) => {
          if (event.persisted) {
            resetAnchorPaginationObservers();
            armAnchorNewerObserver({ trackScroll: false });
            armAnchorOlderObserver({ trackScroll: false });
            updateWatcher.resume();
            if (!applyAnchorPaginationIntent(consumePendingAnchorIntent())) {
              scheduleCurrentUrlFeedAnchorReveal({ trackPagination: true });
            }
          }
          patchVisibleMoodMeta();
        });
        window.addEventListener('popstate', () => scheduleCurrentUrlFeedAnchorReveal());
        window.addEventListener('hashchange', () => scheduleCurrentUrlFeedAnchorReveal());
        scroll.events.addEventListener('scroll', patchVisibleMoodMeta, { passive: true });
        renderer.bindInteractions();
        animatedEmoji.observe(list);
        hydrateMoodRichText(list);
        void loadInitial();
      }
    }
}
