---
title: Mobile Reading Bar
tagline: A frosted reading header with scroll-spy, a jumping section pill, and a compact table of contents.
tier: composition
order: 56
install:
  type: registry
source: https://github.com/bunizao/site/blob/main/src/features/components/ui/MobileReadingBar.astro
credits: Original mobile reading navigation by Bunizao.
---

```astro
---
import MobileReadingBar from '@/components/ui/mobile-reading-bar.astro';

const sections = [
  { id: 'introduction', title: 'Introduction' },
  { id: 'details', title: 'Details' },
];
---

<MobileReadingBar sections={sections} />
```
