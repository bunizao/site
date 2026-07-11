---
title: Mascot Peek
tagline: A grid-composited pixel mascot engine — poses, looks, motions, zero deps.
tier: showpiece
order: 50
install:
  type: registry
source: https://github.com/bunizao/site/tree/main/src/features/mascot/peek
credits: Original character and pixel system by Bunizao.
---

```ts
import { compose, applyLook, resolveLayer } from '@/features/mascot/peek/compose';
import { PEEK_BASE } from '@/features/mascot/peek/base';

const grid = applyLook(compose(PEEK_BASE.grid), PEEK_BASE.looks.happy);
```
