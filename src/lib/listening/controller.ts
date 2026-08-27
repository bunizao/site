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
// Accent sampling. The artwork is reduced to a small grid and bucketed in
// OKLCH: coverage decides which region of the cover wins, chroma decides
// whether that region is a color at all. Both gates exist because most album
// art is not colorful — a black-and-white photograph must stay black and
// white rather than be handed a hue invented from sensor noise.
// 48 is where the answer converges: measured against a 96x96 reference over a
// 226-cover corpus, 48 agrees on hue for 99% of covers and 32 for 97%.
const ARTWORK_SAMPLE_SIZE = 48;
const HUE_BUCKET_SIZE = 20;
const CHROMA_BUCKET_SIZE = 0.04;
const LIGHTNESS_BUCKET_SIZE = 0.22;
// Pixels this dark or this pale carry no reliable hue.
const MIN_PIXEL_LIGHTNESS = 0.1;
const MAX_PIXEL_LIGHTNESS = 0.95;
// If the 90th-percentile pixel is this close to grey, the whole cover is grey.
const MONOCHROME_CHROMA = 0.02;
// A winning region has to be this colorful and this large to be believed.
const MIN_ACCENT_CHROMA = 0.03;
// Raising this starves the page of color: over a 226-cover corpus, 0.045 sends
// 37% of covers to neutral against 25% here, and a winner at this floor still
// owns 4% of the frame at the 10th percentile.
const MIN_ACCENT_COVERAGE = 0.03;
// Past this, extra chroma stops earning a region any more ranking weight.
const CHROMA_KNEE = 0.11;
// Lightness the accent renders at, per theme. Kept here rather than in
// listening.css because the sRGB gamut boundary depends on lightness, so the
// chroma clamp below cannot be computed without them.
const ACCENT_LIGHTNESS = { light: 0.56, dark: 0.74 };

type ArtworkAccent = {
  hue: number;
  /** Chroma clamped into the sRGB gamut at each theme's lightness. */
  chromaLight: number;
  chromaDark: number;
};

// `null` is a real cached answer ("this cover has no accent"), so reads go
// through `has()` rather than treating a missing entry as uncached.
const artworkAccentCache = new Map<string, ArtworkAccent | null>();
const playedAtDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

// Averaged in OKLab, not OKLCH: hue is an angle and averaging it directly
// breaks across the 0/360 wrap.
type ColorBucket = {
  aTotal: number;
  bTotal: number;
  count: number;
};

const linearize = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

/** sRGB bytes to OKLab. Returns [lightness, a, b]. */
const rgbToOklab = (red: number, green: number, blue: number): [number, number, number] => {
  const r = linearize(red);
  const g = linearize(green);
  const b = linearize(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  ];
};

const hueOf = (a: number, b: number): number => (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;

/** OKLab to linear sRGB, before the transfer function and without clipping. */
const oklabToLinearRgb = (L: number, a: number, b: number): [number, number, number] => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ];
};

/**
 * Largest chroma that still fits in sRGB at this lightness and hue.
 *
 * The gamut boundary swings hard with hue — at L 0.56 a magenta holds 0.269
 * and a cyan only 0.095 — so a single constant cap either clips or wastes
 * range. Clipping is not harmless: the browser gamut-maps out-of-range colors
 * with an algorithm of its choosing, which moves hue as well as chroma.
 */
const maxChroma = (lightness: number, hue: number): number => {
  const radians = hue * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  let low = 0;
  let high = 0.4;

  for (let step = 0; step < 20; step += 1) {
    const mid = (low + high) / 2;
    const rgb = oklabToLinearRgb(lightness, mid * cos, mid * sin);
    if (rgb.every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4)) low = mid;
    else high = mid;
  }

  return low;
};

/**
 * Pick the artwork's accent as chroma + hue, leaving lightness to CSS so one
 * sample serves both themes. Returns null when the cover has no color worth
 * showing — the caller falls back to the neutral foreground.
 */
const sampleArtworkAccent = (image: HTMLImageElement): ArtworkAccent | null => {
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
  const pixelChromas: number[] = [];

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] ?? 0;
    if (alpha < 180) continue;

    const [lightness, a, b] = rgbToOklab(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0);
    const chroma = Math.hypot(a, b);
    pixelChromas.push(chroma);

    if (lightness < MIN_PIXEL_LIGHTNESS || lightness > MAX_PIXEL_LIGHTNESS) continue;

    const key = `${Math.floor(hueOf(a, b) / HUE_BUCKET_SIZE)}`
      + `:${Math.floor(chroma / CHROMA_BUCKET_SIZE)}`
      + `:${Math.floor(lightness / LIGHTNESS_BUCKET_SIZE)}`;
    const bucket = buckets.get(key) ?? { aTotal: 0, bTotal: 0, count: 0 };
    bucket.aTotal += a;
    bucket.bTotal += b;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  if (!pixelChromas.length) {
    return null;
  }

  // Whole-image gate, independent of how the buckets fell: a greyscale cover
  // has no dominant hue, only the most-saturated noise.
  pixelChromas.sort((first, second) => first - second);
  const chromaCeiling = pixelChromas[Math.floor(pixelChromas.length * 0.9)] ?? 0;
  if (chromaCeiling < MONOCHROME_CHROMA) {
    return null;
  }

  let selected: ArtworkAccent | null = null;
  let selectedScore = 0;

  for (const bucket of buckets.values()) {
    const a = bucket.aTotal / bucket.count;
    const b = bucket.bTotal / bucket.count;
    const chroma = Math.hypot(a, b);
    const coverage = bucket.count / pixelChromas.length;
    if (chroma < MIN_ACCENT_CHROMA || coverage < MIN_ACCENT_COVERAGE) continue;

    // Coverage leads; chroma only breaks ties. Ranking by saturation instead
    // is how a 2%-of-the-frame sticker beats the wall behind it.
    const score = coverage * (0.15 + 0.85 * Math.min(chroma, CHROMA_KNEE) / CHROMA_KNEE);
    if (score <= selectedScore) continue;

    const hue = hueOf(a, b);
    selectedScore = score;
    selected = {
      hue,
      chromaLight: Math.min(chroma, maxChroma(ACCENT_LIGHTNESS.light, hue)),
      chromaDark: Math.min(chroma, maxChroma(ACCENT_LIGHTNESS.dark, hue))
    };
  }

  return selected;
};

const ACCENT_PROPERTIES = [
  '--listening-accent-h',
  '--listening-accent-l-light',
  '--listening-accent-l-dark',
  '--listening-accent-c-light',
  '--listening-accent-c-dark'
] as const;

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

    // One hue plus a lightness/chroma pair per theme; listening.css selects the
    // pair. data-accent is the switch between the sampled color and the neutral
    // foreground default.
    const applyAccent = (accent: ArtworkAccent | null) => {
      if (!accent) {
        delete root.dataset.accent;
        for (const name of ACCENT_PROPERTIES) root.style.removeProperty(name);
        return;
      }

      root.dataset.accent = '';
      root.style.setProperty('--listening-accent-h', accent.hue.toFixed(1));
      root.style.setProperty('--listening-accent-l-light', String(ACCENT_LIGHTNESS.light));
      root.style.setProperty('--listening-accent-l-dark', String(ACCENT_LIGHTNESS.dark));
      root.style.setProperty('--listening-accent-c-light', accent.chromaLight.toFixed(3));
      root.style.setProperty('--listening-accent-c-dark', accent.chromaDark.toFixed(3));
    };

    const updateArtworkAccent = () => {
      if (!(artwork instanceof HTMLImageElement)) {
        return;
      }

      const artworkSrc = artwork.currentSrc || artwork.src;
      if (!artworkSrc || artwork.naturalWidth === 0) {
        return;
      }

      if (artworkAccentCache.has(artworkSrc)) {
        applyAccent(artworkAccentCache.get(artworkSrc) ?? null);
        return;
      }

      runWhenIdle(() => {
        try {
          const accent = sampleArtworkAccent(artwork);
          artworkAccentCache.set(artworkSrc, accent);
          applyAccent(accent);
        } catch {
          applyAccent(null);
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
          applyAccent(null);
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
