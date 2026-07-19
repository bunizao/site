import { describe, expect, test } from 'bun:test';

describe('Mood archive route policy', () => {
  test('keeps public Mood rendering and RSS off the live fallback cascade', async () => {
    const [feedRoute, detailRoute, embedRoute, rssRoute, feedController] = await Promise.all([
      Bun.file('src/pages/mood.astro').text(),
      Bun.file('src/pages/mood/[id].astro').text(),
      Bun.file('src/pages/mood/embed.astro').text(),
      Bun.file('src/pages/mood/rss.xml.ts').text(),
      Bun.file('src/features/mood/client/feed-controller.ts').text(),
    ]);

    expect(feedRoute).toContain("Astro.url.searchParams.get('fallback') === '1'");
    expect(detailRoute).toContain('fallback: moodReadFallback');
    expect(embedRoute).toContain("{ source: 'archive', fallback: false }");
    expect(embedRoute).toContain("{ limit: count, source: 'archive', fallback: false }");
    expect(rssRoute).toContain("{ limit: MAX_ITEMS, source: 'archive', fallback: false }");
    expect(feedController).toContain("query.set('fallback', '0')");
    expect(feedController).toContain("? ['/api/v2/mood']");
    expect(feedController).not.toContain("? ['/api/v2/mood', '/api/moods']");
  });
});
