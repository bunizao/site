import type { ListeningTrack } from '@/features/home/types';

// The deterministic demo track for the /components showcase specimen: a real
// Apple Music song with a working preview URL, so the specimen plays without
// any live listening API call. Live data comes from site-api.
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
  accent: null,
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
