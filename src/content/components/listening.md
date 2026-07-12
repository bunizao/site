---
title: Listening
tagline: A now-playing vinyl card that spins, samples its artwork, and plays a preview.
tier: showpiece
order: 55
install:
  type: registry
source: https://github.com/bunizao/site/blob/main/src/features/home/ui/Listening.astro
credits: Apple Music preview playback via a single shared audio engine by Bunizao.
---

```astro
---
import Listening from '@/lib/Listening.astro';

const track = {
  id: 'track-id',
  appleCatalogId: '',
  title: 'Track title',
  artist: 'Artist',
  collection: 'Album',
  appleMusicUrl: 'https://music.apple.com/',
  artworkUrl: 'https://example.com/artwork.jpg',
  thumbUrl: 'https://example.com/artwork.jpg',
  previewUrl: 'https://example.com/preview.m4a',
  year: '2026',
  genre: 'Pop',
  releaseKind: 'album',
  trackNumber: '1',
  trackCount: '10',
  sourceUrl: 'https://music.apple.com/',
  isNowPlaying: false,
  playedAt: '',
};
---

<Listening track={track} static />
```
