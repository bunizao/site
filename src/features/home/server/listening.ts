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
    appleMusicUrl: 'https://music.apple.com/cn/album/protostar/1878155644?i=1878155653',
    fallback: {
      id: '1878155653',
      title: 'Protostar',
      artist: 'nano.RIPE',
      collection: 'Protostar - Single',
      appleMusicUrl: 'https://music.apple.com/cn/album/protostar/1878155644?i=1878155653',
      artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/87/08/f3/8708f395-d6f1-3ca3-ff1e-01a1d91f236d/4550753537538_cover.jpg/600x600bb.jpg',
      thumbUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/87/08/f3/8708f395-d6f1-3ca3-ff1e-01a1d91f236d/4550753537538_cover.jpg/100x100bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/56/3a/d5/563ad5ac-7b8a-c088-94d6-0bdea350609b/mzaf_16266990984437405405.plus.aac.p.m4a',
      year: '2026',
      genre: '摇滚',
      releaseKind: 'single',
      trackNumber: '1',
      trackCount: '1'
    }
  },
  {
    appleMusicUrl: 'https://music.apple.com/cn/album/nexus-podv-feat-laco/1551613716?i=1551614059',
    fallback: {
      id: '1551614059',
      title: 'NEXUS <PODv> (feat. Laco)',
      artist: 'SawanoHiroyuki[nZk]',
      collection: 'iv',
      appleMusicUrl: 'https://music.apple.com/cn/album/nexus-podv-feat-laco/1551613716?i=1551614059',
      artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/a6/57/07/a65707b7-954d-5437-0130-a6d66adcc0bf/4547366498042.jpg/600x600bb.jpg',
      thumbUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/a6/57/07/a65707b7-954d-5437-0130-a6d66adcc0bf/4547366498042.jpg/100x100bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/9c/eb/67/9ceb67e5-2801-f1df-2dd8-db0a0abdcc26/mzaf_14889878403714681399.plus.aac.p.m4a',
      year: '2021',
      genre: '摇滚',
      releaseKind: 'album',
      trackNumber: '16',
      trackCount: '16'
    }
  },
  {
    appleMusicUrl: 'https://music.apple.com/cn/album/%E3%81%BF%E3%81%A1%E3%81%97%E3%82%8B%E3%81%B9-movie-version/1826491265?i=1826491476',
    fallback: {
      id: '1826491476',
      title: 'みちしるべ ～Movie Version～',
      artist: 'Minori Chihara',
      collection: '「劇場版 ヴァイオレット・エヴァーガーデン」ボーカルアルバム Song letters',
      appleMusicUrl: 'https://music.apple.com/cn/album/%E3%81%BF%E3%81%A1%E3%81%97%E3%82%8B%E3%81%B9-movie-version/1826491265?i=1826491476',
      artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/40/58/5f/40585f61-22f5-68c0-cf06-9c2c0a884771/4540774907519.png/600x600bb.jpg',
      thumbUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/40/58/5f/40585f61-22f5-68c0-cf06-9c2c0a884771/4540774907519.png/100x100bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/dc/17/f4/dc17f42e-7736-3cd0-147a-b7f2407a1186/mzaf_18266268859118496436.plus.aac.p.m4a',
      year: '2020',
      genre: '动画',
      releaseKind: 'album',
      trackNumber: '31',
      trackCount: '51'
    }
  },
  {
    appleMusicUrl: 'https://music.apple.com/cn/album/%E3%82%B7%E3%83%AB%E3%82%A8%E3%83%83%E3%83%88/1536455324?i=1536455325',
    fallback: {
      id: '1536455325',
      title: 'シルエット',
      artist: 'KANA-BOON',
      collection: 'シルエット - EP',
      appleMusicUrl: 'https://music.apple.com/cn/album/%E3%82%B7%E3%83%AB%E3%82%A8%E3%83%83%E3%83%88/1536455324?i=1536455325',
      artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/7b/30/aa/7b30aa0a-0b3f-bb03-4dce-70840e227444/jacket_KSCL02520B00Z_550.jpg/600x600bb.jpg',
      thumbUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/7b/30/aa/7b30aa0a-0b3f-bb03-4dce-70840e227444/jacket_KSCL02520B00Z_550.jpg/100x100bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/31/76/a3/3176a3c8-0465-b1fb-9a06-faf9f2423fbc/mzaf_892689947062240155.plus.aac.p.m4a',
      year: '2014',
      genre: '摇滚',
      releaseKind: 'album',
      trackNumber: '1',
      trackCount: '3'
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

  const response = await fetch(`https://itunes.apple.com/lookup?id=${trackId}&country=cn`);
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
