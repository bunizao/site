---
title: Mood Wheel
tagline: A precision-instrument timeline dial you can read, drag, flick and spin.
tier: composition
order: 60
install:
  type: registry
source: https://github.com/bunizao/site/blob/main/src/features/mood/ui/TimelineWheel.astro
credits: Precision-instrument aesthetic; slot-text readout by Bunizao.
---

```astro
---
import TimelineWheel from '@/components/ui/timeline-wheel.astro';
---

<main>
  <TimelineWheel compact />
  <div data-mood-feed>
    <div data-mood-list aria-busy="false">
      <section class="mood-date-group" data-date="2026-07-15">
        <h2 class="mood-date-header">July 15</h2>
        <article class="mood-item">Your timeline content</article>
      </section>
    </div>
  </div>
</main>
```
