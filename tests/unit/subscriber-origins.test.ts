import { expect, test } from 'bun:test';
import type { SubscriberRecord } from '@bunizao/contracts';
import { countSubscriptionOrigins } from '@/features/portal/audience/model';

test('subscription origins count current status without guessing historical origins', () => {
  const rows = [
    { source: 'desk', status: 'active', channels: ['blog', 'mood'] },
    { source: 'desk', status: 'pending', channels: ['blog'] },
    { source: 'blog', status: 'unsubscribed', channels: ['blog'] },
    { status: 'active', channels: ['mood'] },
  ] as SubscriberRecord[];
  const counts = countSubscriptionOrigins(rows);
  expect(counts.desk).toEqual({ total: 2, activeCount: 1, pendingCount: 1, unsubscribedCount: 0 });
  expect(counts.blog.unsubscribedCount).toBe(1);
  expect(counts.mood.total).toBe(0);
  expect(counts.unknown.activeCount).toBe(1);
  expect(rows[3].source).toBeUndefined();
  expect(countSubscriptionOrigins([]).unknown.total).toBe(0);
});
