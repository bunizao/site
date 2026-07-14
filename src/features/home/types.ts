export interface ListeningTrack {
  id: string;
  appleCatalogId: string;
  catalogId?: string;
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
  sourceUrl: string;
  isNowPlaying: boolean;
  playedAt: string;
}
