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
import Listening from '@/features/home/ui/Listening.astro';
import { getCurrentListeningTrack } from '@/features/home/server/listening';

const { track } = await getCurrentListeningTrack(Astro.locals);
---

<Listening track={track} />
```
