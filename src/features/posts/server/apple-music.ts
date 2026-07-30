import appleLogo from '@/assets/apple-logo.svg?raw';

// Apple Music embeds are heavy cross-origin iframes that clash with the calm
// blog type. We swap them for a static "listening" card — the same vinyl idiom
// as the homepage now-playing widget — by resolving each track's metadata at
// build time. Posts are prerendered, so there is no client request and no CORS
// to fight. A lookup failure leaves the original embed untouched, so a flaky
// network degrades to Ghost's default, never a gap.

interface AppleTrack {
  id: string;
  title: string;
  artist: string;
  collection: string;
  artworkUrl: string;
  previewUrl: string;
  year: string;
  url: string;
}

interface ItunesResult {
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  releaseDate?: string;
  trackViewUrl?: string;
  collectionViewUrl?: string;
}

interface AmpSongResponse {
  data?: Array<{
    attributes?: {
      previews?: Array<{ url?: string }>;
    };
  }>;
}

interface AmpTokenResult {
  token: string;
  expiresAtSeconds: number;
}

const lookupCache = new Map<string, AppleTrack | null>();
const metadataLookupCache = new Map<string, AppleTrack | null>();
let ampTokenPromise: Promise<AmpTokenResult | null> | null = null;
let ampTokenResult: AmpTokenResult | null = null;

// Resolve every kg-embed-card iframe; a bare iframe without the figure wrapper
// is the fallback. Both capture the iframe src in group 1 (or 2 for the figure).
const EMBED_FIGURE_RE =
  /<figure[^>]*class="[^"]*kg-embed-card[^"]*"[^>]*>\s*<iframe[^>]*\bsrc="([^"]*)"[^>]*>\s*<\/iframe>\s*<\/figure>/gi;
const BARE_IFRAME_RE =
  /<iframe[^>]*\bsrc="([^"]*)"[^>]*>\s*<\/iframe>/gi;
const SRC_SCAN_RE = /<iframe[^>]*\bsrc="([^"]*)"/gi;
const HTML_ATTRIBUTE_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&#38;': '&',
  '&#x26;': '&',
  '&quot;': '"',
};
const AMP_STOREFRONT = 'us';
const AMP_ORIGIN = 'https://embed.music.apple.com';
const AMP_ENTRY_URL = 'https://embed.music.apple.com/build/web-embed.esm.js';
const AMP_BUILD_BASE = 'https://embed.music.apple.com/build/';
const AMP_TOKEN_REFRESH_MARGIN_SECONDS = 24 * 60 * 60;
const AMP_MAX_CHUNKS_TO_SCAN = 8;
const AMP_JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{32,}\b/g;
const AMP_ENTRY_CHUNK_RE = /["'](p-[a-f0-9]+)["'],\[\[1,["']embed-root["']/;
const AMP_CHUNK_RE = /["'](p-[a-f0-9]+)["']/g;

function decodeHtmlAttribute(value: string): string {
  return value.replace(/&(amp|#38|#x26|quot);/giu, (entity) =>
    HTML_ATTRIBUTE_ENTITIES[entity.toLowerCase()] ?? entity
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Prefer the song id (?i=) when present, else the album/song id in the path.
function extractAppleId(rawUrl: string): string | null {
  try {
    const url = new URL(decodeHtmlAttribute(rawUrl));
    if (!/(^|\.)music\.apple\.com$/u.test(url.hostname)) return null;
    const songId = url.searchParams.get('i');
    if (songId) return songId;
    const pathId = url.pathname.match(/\/(\d+)\/?$/u);
    return pathId ? pathId[1] : null;
  } catch {
    return null;
  }
}

function upscaleArtwork(url: string, size: string): string {
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/u, `/${size}`);
}

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    const decoded = atob(
      value
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(value.length / 4) * 4, '='),
    );
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

function readJwtExpirySeconds(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;

  const decoded = decodeBase64UrlJson<{ exp?: unknown }>(payload);
  return typeof decoded?.exp === 'number' ? decoded.exp : null;
}

function isFreshAmpToken(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const expSeconds = readJwtExpirySeconds(token);
  return typeof expSeconds === 'number' && expSeconds - nowSeconds > AMP_TOKEN_REFRESH_MARGIN_SECONDS;
}

function bestAmpTokenFromSource(source: string): AmpTokenResult | null {
  const nowSeconds = Math.floor(Date.now() / 1000);
  let best: AmpTokenResult | null = null;

  for (const match of source.matchAll(AMP_JWT_RE)) {
    const token = match[0];
    if (!isFreshAmpToken(token, nowSeconds)) continue;

    const expiresAtSeconds = readJwtExpirySeconds(token)!;
    if (!best || expiresAtSeconds > best.expiresAtSeconds) {
      best = { token, expiresAtSeconds };
    }
  }

  return best;
}

function discoverAmpChunkNames(entrySource: string): string[] {
  const preferred = entrySource.match(AMP_ENTRY_CHUNK_RE)?.[1];
  const chunks = [...entrySource.matchAll(AMP_CHUNK_RE)].map((match) => match[1]);
  return [...new Set([preferred, ...chunks].filter(Boolean) as string[])]
    .slice(0, AMP_MAX_CHUNKS_TO_SCAN);
}

async function scrapeAmpWebToken(): Promise<AmpTokenResult | null> {
  const entryResponse = await fetch(AMP_ENTRY_URL, {
    headers: { Accept: 'application/javascript' },
  });
  if (!entryResponse.ok) return null;

  const entrySource = await entryResponse.text();
  const entryToken = bestAmpTokenFromSource(entrySource);
  if (entryToken) return entryToken;

  const chunkNames = discoverAmpChunkNames(entrySource);
  const chunkSources = await Promise.all(
    chunkNames.map(async (chunkName) => {
      const chunkResponse = await fetch(`${AMP_BUILD_BASE}${chunkName}.entry.js`, {
        headers: { Accept: 'application/javascript' },
      });
      return chunkResponse.ok ? chunkResponse.text() : '';
    }),
  );

  return bestAmpTokenFromSource(chunkSources.join('\n'));
}

async function getAmpWebToken(): Promise<string | null> {
  if (ampTokenResult && isFreshAmpToken(ampTokenResult.token)) {
    return ampTokenResult.token;
  }

  ampTokenPromise ??= scrapeAmpWebToken()
    .catch(() => null)
    .finally(() => {
      ampTokenPromise = null;
    });
  const result = await ampTokenPromise;
  ampTokenResult = result && isFreshAmpToken(result.token) ? result : null;
  return ampTokenResult?.token ?? null;
}

async function lookupExtendedPreviewUrl(id: string): Promise<string | null> {
  try {
    const token = await getAmpWebToken();
    if (!token) return null;

    const response = await fetch(`https://amp-api.music.apple.com/v1/catalog/${AMP_STOREFRONT}/songs/${id}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        Origin: AMP_ORIGIN,
      },
    });
    if (!response.ok) return null;

    const payload = await response.json() as AmpSongResponse;
    const url = payload.data?.[0]?.attributes?.previews?.[0]?.url;
    return url?.includes('.ep.') ? url : null;
  } catch {
    return null;
  }
}

function getE2EAppleTrack(id: string): AppleTrack | null {
  if (process.env.E2E_SITE_FIXTURE !== '1') {
    return null;
  }

  return {
    id,
    title: id === '1888707290' ? 'ALL THE LOVE' : 'E2E Apple Music Track',
    artist: 'E2E Artist',
    collection: 'E2E Collection',
    artworkUrl: '/avatar.webp',
    previewUrl: `https://example.com/e2e-apple-preview-${id}.m4a`,
    year: '2026',
    url: `https://music.apple.com/us/song/e2e/${id}`,
  };
}

async function lookupAppleTrackMetadata(id: string): Promise<AppleTrack | null> {
  if (metadataLookupCache.has(id)) return metadataLookupCache.get(id) ?? null;
  const e2eTrack = getE2EAppleTrack(id);
  if (e2eTrack) {
    metadataLookupCache.set(id, e2eTrack);
    return e2eTrack;
  }

  let track: AppleTrack | null = null;
  try {
    const endpoint = new URL('https://itunes.apple.com/lookup');
    endpoint.searchParams.set('id', id);
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
    if (response.ok) {
      const data = (await response.json()) as { results?: ItunesResult[] };
      const result = data.results?.[0];
      if (result) {
        const artwork = result.artworkUrl100 ?? '';
        const release = result.releaseDate ? new Date(result.releaseDate) : null;
        track = {
          id,
          title: result.trackName ?? result.collectionName ?? 'Unknown track',
          artist: result.artistName ?? '',
          collection: result.collectionName ?? '',
          artworkUrl: artwork ? upscaleArtwork(artwork, '256x256bb.jpg') : '',
          previewUrl: result.previewUrl ?? '',
          year:
            release && Number.isFinite(release.getUTCFullYear())
              ? String(release.getUTCFullYear())
              : '',
          url: result.trackViewUrl ?? result.collectionViewUrl ?? '',
        };
      }
    }
  } catch {
    track = null;
  }

  metadataLookupCache.set(id, track);
  return track;
}

async function lookupAppleTrack(id: string): Promise<AppleTrack | null> {
  if (lookupCache.has(id)) return lookupCache.get(id) ?? null;

  const metadata = await lookupAppleTrackMetadata(id);
  if (!metadata) {
    lookupCache.set(id, null);
    return null;
  }
  if (process.env.E2E_SITE_FIXTURE === '1') {
    lookupCache.set(id, metadata);
    return metadata;
  }

  const extendedPreviewUrl = await lookupExtendedPreviewUrl(id);
  const track = extendedPreviewUrl
    ? { ...metadata, previewUrl: extendedPreviewUrl }
    : metadata;
  lookupCache.set(id, track);
  return track;
}

export interface AppleMusicTrackLink {
  title: string;
  url: string;
}

export async function resolveAppleMusicTrackLink(
  id: string,
): Promise<AppleMusicTrackLink | null> {
  const track = await lookupAppleTrackMetadata(id);
  if (!track?.url) return null;

  try {
    const url = new URL(track.url);
    if (url.protocol !== 'https:' || !/(^|\.)music\.apple\.com$/u.test(url.hostname)) {
      return null;
    }
    url.hash = '';
    return { title: track.title, url: url.toString() };
  } catch {
    return null;
  }
}

const PLAY_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>';
const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>';


// The grooved record + swinging tonearm, mirroring the homepage now-playing
// widget. Built once as a constant so each card just stamps it out.
const RECORD = '<span class="blog-music__record" aria-hidden="true"></span>';

// Apple Music lockup ( Music) pressed into the vinyl, in the groove ring
// below the center label. It rotates with the disc during playback — like the
// printed text on a real 45 — sitting upright at rest. The Apple glyph is the
// SVG asset; "Music" is live text so it tracks the type system. The whole
// lockup spins via the shared --record-rotation, same as the record/cover.
function renderVinylLabel(): string {
  const logo = appleLogo.replace('<svg ', '<svg class="blog-music__label-logo" aria-hidden="true" ');
  return [
    `<span class="blog-music__label" role="img" aria-label="Apple Music">`,
    `<span class="blog-music__label-lockup">${logo}<span class="blog-music__label-text">Music</span></span>`,
    `</span>`,
  ].join('');
}

const TONEARM = [
  '<svg class="blog-music__tonearm" viewBox="0 0 96 84" aria-hidden="true">',
  '<g class="blog-music__tonearm-arm">',
  '<path d="M20 15 C33 24 45 39 58 56" class="blog-music__tonearm-shaft" />',
  '<rect x="54" y="53" width="17" height="7" rx="2" class="blog-music__tonearm-cartridge" transform="rotate(48 62.5 56.5)" />',
  '<circle cx="20" cy="15" r="7" class="blog-music__tonearm-pivot" />',
  '<circle cx="20" cy="15" r="2.8" class="blog-music__tonearm-hole" />',
  '</g>',
  '</svg>',
].join('');

function renderMusicCard(track: AppleTrack): string {
  const title = escapeHtml(track.title);
  // Artist + year are the only context line — the album name was dropped: inside
  // an inline prose card it read as noise, and the title already carries the song.
  const meta = [track.artist, track.year]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' <span class="blog-music__dot" aria-hidden="true"></span> ');
  const hasPreview = Boolean(track.previewUrl);
  // Playable if it can stream the full track (catalog id) or at least the
  // preview floor. MusicKit subscribers get the full song; everyone else preview.
  const canPlay = hasPreview || Boolean(track.id);
  // crossorigin lets Prose.astro sample an accent off the artwork canvas, the
  // same trick the homepage widget uses. Falls back gracefully if it fails.
  const cover = track.artworkUrl
    ? `<img class="blog-music__cover" src="${escapeHtml(track.artworkUrl)}" alt="" width="56" height="56" loading="lazy" decoding="async" crossorigin="anonymous" referrerpolicy="no-referrer" data-blog-music-artwork />`
    : '';
  const link = track.url ? escapeHtml(track.url) : '';
  // The title is duplicated for the marquee: when it overflows, Prose.astro
  // clones the run so it can scroll seamlessly. The duplicate is hidden until then.
  const titleInner = [
    `<span class="blog-music__title-text" data-blog-music-title-text>`,
    `<span data-blog-music-title-label>${title}</span>`,
    `<span class="blog-music__title-dupe" data-blog-music-title-dupe aria-hidden="true">${title}</span>`,
    `</span>`,
  ].join('');
  const titleEl = link
    ? `<a class="blog-music__title" href="${link}" target="_blank" rel="noopener noreferrer" data-blog-music-title>${titleInner}</a>`
    : `<span class="blog-music__title" data-blog-music-title>${titleInner}</span>`;

  return [
    // Player chrome (title, "Full track", timestamps) is UI, not prose —
    // keep it out of the Pagefind excerpt index.
    `<figure class="kg-card blog-music" data-blog-music data-pagefind-ignore>`,
    `<button class="blog-music__art" type="button" data-blog-music-play data-apple-catalog-id="${escapeHtml(track.id)}" data-preview-url="${escapeHtml(track.previewUrl)}"${canPlay ? '' : ' disabled'} aria-pressed="false" aria-label="${canPlay ? `Play ${title}` : `${title}`}">`,
    `<span class="blog-music__frame">`,
    RECORD,
    cover,
    renderVinylLabel(),
    `<span class="blog-music__icons" aria-hidden="true"><span class="blog-music__icon blog-music__icon--play">${PLAY_ICON}</span><span class="blog-music__icon blog-music__icon--pause">${PAUSE_ICON}</span></span>`,
    `</span>`,
    TONEARM,
    `</button>`,
    `<figcaption class="blog-music__copy">`,
    // Title row: the song title, plus a playing-only equalizer wave and a source
    // pill that lights up only when MusicKit is actually streaming the full track
    // (not the preview). The wave/pill replace the old album eyebrow.
    `<div class="blog-music__title-row">`,
    titleEl,
    `<span class="blog-music__wave" aria-hidden="true"><span></span><span></span><span></span><span></span></span>`,
    `<span class="blog-music__source" data-blog-music-source aria-hidden="true">Full track</span>`,
    `</div>`,
    meta ? `<span class="blog-music__meta">${meta}</span>` : '',
    // Progress row sits at the bottom of the copy column. Hidden until the
    // card becomes the active owner — same calm rest state as before.
    `<div class="blog-music__progress-row" data-blog-music-progress-row>`,
    `<span class="blog-music__time blog-music__time--elapsed" data-blog-music-elapsed>0:00</span>`,
    `<div class="blog-music__progress" data-blog-music-progress role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">`,
    `<div class="blog-music__progress-track"></div>`,
    `<div class="blog-music__progress-fill" data-blog-music-fill></div>`,
    `<div class="blog-music__progress-thumb" aria-hidden="true"></div>`,
    `</div>`,
    `<span class="blog-music__time blog-music__time--total" data-blog-music-total></span>`,
    `</div>`,
    `</figcaption>`,
    `</figure>`,
  ].join('');
}

export async function enrichAppleMusicEmbeds(html: string): Promise<string> {
  if (!html) {
    return html;
  }

  // Resolve every unique Apple Music URL once, keyed by the raw src as written
  // in the markup so the synchronous replace pass can look each one up.
  const sources = [...html.matchAll(SRC_SCAN_RE)].map((match) => match[1]);
  const tracks = new Map<string, AppleTrack>();

  await Promise.all(
    [...new Set(sources)].map(async (src) => {
      const id = extractAppleId(src);
      if (!id) return;
      const track = await lookupAppleTrack(id);
      if (track) tracks.set(src, track);
    }),
  );

  if (tracks.size === 0) {
    return html;
  }

  const swap = (original: string, src: string) =>
    tracks.has(src) ? renderMusicCard(tracks.get(src)!) : original;

  return html
    .replace(EMBED_FIGURE_RE, (full, src: string) => swap(full, src))
    .replace(BARE_IFRAME_RE, (full, src: string) => swap(full, src));
}

export function resetAppleMusicEmbedLookupCacheForTests(): void {
  lookupCache.clear();
  metadataLookupCache.clear();
  ampTokenPromise = null;
  ampTokenResult = null;
}
