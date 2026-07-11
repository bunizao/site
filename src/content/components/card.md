---
title: Card
tagline: Composable surface — header, content, footer — as a slot family.
tier: primitive
order: 30
install:
  type: registry
source: https://github.com/bunizao/site/blob/main/src/components/ui/card.tsx
credits: Built on [shadcn/ui](https://ui.shadcn.com).
---

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function Example() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Signal</CardTitle>
      </CardHeader>
      <CardContent>Content sits on the card surface.</CardContent>
    </Card>
  );
}
```
