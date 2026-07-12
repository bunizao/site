---
title: GitHub Activity
tagline: A compact contribution wave with staged growth, ambient motion, and per-day tooltips.
tier: showpiece
order: 58
install:
  type: registry
source: https://github.com/bunizao/site/blob/main/src/features/home/ui/GitHubContributions.astro
credits: Original contribution-wave treatment by Bunizao.
---

```astro
---
import GitHubActivity from '@/lib/GitHubContributions.astro';
---

<GitHubActivity endpoint="/api/github/contributions" username="bunizao" />
```
