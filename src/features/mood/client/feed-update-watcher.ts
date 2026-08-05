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

/**
 * Build the freshness-probe request for the active read source. Archive reads
 * use the D1-backed v2 probe (edge-cached ~30s); the live v1 route needs
 * fresh=1 to bypass its server cache. Sending fresh=1 to the archive would
 * defeat its cache, so it is scoped to the live source only.
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

  const triggerPageRefresh = async (): Promise<void> => {
    cancelAutoRefresh();
    clearRefreshMotion();

    if (!updateNoticeEl) {
      window.setTimeout(() => window.location.reload(), 100);
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

    noticeReloadCall = gsap.delayedCall(0.72, () => {
      window.location.reload();
    });
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
    const response = await fetch(buildMoodProbeUrl(readSource), {
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

  const init = (): void => {
    if (initialized) return;
    initialized = true;

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
