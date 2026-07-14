import { readEnv } from '@/lib/runtime/env';
import type { ListeningTrack } from '@/features/home/types';

export type { ListeningTrack } from '@/features/home/types';

export interface ListeningResult {
  track: ListeningTrack;
  configured: boolean;
  source: 'lastfm' | 'fallback';
}

interface RuntimeLocals {
  runtime?: {
    env?: Record<string, unknown>;
  };
  env?: Record<string, unknown>;
}

interface AppleSearchResponse {
  results?: Array<AppleLookupTrack>;
}

interface AppleLookupTrack {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  trackViewUrl?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  trackCount?: number;
  trackNumber?: number;
  collectionType?: string;
}

interface LastFmRecentTracksResponse {
  recenttracks?: {
    track?: LastFmTrack | LastFmTrack[];
  };
  error?: number;
  message?: string;
}

interface LastFmImage {
  size?: string;
  '#text'?: string;
}

interface LastFmTextValue {
  '#text'?: string;
}

interface LastFmNamedValue {
  name?: string;
  '#text'?: string;
}

interface LastFmTrack {
  name?: string;
  artist?: LastFmNamedValue | string;
  album?: LastFmTextValue | string;
  url?: string;
  image?: LastFmImage[];
  date?: {
    uts?: string;
    '#text'?: string;
  };
  '@attr'?: {
    nowplaying?: string;
  };
}

interface LastFmConfig {
  apiKey: string;
  user: string;
}

// Also the deterministic demo track for the /components showcase specimen: a
// real Apple Music song with a working preview URL, so the specimen plays
// without any live Last.fm/API call.
export const FALLBACK_TRACK: ListeningTrack = {
  id: '1888707290',
  appleCatalogId: '1888707290',
  catalogId: '1888707290',
  title: 'ALL THE LOVE',
  artist: 'Kanye West & Andre Troutman',
  collection: 'BULLY',
  appleMusicUrl: 'https://music.apple.com/tw/album/all-the-love/1888707282?i=1888707290&l=en-GB',
  artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/4b/38/d1/4b38d146-381d-ace2-73df-24074576e62b/656465138828_cover.jpg/600x600bb.jpg',
  thumbUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/4b/38/d1/4b38d146-381d-ace2-73df-24074576e62b/656465138828_cover.jpg/100x100bb.jpg',
  previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/0d/a6/f0/0da6f0f2-0145-676d-9f9c-d28c7e08f258/mzaf_2658965377541339594.plus.aac.p.m4a',
  year: '2026',
  genre: 'Hip-Hop/Rap',
  releaseKind: 'album',
  trackNumber: '4',
  trackCount: '18',
  sourceUrl: 'https://music.apple.com/tw/album/all-the-love/1888707282?i=1888707290&l=en-GB',
  isNowPlaying: true,
  playedAt: ''
};

const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';

function upscaleArtwork(artworkUrl: string, size: string): string {
  return artworkUrl.replace(/\/\d+x\d+bb\.jpg$/u, `/${size}`);
}

function normalizeReleaseKind(trackCount: number | undefined): ListeningTrack['releaseKind'] {
  return typeof trackCount === 'number' && trackCount > 1 ? 'album' : 'single';
}

function getFallbackTrack(): ListeningTrack {
  return FALLBACK_TRACK;
}

function getLastFmConfig(locals?: RuntimeLocals): LastFmConfig | null {
  const apiKey = readEnv(locals, 'LASTFM_API_KEY');
  const user = readEnv(locals, 'LASTFM_USER') || readEnv(locals, 'LASTFM_USERNAME');

  if (!apiKey || !user) {
    return null;
  }

  return { apiKey, user };
}

function readTextValue(value: LastFmNamedValue | LastFmTextValue | string | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if ('name' in value && value.name) return value.name.trim();
  return (value['#text'] ?? '').trim();
}

function selectLastFmImage(images: LastFmImage[] | undefined): string {
  if (!images?.length) return '';

  const preferredSizes = ['extralarge', 'large', 'medium', 'small'];
  for (const size of preferredSizes) {
    const match = images.find((image) => image.size === size && image['#text']);
    if (match?.['#text']) return match['#text'];
  }

  return images.find((image) => image['#text'])?.['#text'] ?? '';
}

function normalizeLastFmTrack(track: LastFmTrack): ListeningTrack | null {
  const title = track.name?.trim() ?? '';
  const artist = readTextValue(track.artist);
  if (!title || !artist) {
    return null;
  }

  const album = readTextValue(track.album);
  const sourceUrl = track.url?.trim() || `https://www.last.fm/music/${encodeURIComponent(artist)}/_/${encodeURIComponent(title)}`;
  const artworkUrl = selectLastFmImage(track.image);
  const playedAt = track.date?.uts
    ? new Date(Number(track.date.uts) * 1000).toISOString()
    : '';

  return {
    id: `${artist}:${title}`.toLowerCase(),
    appleCatalogId: '',
    title,
    artist,
    collection: album,
    appleMusicUrl: sourceUrl,
    artworkUrl: artworkUrl || getFallbackTrack().artworkUrl,
    thumbUrl: artworkUrl || getFallbackTrack().thumbUrl,
    previewUrl: '',
    year: '',
    genre: '',
    releaseKind: 'single',
    trackNumber: '',
    trackCount: '',
    sourceUrl,
    isNowPlaying: track['@attr']?.nowplaying === 'true',
    playedAt
  };
}

function mergeAppleTrack(track: ListeningTrack, appleTrack: AppleLookupTrack | undefined): ListeningTrack {
  if (!appleTrack) {
    return track;
  }

  const artworkBase = appleTrack.artworkUrl100 || track.thumbUrl;
  const releaseDate = appleTrack.releaseDate ? new Date(appleTrack.releaseDate) : null;
  const year = Number.isFinite(releaseDate?.getUTCFullYear())
    ? String(releaseDate?.getUTCFullYear())
    : track.year;

  return {
    ...track,
    id: String(appleTrack.trackId ?? track.id),
    appleCatalogId: appleTrack.trackId ? String(appleTrack.trackId) : track.appleCatalogId,
    catalogId: appleTrack.trackId ? String(appleTrack.trackId) : track.catalogId,
    title: appleTrack.trackName || track.title,
    artist: appleTrack.artistName || track.artist,
    collection: appleTrack.collectionName || track.collection,
    appleMusicUrl: appleTrack.trackViewUrl || track.appleMusicUrl,
    artworkUrl: artworkBase ? upscaleArtwork(artworkBase, '600x600bb.jpg') : track.artworkUrl,
    thumbUrl: artworkBase || track.thumbUrl,
    previewUrl: appleTrack.previewUrl || track.previewUrl,
    year,
    genre: appleTrack.primaryGenreName || track.genre,
    releaseKind: normalizeReleaseKind(appleTrack.trackCount),
    trackNumber: appleTrack.trackNumber ? String(appleTrack.trackNumber) : track.trackNumber,
    trackCount: appleTrack.trackCount ? String(appleTrack.trackCount) : track.trackCount
  };
}

async function enrichWithApple(track: ListeningTrack): Promise<ListeningTrack> {
  const term = `${track.artist} ${track.title}`;
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', term);
  url.searchParams.set('media', 'music');
  url.searchParams.set('entity', 'song');
  url.searchParams.set('limit', '1');

  const response = await fetch(url);
  if (!response.ok) {
    return track;
  }

  const payload = await response.json() as AppleSearchResponse;
  return mergeAppleTrack(track, payload.results?.[0]);
}

async function fetchLastFmTrack(config: LastFmConfig): Promise<ListeningTrack> {
  const url = new URL(LASTFM_API_URL);
  url.searchParams.set('method', 'user.getrecenttracks');
  url.searchParams.set('user', config.user);
  url.searchParams.set('api_key', config.apiKey);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('extended', '1');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Last.fm lookup failed with ${response.status}`);
  }

  const payload = await response.json() as LastFmRecentTracksResponse;
  if (payload.error) {
    throw new Error(payload.message || `Last.fm API error ${payload.error}`);
  }

  const rawTrack = Array.isArray(payload.recenttracks?.track)
    ? payload.recenttracks?.track[0]
    : payload.recenttracks?.track;
  if (!rawTrack) {
    throw new Error('Last.fm returned no recent tracks');
  }

  const normalizedTrack = normalizeLastFmTrack(rawTrack);
  if (!normalizedTrack) {
    throw new Error('Last.fm returned an incomplete track');
  }

  return enrichWithApple(normalizedTrack);
}

export async function getCurrentListeningTrack(locals?: RuntimeLocals): Promise<ListeningResult> {
  const config = getLastFmConfig(locals);
  if (!config) {
    return {
      track: getFallbackTrack(),
      configured: false,
      source: 'fallback'
    };
  }

  try {
    return {
      track: await fetchLastFmTrack(config),
      configured: true,
      source: 'lastfm'
    };
  } catch (error) {
    console.warn('Falling back to demo listening data:', error);
    return {
      track: getFallbackTrack(),
      configured: true,
      source: 'fallback'
    };
  }
}

export async function getListeningTracks(locals?: RuntimeLocals): Promise<ListeningTrack[]> {
  const result = await getCurrentListeningTrack(locals);
  return [result.track];
}
