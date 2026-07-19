// Listening card controller — binds every [data-listening] card to the
// site-wide preview player singleton. Extracted verbatim from
// Listening.astro's inline script so the mood feed can hydrate the same
// cards on client-rendered posts. `data-static="true"` cards skip the
// live-track refresh loop; playback and seek still work.
import { musicKitPlayer } from '@/lib/musickit/player';

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
  previewUrl?: string;
  year?: string;
  playedAt?: string;
  isNowPlaying?: boolean;
};

const LISTENING_REFRESH_MS = 45_000;
const ARTWORK_SAMPLE_SIZE = 24;
const HUE_BUCKET_SIZE = 18;
const SATURATION_BUCKETS = 4;
const LIGHTNESS_BUCKETS = 4;
const artworkAccentCache = new Map<string, string>();

type ColorBucket = {
  redTotal: number;
  greenTotal: number;
  blueTotal: number;
  weightTotal: number;
  count: number;
  saturationTotal: number;
  lightnessTotal: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const rgbToHsl = (red: number, green: number, blue: number): [number, number, number] => {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  if (max === min) {
    return [0, 0, lightness];
  }

  const delta = max - min;
  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min);
  let hue = 0;

  if (max === r) {
    hue = (g - b) / delta + (g < b ? 6 : 0);
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  return [hue * 60, saturation, lightness];
};

const getColorBucketKey = (hue: number, saturation: number, lightness: number): string => {
  const hueBucket = Math.floor(hue / HUE_BUCKET_SIZE);
  const saturationBucket = Math.floor(clamp(saturation, 0, 0.999) * SATURATION_BUCKETS);
  const lightnessBucket = Math.floor(clamp(lightness, 0, 0.999) * LIGHTNESS_BUCKETS);
  return `${hueBucket}:${saturationBucket}:${lightnessBucket}`;
};

const scoreColorBucket = (bucket: ColorBucket): number => {
  const saturation = bucket.saturationTotal / bucket.count;
  const lightness = bucket.lightnessTotal / bucket.count;
  const midLightness = 1 - Math.abs(lightness - 0.54) * 1.7;
  const usableLightness = clamp(midLightness, 0.12, 1);

  return bucket.count * Math.pow(clamp(saturation, 0.08, 1), 1.35) * usableLightness;
};

const sampleArtworkAccent = (image: HTMLImageElement): string | null => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !image.naturalWidth || !image.naturalHeight) {
    return null;
  }

  canvas.width = ARTWORK_SAMPLE_SIZE;
  canvas.height = ARTWORK_SAMPLE_SIZE;
  context.drawImage(image, 0, 0, ARTWORK_SAMPLE_SIZE, ARTWORK_SAMPLE_SIZE);

  const { data } = context.getImageData(0, 0, ARTWORK_SAMPLE_SIZE, ARTWORK_SAMPLE_SIZE);
  const buckets = new Map<string, ColorBucket>();

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] ?? 0;
    if (alpha < 180) continue;

    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
    if (saturation < 0.08 || lightness < 0.12 || lightness > 0.9) continue;

    const key = getColorBucketKey(hue, saturation, lightness);
    const bucket = buckets.get(key) ?? {
      redTotal: 0,
      greenTotal: 0,
      blueTotal: 0,
      weightTotal: 0,
      count: 0,
      saturationTotal: 0,
      lightnessTotal: 0
    };
    const weight = 0.35 + saturation * 1.8 + clamp(1 - Math.abs(lightness - 0.54) * 1.6, 0, 1);
    bucket.redTotal += red * weight;
    bucket.greenTotal += green * weight;
    bucket.blueTotal += blue * weight;
    bucket.weightTotal += weight;
    bucket.count += 1;
    bucket.saturationTotal += saturation;
    bucket.lightnessTotal += lightness;
    buckets.set(key, bucket);
  }

  let selectedBucket: ColorBucket | null = null;
  let selectedScore = 0;

  for (const bucket of buckets.values()) {
    const score = scoreColorBucket(bucket);
    if (score > selectedScore) {
      selectedBucket = bucket;
      selectedScore = score;
    }
  }

  if (!selectedBucket || selectedBucket.weightTotal <= 0) {
    return null;
  }

  const [hue, saturation, lightness] = rgbToHsl(
    selectedBucket.redTotal / selectedBucket.weightTotal,
    selectedBucket.greenTotal / selectedBucket.weightTotal,
    selectedBucket.blueTotal / selectedBucket.weightTotal
  );
  const boostedSaturation = clamp(saturation * 1.16, 0.4, 0.86);
  const boostedLightness = clamp(lightness * 1.04, 0.42, 0.66);

  return `hsl(${Math.round(hue)} ${Math.round(boostedSaturation * 100)}% ${Math.round(boostedLightness * 100)}%)`;
};

const runWhenIdle = (callback: () => void, timeout = 1500) => {
  const requestIdle = window.requestIdleCallback;
  if (typeof requestIdle === 'function') {
    requestIdle(callback, { timeout });
    return;
  }

  window.setTimeout(callback, 0);
};

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
    let trackUrl = playButton.dataset.trackUrl ?? '';
    let isLive = root.dataset.nowPlaying === 'true';
    const hasInitialTrack = root.dataset.hasInitialTrack === 'true';
    const isStatic = root.dataset.static === 'true';
    const playbackRequest = {
      catalogId: playButton.dataset.appleCatalogId ?? '',
      previewUrl: playButton.dataset.previewUrl ?? '',
    };

    const updateArtworkAccent = () => {
      if (!(artwork instanceof HTMLImageElement)) {
        return;
      }

      const artworkSrc = artwork.currentSrc || artwork.src;
      if (!artworkSrc || artwork.naturalWidth === 0) {
        return;
      }

      const cachedAccent = artworkAccentCache.get(artworkSrc);
      if (cachedAccent) {
        root.style.setProperty('--listening-accent', cachedAccent);
        return;
      }

      runWhenIdle(() => {
        try {
          const accent = sampleArtworkAccent(artwork);
          if (!accent) return;
          artworkAccentCache.set(artworkSrc, accent);
          root.style.setProperty('--listening-accent', accent);
        } catch {
          root.style.removeProperty('--listening-accent');
        }
      });
    };

    if (artwork instanceof HTMLImageElement) {
      artwork.addEventListener('load', updateArtworkAccent);
    }

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

    const setPlaybackState = (isPlaying: boolean) => {
      root.classList.toggle('is-preview-playing', isPlaying);
      playButton.classList.toggle('is-preview-playing', isPlaying);
      playButton.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
      if (isPlaying) {
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

      if (changed && musicKitPlayer.snapshot().owner === playbackRequest) {
        musicKitPlayer.pause();
      }

      playbackRequest.catalogId = catalogId;
      playbackRequest.previewUrl = previewUrl;
      playButton.dataset.appleCatalogId = catalogId;
      playButton.dataset.previewUrl = previewUrl;
      setPlaybackState(false);
    };

    const formatPlayedAt = (playedAt: string) => {
      const date = new Date(playedAt);
      if (!Number.isFinite(date.getTime())) {
        return '';
      }

      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric'
      }).format(date);
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

      trackTitle = nextTitle;
      trackUrl = nextLink;
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
          root.style.removeProperty('--listening-accent');
          artwork.src = nextArtwork;
        } else if (artwork.complete) {
          updateArtworkAccent();
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
    musicKitPlayer.subscribe((snapshot) => {
      const ours = snapshot.owner === playbackRequest;
      const playing = ours && snapshot.isPlaying;
      if (wasPlaying && !playing) freezeCurrentRecordRotation();
      setPlaybackState(playing);
      wasPlaying = playing;

      const duration = ours ? snapshot.duration : 0;
      const current = ours ? snapshot.currentTime : 0;
      const fraction = duration > 0 ? Math.min(1, current / duration) : 0;
      syncProgress(fraction);
      if (elapsedEl) elapsedEl.textContent = formatTime(current);
      if (totalEl) totalEl.textContent = duration > 0 ? formatTime(duration) : '';
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
