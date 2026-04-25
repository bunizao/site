export interface ListeningTrack {
  id: string;
  title: string;
  artist: string;
  collection: string;
  appleMusicUrl: string;
  artworkUrl: string;
  thumbUrl: string;
  previewUrl: string;
  year: string;
  genre: string;
  releaseKind: 'album' | 'single';
  trackNumber: string;
  trackCount: string;
}

interface DemoSeedTrack {
  appleMusicUrl: string;
  fallback: ListeningTrack;
}

interface AppleLookupResponse {
  results?: Array<{
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
  }>;
}

const DEMO_TRACKS: DemoSeedTrack[] = [
  {
    appleMusicUrl: 'https://music.apple.com/tw/album/all-the-love/1888707282?i=1888707290&l=en-GB',
    fallback: {
      id: '1888707290',
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
      trackCount: '18'
    }
  }
];

function parseTrackId(appleMusicUrl: string): string {
  try {
    const url = new URL(appleMusicUrl);
    return url.searchParams.get('i') ?? '';
  } catch {
    return '';
  }
}

function parseStorefront(appleMusicUrl: string): string {
  try {
    const url = new URL(appleMusicUrl);
    const storefront = url.pathname.split('/').filter(Boolean)[0];
    return storefront || 'us';
  } catch {
    return 'us';
  }
}

function upscaleArtwork(artworkUrl: string, size: string): string {
  return artworkUrl.replace(/\/\d+x\d+bb\.jpg$/u, `/${size}`);
}

function normalizeReleaseKind(trackCount: number | undefined): ListeningTrack['releaseKind'] {
  return typeof trackCount === 'number' && trackCount > 1 ? 'album' : 'single';
}

async function fetchTrack(seed: DemoSeedTrack): Promise<ListeningTrack> {
  const trackId = parseTrackId(seed.appleMusicUrl);
  if (!trackId) {
    return seed.fallback;
  }

  const storefront = parseStorefront(seed.appleMusicUrl);
  const response = await fetch(`https://itunes.apple.com/lookup?id=${trackId}&country=${storefront}`);
  if (!response.ok) {
    throw new Error(`Apple lookup failed with ${response.status}`);
  }

  const payload = await response.json() as AppleLookupResponse;
  const track = payload.results?.[0];
  if (!track?.trackName || !track.artistName) {
    throw new Error('Apple lookup returned an empty result');
  }

  const artworkBase = track.artworkUrl100 || seed.fallback.thumbUrl;
  const releaseDate = track.releaseDate ? new Date(track.releaseDate) : null;

  return {
    id: String(track.trackId ?? trackId),
    title: track.trackName,
    artist: track.artistName,
    collection: track.collectionName || seed.fallback.collection,
    appleMusicUrl: seed.appleMusicUrl,
    artworkUrl: upscaleArtwork(artworkBase, '600x600bb.jpg'),
    thumbUrl: artworkBase,
    previewUrl: track.previewUrl || seed.fallback.previewUrl,
    year: Number.isFinite(releaseDate?.getUTCFullYear()) ? String(releaseDate?.getUTCFullYear()) : seed.fallback.year,
    genre: track.primaryGenreName || seed.fallback.genre,
    releaseKind: normalizeReleaseKind(track.trackCount),
    trackNumber: track.trackNumber ? String(track.trackNumber) : seed.fallback.trackNumber,
    trackCount: track.trackCount ? String(track.trackCount) : seed.fallback.trackCount
  };
}

export async function getListeningTracks(): Promise<ListeningTrack[]> {
  const results = await Promise.allSettled(DEMO_TRACKS.map((seed) => fetchTrack(seed)));

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    console.warn('Falling back to demo listening data:', result.reason);
    return DEMO_TRACKS[index].fallback;
  });
}
