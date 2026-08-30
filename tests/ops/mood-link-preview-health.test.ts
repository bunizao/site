import { describe, expect, test } from 'bun:test';

function getSiteUrl(): string {
  return (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || 'https://buxx.me').replace(/\/+$/, '');
}

interface MoodFeedPostShape {
  id: string;
  datetime: string;
  media?: Array<{ type?: string }>;
}

// The reconcile prober (site-api scripts/mood-reconcile, a systemd timer on an
// external server) unfurls link previews into the D1 archive. Ingest only
// stores the bare URL, so until a probe reports back, pure-archive reads render
// link posts without their bookmark card. Three days covers several probe
// cycles plus transient scrape failures.
const CONVERGENCE_GRACE_MS = 72 * 60 * 60 * 1000;

async function fetchMoodFeedPosts(siteUrl: string, params: string): Promise<MoodFeedPostShape[]> {
  const url = `${siteUrl}/api/v2/mood?${params}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  expect(response.ok, `GET ${url} -> ${response.status}`).toBe(true);

  const payload = await response.json() as { posts?: MoodFeedPostShape[] };
  return payload.posts ?? [];
}

function hasLinkPreview(post: MoodFeedPostShape | undefined): boolean {
  return Boolean(post?.media?.some((item) => item.type === 'link-preview'));
}

describe('mood link preview health', () => {
  test('archived link previews converge within the reconcile window', async () => {
    const siteUrl = getSiteUrl();
    // The default read merges the live Telegram mirror; fallback=0 is the pure
    // archive read the site itself uses. A preview the merge shows but the
    // archive still lacks after the grace window means the prober is stalled.
    const [merged, archived] = await Promise.all([
      fetchMoodFeedPosts(siteUrl, 'limit=50'),
      fetchMoodFeedPosts(siteUrl, 'fallback=0&limit=50'),
    ]);
    expect(merged.length, 'merged mood feed came back empty').toBeGreaterThan(0);
    expect(archived.length, 'archived mood feed came back empty').toBeGreaterThan(0);

    const archivedById = new Map(archived.map((post) => [post.id, post]));
    const cutoff = Date.now() - CONVERGENCE_GRACE_MS;
    const stalled = merged
      .filter((post) =>
        hasLinkPreview(post)
        && new Date(post.datetime).getTime() < cutoff
        && archivedById.has(post.id)
        && !hasLinkPreview(archivedById.get(post.id)))
      .map((post) => post.id);

    expect(
      stalled,
      'link previews the live mirror shows but the archive never unfurled'
      + ' — check the mood-reconcile timer on the probe server'
      + ' (systemctl status mood-reconcile.timer; journalctl -u mood-reconcile.service)',
    ).toEqual([]);
  });
});
