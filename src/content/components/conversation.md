---
title: Conversation
tagline: A chat thread written as plain text — speakers auto-register, runs collapse under one name, and bubbles hold their measure in both CJK and Latin.
tier: composition
order: 58
install:
  type: registry
source: https://github.com/bunizao/site/blob/main/src/features/content/conversation.ts
credits: Original conversation syntax and thread layout by Bunizao.
---

```astro
---
import Conversation from '@/components/ui/conversation.astro';

const source = `
@Ada accent=#4E7A5E

you: how wide should a bubble be?
ada: 30em.
ada: A CJK glyph is 1em and a Latin glyph about half that,
  so one number lands on ~30 Chinese characters and ~60 Latin ones.
--- later
you: ship it
`;
---

<Conversation source={source} />
```

In a blog post nothing needs importing — a fenced ` ```conversation ` block renders
the same component. See [the syntax reference](/docs/writing/conversation).
