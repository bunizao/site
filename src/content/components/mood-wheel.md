---
title: Mood Wheel
tagline: A precision-instrument timeline dial that winds to the scroll position.
tier: composition
order: 60
install:
  type: registry
source: https://github.com/bunizao/site/blob/main/src/features/mood/ui/TimelineWheel.astro
credits: Precision-instrument aesthetic; slot-text readout by Bunizao.
---

```ts
import { mountTimelineWheel } from '@/lib/timeline-wheel';

mountTimelineWheel(root, {
  feed: document.querySelector('[data-mood-feed]'),
  list: document.querySelector('[data-mood-list]'),
});
```
