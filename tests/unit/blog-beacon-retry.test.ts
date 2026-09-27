// Source assertions, same reason as blog-analytics-beacon.test.ts: the
// beacon is an `is:inline` script gated on the buxx.me hostname, so no test
// host can run it behaviourally.
//
// The regression this locks: visibilitychange->hidden and pagehide both fire
// on one page exit, and lastSentKey exists so the second does not repeat the
// first. That guard must not fire when the first send never actually left
// the browser -- otherwise a dropped exit beacon is gone for good, because
// the pagehide right behind it looks like a duplicate of a send that failed.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function sendBeaconBody(source: string): string {
  const start = source.indexOf('function sendBeacon(');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n    document.addEventListener', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('blog beacon exit-send retry', () => {
  test('the dedupe key is only marked sent once a send actually leaves the browser', () => {
    const body = sendBeaconBody(readSource('src/features/posts/ui/BlogArticleBeacon.astro'));

    // Not set right after the dedupe check any more -- that would mark a
    // send as done before knowing whether it went anywhere.
    expect(body).not.toMatch(/if \(key === lastSentKey\) return;\s*lastSentKey = key;/);

    // Set on the sendBeacon success path.
    expect(body).toMatch(/navigator\.sendBeacon\(endpoint, blob\)\) \{\s*lastSentKey = key;/);

    // And on the fetch fallback, but only inside a try that leaves it unset
    // if the call throws synchronously.
    expect(body).toContain('try {');
    expect(body).toMatch(/keepalive: true,\s*\}\)\.catch\(\(\) => \{\}\);\s*lastSentKey = key;/);
    expect(body).toContain('} catch {');
  });

  test('still skips a genuinely unchanged payload once a send has gone through', () => {
    const body = sendBeaconBody(readSource('src/features/posts/ui/BlogArticleBeacon.astro'));

    expect(body).toContain('if (key === lastSentKey) return;');
  });
});
