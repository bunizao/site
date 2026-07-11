---
title: Decode Text
tagline: A zero-dependency rAF engine that boils scrambled glyphs into words.
tier: showpiece
order: 40
install:
  type: npm
  pkg: '@bunizao/decode-text'
source: https://github.com/bunizao/site/tree/main/packages/decode-text
credits: Reveal timing after Soulwire's power-front scheduling.
---

```ts
import { prepareDecode } from '@bunizao/decode-text';

const controller = await prepareDecode(document.querySelector('#bio'));
controller.start();
```
