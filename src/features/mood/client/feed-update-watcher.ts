import type gsap from 'gsap';
import { pageScroll } from '@/lib/page-scroll';

type GsapModule = typeof gsap;

interface FeedUpdateWatcherOptions {
  list: HTMLElement;
  updateNoticeEl: HTMLElement | null;
  updateNoticeTextEl: HTMLElement | null;
  updateRefreshBtn: HTMLButtonElement | null;
  isLoading: () => boolean;
  getTotalCount: () => number;
  readSource?: string;
}

interface FeedUpdateWatcherController {
  init(): void;
  start(): void;
  resume(): void;
  syncLatestSeenId(): void;
}

const UPDATE_POLL_INTERVAL_MS = 75_000;
const AUTO_REFRESH_DELAY_MS = 6_000;
const AUTO_REFRESH_MAX_SCROLL_Y = 120;
const AUTO_REFRESH_CANCEL_SCROLL_Y = 220;
const REFRESH_LABEL_IDLE = 'Refresh';
const REFRESH_LABEL_PENDING = 'Refreshing...';
const REFRESH_QUERY_PARAM = 'refresh';

/**
 * Build the freshness-probe request for the active read source. Archive reads
 * use the D1-backed v2 probe, which site-api lets the CDN hold for ~15s; the
 * live v1 route needs fresh=1 to bypass its server cache. Sending fresh=1 to
 * the archive would defeat that cache, so it is scoped to the live source only.
 */
export function buildMoodProbeUrl(readSource?: string): string {
  const isArchive = readSource?.trim().toLowerCase() === 'archive';
  const query = new URLSearchParams({ probe: '1' });
  if (isArchive) {
    return `/api/v2/mood?${query}`;
  }
  query.set('fresh', '1');
  return `/api/moods?${query}`;
}

/**
 * Build the navigation target for an update refresh. A plain reload of /mood
 * is served from the page cache (minutes old) and would miss the new post, so
 * the refresh carries `refresh=<id>`: the page treats it as a fresh read and
 * the HTML cache never stores query variants it does not recognise.
 */
export function buildMoodRefreshUrl(href: string, pendingUpdateId: string): string {
  const url = new URL(href);
  url.searchParams.set(REFRESH_QUERY_PARAM, pendingUpdateId || '1');
  return url.toString();
}

/**
 * Return the current URL without the refresh marker, or null when there is
 * nothing to strip. Keeps a later manual reload or shared link cacheable.
 */
export function stripMoodRefreshParam(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has(REFRESH_QUERY_PARAM)) return null;
  url.searchParams.delete(REFRESH_QUERY_PARAM);
  return url.toString();
}

const SCROLL_RESTORE_STORAGE_PREFIX = 'buxx:mood:scroll-restore:';

/**
 * sessionStorage key for the scroll position to restore after a refresh
 * navigation, scoped to the canonical (refresh-marker-stripped) URL so the
 * write before `navigateToFreshFeed` and the read in `init()` agree on the
 * same key regardless of which side of the strip either of them saw it from.
 */
export function moodScrollRestoreKey(href: string): string {
  return `${SCROLL_RESTORE_STORAGE_PREFIX}${stripMoodRefreshParam(href) ?? href}`;
}

/**
 * Stash `scrollTop` for `takeMoodScrollAfterRefresh` to hand back once the
 * refresh navigation `navigateToFreshFeed` is about to start has rendered.
 * `storage` is injectable for tests; every real caller means sessionStorage.
 * Private browsing can deny it -- the reader then just lands at the top,
 * same as any other reload.
 */
export function stashMoodScrollForRefresh(
  href: string,
  scrollTop: number,
  storage: Pick<Storage, 'setItem'> = sessionStorage,
): void {
  try {
    storage.setItem(moodScrollRestoreKey(href), String(Math.round(scrollTop)));
  } catch {
    // Ignored -- see doc comment above.
  }
}

/**
 * Take back the scroll position `stashMoodScrollForRefresh` stashed for this
 * URL, or null when there is none (an ordinary visit, or one already
 * consumed). Removes the entry either way a stale value read once must not
 * resurface on some later, unrelated visit to the same URL.
 */
export function takeMoodScrollAfterRefresh(
  href: string,
  storage: Pick<Storage, 'getItem' | 'removeItem'> = sessionStorage,
): number | null {
  const key = moodScrollRestoreKey(href);
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
    storage.removeItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const y = Number(raw);
  return Number.isFinite(y) && y > 0 ? y : null;
}

export function createFeedUpdateWatcher({
  list,
  updateNoticeEl,
  updateNoticeTextEl,
  updateRefreshBtn,
  isLoading,
  getTotalCount,
  readSource,
}: FeedUpdateWatcherOptions): FeedUpdateWatcherController {
  const scroll = pageScroll();
  let latestSeenId = '';
  let pendingUpdateId = '';
  let isCheckingUpdates = false;
  let updatePollTimer = 0;
  let autoRefreshTimer = 0;
  let autoRefreshPending = false;
  let initialized = false;
  let started = false;
  let loadedGsap: GsapModule | null = null;
  let gsapPromise: Promise<GsapModule> | null = null;
  let noticeRequestId = 0;

  let noticeShowTl: GSAPTimeline | null = null;
  let noticeCountdownTween: GSAPTween | null = null;
  let noticeSpinnerTween: GSAPTween | null = null;
  let noticeRefreshTl: GSAPTimeline | null = null;
  let noticeReloadCall: GSAPTween | null = null;

  const loadGsap = async (): Promise<GsapModule> => {
    if (loadedGsap) return loadedGsap;
    gsapPromise ??= import('gsap').then(({ default: gsap }) => {
      loadedGsap = gsap;
      return gsap;
    });
    return gsapPromise;
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
    const firstItem = list.querySelector<HTMLElement>('.mood-item[data-mood-id]');
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

  const resetUpdateNoticeLayout = (gsap: GsapModule): void => {
    clearRefreshMotion();
    if (!updateNoticeEl) return;

    const progressEl = updateNoticeEl.querySelector<HTMLElement>('.mood-update-progress');
    const refreshBtn = updateRefreshBtn as HTMLElement | null;
    const refreshLabel = refreshBtn?.querySelector<HTMLElement>('.mood-update-action-label');
    const refreshIcon = refreshBtn?.querySelector<HTMLElement>('.mood-update-action-icon');

    updateNoticeEl.classList.remove('is-refreshing');
    gsap.set(updateNoticeEl, { clearProps: 'width,gap,paddingLeft,paddingRight,x,overflow' });

    if (updateNoticeTextEl) {
      updateNoticeTextEl.style.display = '';
      gsap.set(updateNoticeTextEl, {
        clearProps: 'opacity,visibility,x,maxWidth,overflow,paddingRight,position,left,top,yPercent',
      });
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

  const navigateToFreshFeed = (): void => {
    // A refresh replaces the URL rather than reloading it (see
    // buildMoodRefreshUrl), so the browser has no history entry for the
    // target and no scroll offset of its own to restore -- stash the one the
    // reader is actually leaving, and init() below hands it back once the
    // fresh feed has rendered.
    stashMoodScrollForRefresh(window.location.href, scroll.el.scrollTop);
    window.location.replace(buildMoodRefreshUrl(window.location.href, pendingUpdateId));
  };

  const triggerPageRefresh = async (): Promise<void> => {
    cancelAutoRefresh();
    clearRefreshMotion();

    if (!updateNoticeEl) {
      window.setTimeout(navigateToFreshFeed, 100);
      return;
    }

    const gsap = await loadGsap();

    const progressEl = updateNoticeEl.querySelector<HTMLElement>('.mood-update-progress');
    const refreshBtn = updateRefreshBtn as HTMLElement | null;
    const refreshLabel = refreshBtn?.querySelector<HTMLElement>('.mood-update-action-label');
    const refreshIcon = refreshBtn?.querySelector<HTMLElement>('.mood-update-action-icon');

    if (refreshBtn?.classList.contains('is-refreshing')) {
      return;
    }

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
      },
    });
    noticeRefreshTl = refreshTl;

    if (updateNoticeTextEl) {
      refreshTl.to(updateNoticeTextEl, {
        opacity: 0.55,
        duration: 0.18,
        ease: 'power2.out',
      }, 0);
    }

    if (refreshIcon) {
      refreshTl.add(() => {
        noticeSpinnerTween = gsap.to(refreshIcon, {
          rotation: '+=360',
          duration: 0.8,
          ease: 'none',
          repeat: -1,
          overwrite: 'auto',
        });
      }, 0);
    }

    noticeReloadCall = gsap.delayedCall(0.72, navigateToFreshFeed);
  };

  const hideUpdateNotice = (): void => {
    noticeRequestId += 1;
    cancelAutoRefresh();
    clearRefreshMotion();
    if (!updateNoticeEl) return;

    noticeShowTl?.kill();
    noticeShowTl = null;
    noticeSpinnerTween?.kill();
    noticeSpinnerTween = null;

    const gsap = loadedGsap;
    if (!gsap) {
      updateNoticeEl.style.display = 'none';
      return;
    }

    gsap.to(updateNoticeEl, {
      autoAlpha: 0,
      x: -10,
      scale: 0.98,
      duration: 0.24,
      ease: 'power2.in',
      onComplete: () => {
        const actionsEl = updateNoticeEl.querySelector<HTMLElement>('[data-mood-update-actions]');
        if (actionsEl) {
          gsap.set(actionsEl, { clearProps: 'opacity,visibility,x' });
        }
        resetUpdateNoticeLayout(gsap);
        gsap.set(updateNoticeEl, { display: 'none' });
      },
    });
  };

  const showUpdateNotice = async (autoRefresh: boolean): Promise<void> => {
    const requestId = ++noticeRequestId;
    if (!updateNoticeEl || !updateNoticeTextEl) {
      if (autoRefresh) {
        void triggerPageRefresh();
      }
      return;
    }

    cancelAutoRefresh();
    autoRefreshPending = autoRefresh;

    noticeShowTl?.kill();
    noticeShowTl = null;
    noticeSpinnerTween?.kill();
    noticeSpinnerTween = null;

    const gsap = await loadGsap();
    if (requestId !== noticeRequestId) return;

    const progressEl = updateNoticeEl.querySelector<HTMLElement>('.mood-update-progress');
    const actionsEl = updateNoticeEl.querySelector<HTMLElement>('[data-mood-update-actions]');
    resetUpdateNoticeLayout(gsap);

    if (actionsEl) {
      gsap.set(actionsEl, { clearProps: 'opacity,visibility,x' });
    }

    updateNoticeTextEl.textContent = 'New moods are in!';
    gsap.set(updateNoticeEl, { display: 'inline-flex' });

    noticeShowTl = gsap.timeline();
    noticeShowTl.fromTo(
      updateNoticeEl,
      { autoAlpha: 0, x: -10, scale: 0.98 },
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.42, ease: 'power3.out' }
    );

    if (autoRefresh && progressEl) {
      gsap.set(progressEl, { opacity: 1, '--progress': 1 });
      noticeCountdownTween = gsap.to(progressEl, {
        '--progress': 0,
        duration: AUTO_REFRESH_DELAY_MS / 1000,
        ease: 'none',
      });
      autoRefreshTimer = window.setTimeout(() => {
        void triggerPageRefresh();
      }, AUTO_REFRESH_DELAY_MS);
      return;
    }

    if (progressEl) {
      gsap.set(progressEl, { opacity: 0 });
    }
  };

  const fetchLatestMoodId = async (): Promise<string> => {
    // Skip the browser cache only. No explicit revalidation header: the short
    // CDN copy of the probe (at most ~15s old) is fresh enough for a 75s poll.
    const response = await fetch(buildMoodProbeUrl(readSource), {
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error('Failed to check mood updates.');
    }

    const data = await response.json() as { latestId?: unknown };
    return typeof data.latestId === 'string' ? data.latestId : '';
  };

  const handleDetectedUpdate = (nextLatestId: string): void => {
    if (!nextLatestId) return;
    if (!pendingUpdateId || isNewerMoodId(nextLatestId, pendingUpdateId)) {
      pendingUpdateId = nextLatestId;
    }

    const canAutoRefresh =
      document.visibilityState === 'visible' && scroll.el.scrollTop <= AUTO_REFRESH_MAX_SCROLL_Y;
    void showUpdateNotice(canAutoRefresh);
  };

  const checkForUpdates = async (): Promise<void> => {
    if (!started || document.visibilityState !== 'visible') return;
    if (isLoading() || isCheckingUpdates) return;

    isCheckingUpdates = true;
    try {
      const remoteLatestId = await fetchLatestMoodId();
      if (!remoteLatestId) return;

      if (!latestSeenId) {
        if (getTotalCount() === 0) {
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

  const syncLatestSeenId = (): void => {
    const newestId = getNewestRenderedMoodId();
    if (!newestId) return;
    if (!latestSeenId || isNewerMoodId(newestId, latestSeenId)) {
      latestSeenId = newestId;
    }

    if (pendingUpdateId && !isNewerMoodId(pendingUpdateId, latestSeenId)) {
      pendingUpdateId = '';
      hideUpdateNotice();
    }
  };

  const initRefreshButton = (): void => {
    if (!updateRefreshBtn) return;

    updateRefreshBtn.addEventListener('click', () => {
      void triggerPageRefresh();
    });

    const isRefreshLocked = (): boolean => (
      updateRefreshBtn.classList.contains('is-refreshing')
      || updateRefreshBtn.getAttribute('aria-disabled') === 'true'
    );

    updateRefreshBtn.addEventListener('mouseenter', () => {
      if (isRefreshLocked()) return;
      updateRefreshBtn.classList.add('is-hovered');
    });

    updateRefreshBtn.addEventListener('mouseleave', () => {
      if (isRefreshLocked()) return;
      updateRefreshBtn.classList.remove('is-hovered');
    });
  };

  /** Hands back the scroll position `navigateToFreshFeed` stashed before
      leaving, now that the fresh feed this navigation asked for is the page
      actually on screen. Only reached from a refresh navigation (see call
      site). */
  const restorePreRefreshScroll = (strippedHref: string): void => {
    const y = takeMoodScrollAfterRefresh(strippedHref);
    if (y !== null) scroll.el.scrollTo(0, y);
  };

  const init = (): void => {
    if (initialized) return;
    initialized = true;

    const strippedHref = stripMoodRefreshParam(window.location.href);
    if (strippedHref) {
      window.history.replaceState(window.history.state, '', strippedHref);
      restorePreRefreshScroll(strippedHref);
    }

    if (updateNoticeEl) {
      updateNoticeEl.style.opacity = '0';
      updateNoticeEl.style.transform = 'translateX(-10px)';
      updateNoticeEl.style.display = 'none';
    }

    initRefreshButton();
  };

  const start = (): void => {
    if (started) return;
    started = true;

    syncLatestSeenId();
    scheduleNextUpdateCheck();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (pendingUpdateId && isNewerMoodId(pendingUpdateId, latestSeenId)) {
          void showUpdateNotice(scroll.el.scrollTop <= AUTO_REFRESH_MAX_SCROLL_Y);
        }
        void checkForUpdates();
        return;
      }

      cancelAutoRefresh();
    });

    window.addEventListener('online', () => {
      void checkForUpdates();
    });

    scroll.events.addEventListener(
      'scroll',
      () => {
        if (!autoRefreshPending) return;
        if (scroll.el.scrollTop > AUTO_REFRESH_CANCEL_SCROLL_Y) {
          void showUpdateNotice(false);
        }
      },
      { passive: true }
    );

    // Use pagehide (not beforeunload) so a bfcache-suspended page tears the
    // timer down; resume() re-arms it on pageshow(persisted).
    window.addEventListener('pagehide', clearUpdatePollTimer);
  };

  const resume = (): void => {
    if (!started) return;
    scheduleNextUpdateCheck();
    void checkForUpdates();
  };

  return {
    init,
    start,
    resume,
    syncLatestSeenId,
  };
}
