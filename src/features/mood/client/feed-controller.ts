import { createAnimatedEmojiManager } from '@/features/mood/client/animated-emoji';
import { createFeedCommentsPopoverController } from '@/features/mood/client/feed-comments-popover';
import { createFeedMediaHydrator } from '@/features/mood/client/feed-media-hydration';
import { createFeedRenderer } from '@/features/mood/client/feed-renderer';
import { createFeedUpdateWatcher } from '@/features/mood/client/feed-update-watcher';
import { initMoodGalleries } from '@/features/mood/client/gallery';
import type {
  ChannelInfo,
  MoodData,
} from '@/features/mood/client/feed-types';

export function initMoodFeedController(): void {
    const loadingEl = document.querySelector('[data-mood-loading]');
    const errorEl = document.querySelector('[data-mood-error]');
    const feedEl = document.querySelector('[data-mood-feed]');
    const list = document.querySelector('[data-mood-list]') as HTMLElement | null;
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

        const inlineSkeletonConfig = {
          dateWidth: '68px',
          items: [
            { lineWidth: '70%' },
            { lineWidth: '58%' },
          ],
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
      let oldestNumericId = Number.POSITIVE_INFINITY;
      let oldestId = '';
      let fallbackOldestId = '';
      let pendingDateKey: string | null = null;
      let pendingPosts: MoodData[] = [];
      const updateWatcher = createFeedUpdateWatcher({
        list,
        updateNoticeEl,
        updateNoticeTextEl,
        updateRefreshBtn,
        isLoading: () => isLoading,
        getTotalCount: () => totalCount,
      });

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

      commentsPopover.init();
      const serverRenderedCount = list.querySelectorAll('.mood-item[data-mood-id]').length;
      if (serverRenderedCount > 0) {
        totalCount = serverRenderedCount;
        initMoodGalleries(list);
      }

      const appendMoods = (posts: MoodData[], startIndex = totalCount): void => {
        totalCount = renderer.appendMoods(posts, startIndex);
        updateWatcher.syncLatestSeenId();
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
            updateWatcher.start();

            if (!posts.length) {
              handleNoMore();
              setStatus('No moods yet.');
              return;
            }

            startObserver();
            return;
          }

          let ready: MoodData[] = [];
          let beforeId = '';
          let lastBefore = '';
          while (hasMore && ready.length === 0) {
            const data = await fetchMoods(beforeId);
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
            updateWatcher.start();
            return;
          }

          if (ready.length) {
            appendMoods(ready, totalCount);
          }
          showFeed();
          updateWatcher.start();

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

        updateWatcher.init();
        renderer.bindInteractions();
        animatedEmoji.observe(list);
        loadInitial();
      }
    }
}
