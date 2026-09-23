// Listening card controller — binds every [data-listening] card to the
// site-wide preview player singleton. Extracted verbatim from
// Listening.astro's inline script so the mood feed can hydrate the same
// cards on client-rendered posts. `data-static="true"` cards skip the
// live-track refresh loop; playback and seek still work.
import { musicKitPlayer } from '@/lib/musickit/player';
import {
  createBrowserListeningAnalytics,
  inferListeningSurface,
} from '@/lib/listening/analytics';
import type { ListeningAccent } from '@/features/home/types';

type ListeningTrackPayload = {
  id?: string;
  appleCatalogId?: string;
  catalogId?: string;
  title?: string;
  artist?: string;
  collection?: string;
  appleMusicUrl?: string;
  sourceUrl?: string;
  artworkUrl?: string;
  thumbUrl?: string;
  accent?: ListeningAccent | null;
  previewUrl?: string;
  year?: string;
  playedAt?: string;
  isNowPlaying?: boolean;
};

const LISTENING_REFRESH_MS = 45_000;
const playedAtDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

const ACCENT_PROPERTIES = [
  '--listening-accent-h',
  '--listening-accent-c-light',
  '--listening-accent-c-dark'
] as const;

export const initListeningCards = (root: ParentNode = document): void => {
  const roots = root.querySelectorAll('[data-listening]');

  roots.forEach((root) => {
    if (!(root instanceof HTMLElement) || root.dataset.bound === 'true') {
      return;
    }

    root.dataset.bound = 'true';

    const playButton = root.querySelector('[data-listening-play]');
    if (!(playButton instanceof HTMLButtonElement)) {
      return;
    }

    const artwork = root.querySelector('[data-listening-artwork]');
    const link = root.querySelector('[data-listening-link]');
    const title = root.querySelector('[data-listening-title]');
    const titleText = root.querySelector('[data-listening-title-text]');
    const titleLabel = root.querySelector('[data-listening-title-label]');
    const titleDuplicate = root.querySelector('[data-listening-title-duplicate]');
    const separator = root.querySelector('.listening-sep');
    const artist = root.querySelector('[data-listening-artist]');
    const collection = root.querySelector('[data-listening-collection]');
    const year = root.querySelector('[data-listening-year]');
    const status = root.querySelector('[data-listening-status]');
    const progress = root.querySelector('[data-listening-progress]');
    const elapsedEl = root.querySelector('[data-listening-elapsed]');
    const totalEl = root.querySelector('[data-listening-total]');
    const recordEl = root.querySelector('.listening-art-record');

    let trackTitle = playButton.dataset.trackTitle ?? 'Track';
    let trackArtist = artist?.textContent?.trim() ?? '';
    let trackUrl = playButton.dataset.trackUrl ?? '';
    let isLive = root.dataset.nowPlaying === 'true';
    const hasInitialTrack = root.dataset.hasInitialTrack === 'true';
    const isStatic = root.dataset.static === 'true';
    const playbackRequest = {
      catalogId: playButton.dataset.appleCatalogId ?? '',
      previewUrl: playButton.dataset.previewUrl ?? '',
    };
    const listeningAnalytics = createBrowserListeningAnalytics(() => ({
      trackId: playbackRequest.catalogId.trim() || null,
      trackTitle,
      trackArtist: trackArtist || null,
      pagePath: window.location.pathname,
      surface: inferListeningSurface(window.location.pathname),
    }));

    const applyAccent = (accent: ListeningAccent | null) => {
      if (!accent) {
        delete root.dataset.accent;
        for (const name of ACCENT_PROPERTIES) root.style.removeProperty(name);
        return;
      }

      root.dataset.accent = '';
      root.style.setProperty('--listening-accent-h', accent.hue.toFixed(1));
      root.style.setProperty('--listening-accent-c-light', accent.chromaLight.toFixed(3));
      root.style.setProperty('--listening-accent-c-dark', accent.chromaDark.toFixed(3));
    };

    const setLiveState = (nextIsLive: boolean) => {
      isLive = nextIsLive;
      root.dataset.nowPlaying = String(nextIsLive);
      root.classList.toggle('is-live', nextIsLive);
      root.classList.toggle('is-recent', !nextIsLive);
      playButton.classList.toggle('is-live', nextIsLive);
      playButton.classList.toggle('is-recent', !nextIsLive);
      // Static cards (mood audio) keep their server-rendered eyebrow text.
      if (status && !isStatic) status.textContent = nextIsLive ? 'Now Playing' : 'Recently Played';
    };

    const setPlaybackState = (isPlaying: boolean, isLoading = false) => {
      root.classList.toggle('is-preview-playing', isPlaying);
      playButton.classList.toggle('is-preview-playing', isPlaying);
      root.classList.toggle('is-preview-loading', isLoading);
      playButton.classList.toggle('is-preview-loading', isLoading);
      playButton.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
      if (isLoading) {
        // Stays clickable on purpose: a slow preview must be cancellable, so
        // the spinner doubles as a stop button.
        playButton.disabled = false;
        playButton.setAttribute('aria-busy', 'true');
        playButton.setAttribute('aria-label', `Stop loading ${trackTitle}`);
        return;
      }

      playButton.removeAttribute('aria-busy');
      if (isPlaying) {
        playButton.disabled = false;
        playButton.setAttribute('aria-label', `Pause ${trackTitle}`);
      } else {
        syncPlayAction();
      }
    };

    const formatTime = (seconds: number) => {
      if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const syncProgress = (fraction: number) => {
      const clamped = Math.min(1, Math.max(0, fraction));
      if (progress instanceof HTMLElement) {
        progress.style.setProperty('--fill', String(clamped));
        progress.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
      }
    };

    // Scrubbing spins the disc a few turns across the full drag, so seeking
    // reads as physically winding the record rather than a bare bar drag.
    const RECORD_SCRUB_TURNS = 6;
    const syncRecordRotation = (fraction: number) => {
      const clamped = Math.min(1, Math.max(0, fraction));
      root.style.setProperty('--record-rotation', `${clamped * RECORD_SCRUB_TURNS}turn`);
    };

    // When playback stops, the CSS spin keyframe vanishes and the disc would
    // snap back to --record-rotation. Read the live angle off the transform
    // matrix and pin the variable there, so it holds where it was spinning.
    const freezeCurrentRecordRotation = () => {
      if (!(recordEl instanceof HTMLElement)) return;
      const transform = getComputedStyle(recordEl).transform;
      if (!transform || transform === 'none') return;
      const matrix = new DOMMatrixReadOnly(transform);
      const degrees = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
      root.style.setProperty('--record-rotation', `${degrees}deg`);
    };

    const syncTitleMarquee = () => {
      if (!(title instanceof HTMLElement) || !(titleText instanceof HTMLElement)) {
        return;
      }

      title.classList.remove('is-marquee');
      title.style.removeProperty('--title-marquee-duration');
      title.style.removeProperty('--title-marquee-distance');
      title.style.removeProperty('--title-marquee-width');
      link?.classList.remove('is-inline');

      window.requestAnimationFrame(() => {
        const measuredTitle = titleLabel instanceof HTMLElement ? titleLabel : titleText;
        const measuredArtist = artist instanceof HTMLElement ? artist : null;
        const measuredSeparator = separator instanceof HTMLElement ? separator : null;
        const maxTitleWidth = 360;
        const containerWidth = link?.parentElement?.clientWidth || maxTitleWidth;
        const displayWidth = Math.min(containerWidth, maxTitleWidth);
        const separatorWidth = measuredSeparator?.scrollWidth || 8;
        const artistWidth = measuredArtist?.scrollWidth ?? 0;
        const inlineGap = 16;
        const inlineWidth = measuredTitle.scrollWidth + separatorWidth + artistWidth + inlineGap;

        if (inlineWidth <= containerWidth) {
          link?.classList.add('is-inline');
          return;
        }

        const overflow = measuredTitle.scrollWidth > displayWidth + 2;
        if (!overflow) return;

        const distance = measuredTitle.scrollWidth + 28;
        const duration = Math.max(12, Math.min(26, distance / 22));
        title.style.setProperty('--title-marquee-width', `${displayWidth}px`);
        title.style.setProperty('--title-marquee-distance', `${distance}px`);
        title.style.setProperty('--title-marquee-duration', `${duration}s`);
        title.classList.add('is-marquee');
      });
    };

    const syncPlayAction = () => {
      const catalogId = playButton.dataset.appleCatalogId ?? '';
      const previewUrl = playButton.dataset.previewUrl ?? '';

      if (catalogId || previewUrl) {
        playButton.disabled = false;
        playButton.setAttribute('aria-label', `Play ${trackTitle}`);
        return;
      }

      if (trackUrl) {
        playButton.disabled = false;
        playButton.setAttribute('aria-label', `Open ${trackTitle}`);
        return;
      }

      playButton.disabled = true;
      playButton.setAttribute('aria-label', `${trackTitle} preview unavailable`);
    };

    const normalizeCatalogId = (track: ListeningTrackPayload) => {
      const value = track.appleCatalogId?.trim()
        || track.catalogId?.trim()
        || track.id?.trim()
        || '';
      return /^\d+$/u.test(value) ? value : '';
    };

    const setPlaybackSources = (catalogId: string, previewUrl: string) => {
      const changed = playbackRequest.catalogId !== catalogId
        || playbackRequest.previewUrl !== previewUrl;
      const hasPlayback = Boolean(catalogId || previewUrl);

      if (changed && musicKitPlayer.snapshot().owner === playbackRequest) {
        musicKitPlayer.pause();
      }

      playbackRequest.catalogId = catalogId;
      playbackRequest.previewUrl = previewUrl;
      playButton.dataset.appleCatalogId = catalogId;
      playButton.dataset.previewUrl = previewUrl;
      root.classList.toggle('has-no-playback', !hasPlayback);
      playButton.classList.toggle('has-no-playback', !hasPlayback);
      setPlaybackState(false);
    };

    const formatPlayedAt = (playedAt: string) => {
      const date = new Date(playedAt);
      if (!Number.isFinite(date.getTime())) {
        return '';
      }

      return playedAtDateFormatter.format(date);
    };

    // Hands the skeleton over to the one-shot reveal in listening.css. The
    // class only has to outlive the longest line delay plus the animation.
    let settleTimer: number | undefined;
    const settleOutOfLoading = () => {
      window.clearTimeout(settleTimer);
      root.classList.add('is-settling');
      settleTimer = window.setTimeout(() => {
        root.classList.remove('is-settling');
      }, 900);
    };

    const applyTrack = (track: ListeningTrackPayload) => {
      const nextTitle = track.title?.trim() || trackTitle;
      const nextArtist = track.artist?.trim() || '';
      const nextCollection = track.collection?.trim() || '';
      const nextLink = track.appleMusicUrl?.trim() || track.sourceUrl?.trim() || '';
      const nextArtwork = track.thumbUrl?.trim() || track.artworkUrl?.trim() || '';
      const nextPreviewUrl = track.previewUrl?.trim() || '';
      const nextCatalogId = normalizeCatalogId(track);
      const nextYear = track.year?.trim() || formatPlayedAt(track.playedAt ?? '');
      const nextIsLive = Boolean(track.isNowPlaying);
      applyAccent(track.accent ?? null);

      trackTitle = nextTitle;
      trackArtist = nextArtist;
      trackUrl = nextLink;
      // Only the first fill-in is a reveal; later refreshes swap text in place.
      if (root.classList.contains('is-loading')) settleOutOfLoading();
      root.classList.remove('is-loading');
      root.setAttribute('aria-label', nextIsLive ? 'Now playing' : 'Recently played');
      playButton.dataset.trackTitle = nextTitle;
      playButton.dataset.trackUrl = nextLink;

      if (titleLabel instanceof HTMLElement && titleDuplicate instanceof HTMLElement) {
        titleLabel.textContent = nextTitle;
        titleLabel.dataset.title = nextTitle;
        titleDuplicate.textContent = nextTitle;
        titleDuplicate.dataset.title = nextTitle;
      } else if (title) {
        title.textContent = nextTitle;
      }
      if (artist) artist.textContent = nextArtist;
      if (collection) collection.textContent = nextCollection;
      if (year) year.textContent = nextYear;
      setLiveState(nextIsLive);

      if (link instanceof HTMLAnchorElement && nextLink) {
        link.href = nextLink;
        link.setAttribute('aria-label', `Open ${nextTitle} — ${nextArtist}`);
        link.removeAttribute('aria-disabled');
        link.removeAttribute('tabindex');
      }

      if (artwork instanceof HTMLImageElement && nextArtwork) {
        const currentArtwork = artwork.currentSrc || artwork.src;
        if (currentArtwork !== nextArtwork) {
          artwork.src = nextArtwork;
        }
      }

      if (
        (playButton.dataset.appleCatalogId ?? '') !== nextCatalogId
        || (playButton.dataset.previewUrl ?? '') !== nextPreviewUrl
      ) {
        setPlaybackSources(nextCatalogId, nextPreviewUrl);
      } else {
        syncPlayAction();
      }

      syncTitleMarquee();
    };

    setLiveState(isLive);
    setPlaybackSources(
      playButton.dataset.appleCatalogId ?? '',
      playButton.dataset.previewUrl ?? ''
    );
    syncTitleMarquee();

    window.addEventListener('resize', syncTitleMarquee, { passive: true });

    let wasPlaying = false;
    // Cover cards seed a total-time label before playback; keep it visible when
    // this card doesn't own the player instead of blanking it out.
    const seededTotal = totalEl?.textContent ?? '';
    musicKitPlayer.subscribe((snapshot) => {
      const ours = snapshot.owner === playbackRequest;
      const playing = ours && snapshot.isPlaying;
      const loading = ours && snapshot.isLoading;
      if (wasPlaying && !playing) freezeCurrentRecordRotation();
      setPlaybackState(playing, loading);
      wasPlaying = playing;

      const duration = ours ? snapshot.duration : 0;
      const current = ours ? snapshot.currentTime : 0;
      listeningAnalytics?.observe({
        owned: ours,
        isPlaying: playing,
        currentTime: current,
        duration,
      });
      const fraction = duration > 0 ? Math.min(1, current / duration) : 0;
      syncProgress(fraction);
      if (elapsedEl) elapsedEl.textContent = ours ? formatTime(current) : '0:00';
      if (totalEl) totalEl.textContent = duration > 0 ? formatTime(duration) : seededTotal;
    });

    // Draggable seek. Pointer events cover mouse + touch + pen in one path.
    if (progress instanceof HTMLElement) {
      const seekFromEvent = (event: PointerEvent) => {
        const rect = progress.getBoundingClientRect();
        if (rect.width <= 0) return;
        const fraction = (event.clientX - rect.left) / rect.width;
        syncProgress(fraction);
        syncRecordRotation(fraction);
        musicKitPlayer.seekFraction(fraction);
      };
      let scrubbing = false;
      progress.addEventListener('pointerdown', (event) => {
        if (musicKitPlayer.snapshot().owner !== playbackRequest) return;
        scrubbing = true;
        root.classList.add('is-scrubbing');
        progress.setPointerCapture(event.pointerId);
        seekFromEvent(event);
      });
      progress.addEventListener('pointermove', (event) => {
        if (!scrubbing) return;
        seekFromEvent(event);
      });
      const endScrub = (event: PointerEvent) => {
        if (!scrubbing) return;
        scrubbing = false;
        root.classList.remove('is-scrubbing');
        listeningAnalytics?.recordSeek();
        progress.releasePointerCapture(event.pointerId);
      };
      progress.addEventListener('pointerup', endScrub);
      progress.addEventListener('pointercancel', endScrub);
    }

    playButton.addEventListener('click', async () => {
      if (!playbackRequest.catalogId && !playbackRequest.previewUrl) {
        if (trackUrl) {
          window.open(trackUrl, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      const snapshot = musicKitPlayer.snapshot();
      const startsPlayback = snapshot.owner !== playbackRequest
        || (!snapshot.isPlaying && !snapshot.isLoading);
      if (startsPlayback) listeningAnalytics?.requestPlay();
      musicKitPlayer.toggle(playbackRequest).catch(() => undefined);
    });

    const fetchListeningTrack = async (endpoint: string) => {
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json'
        }
      });
      if (!response.ok) return null;

      const payload = await response.json() as { track?: ListeningTrackPayload | null };
      return payload.track ?? null;
    };

    const refreshListening = async () => {
      try {
        const track = await fetchListeningTrack('/api/v2/listening')
          ?? await fetchListeningTrack('/api/listening');
        if (track) applyTrack(track);
      } catch {
        // Keep the static fallback when live listening data is unavailable.
      }
    };

    let listeningRefreshTimer: number | undefined;

    const clearListeningRefresh = () => {
      if (listeningRefreshTimer === undefined) {
        return;
      }

      window.clearTimeout(listeningRefreshTimer);
      listeningRefreshTimer = undefined;
    };

    const scheduleListeningRefresh = (delay: number) => {
      clearListeningRefresh();
      if (document.visibilityState !== 'visible') {
        return;
      }

      listeningRefreshTimer = window.setTimeout(async () => {
        listeningRefreshTimer = undefined;
        if (document.visibilityState !== 'visible') {
          return;
        }

        await refreshListening();
        scheduleListeningRefresh(LISTENING_REFRESH_MS);
      }, delay);
    };

    const refreshListeningAndResume = async () => {
      clearListeningRefresh();
      if (document.visibilityState !== 'visible') {
        return;
      }

      await refreshListening();
      scheduleListeningRefresh(LISTENING_REFRESH_MS);
    };

    // The showcase specimen freezes on its demo track — playback still works,
    // but no live refresh runs.
    if (isStatic) {
      return;
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void refreshListeningAndResume();
        return;
      }

      clearListeningRefresh();
    });

    scheduleListeningRefresh(hasInitialTrack ? LISTENING_REFRESH_MS : 1000);
  });
};

export const autoInitListeningCards = (): void => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initListeningCards(), { once: true });
  } else {
    initListeningCards();
  }
};
