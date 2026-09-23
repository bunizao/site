import { describe, expect, test } from 'bun:test';

describe('Mood archive fallback policy', () => {
  test('keeps public Mood surfaces on the archive reader with live availability fallback', async () => {
    const [embedRoute, rssRoute, feedController] = await Promise.all([
      Bun.file('src/pages/mood/embed.astro').text(),
      Bun.file('src/pages/mood/rss.xml.ts').text(),
      Bun.file('src/features/mood/client/feed-controller.ts').text(),
    ]);

    expect(embedRoute).toContain("{ source: 'archive' }");
    expect(embedRoute).toContain("{ limit: count, source: 'archive' }");
    expect(rssRoute).toContain("{ limit: MAX_ITEMS, source: 'archive' }");
    // Archive content completion stays off (fallback=0), but the browser must
    // degrade to the live mirror when the archive route keeps failing.
    expect(feedController).toContain("query.set('fallback', '0')");
    expect(feedController).toContain("['/api/v2/mood', '/api/moods']");
    expect(feedController).toContain("feedTagFilter ? ['/api/v2/mood']");
  });
});
