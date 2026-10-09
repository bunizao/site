/** The owner's Last.fm scrobbles in the seven days before the read. */
export interface ListeningWeek {
  plays: number;
  /** Most scrobbled artist; null when nothing was scrobbled. */
  topArtist: string | null;
}

export interface ListeningAccent {
  hue: number;
  chromaLight: number;
  chromaDark: number;
}

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
  accent: ListeningAccent | null;
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
