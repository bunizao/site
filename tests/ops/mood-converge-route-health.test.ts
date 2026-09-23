import { describe, expect, test } from 'bun:test';

function getSiteUrl(): string {
  return (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || 'https://buxx.me').replace(/\/+$/, '');
}

// This is a deploy guard, not a correctness check: the converge Durable
// Object's only write path into the archive is `POST /v2/mood/converge/report`
// on site-api (documented at /docs/api/internal). An unsigned request is
// expected to be rejected — 401 — because it fails the HMAC check in
// `isAuthorizedMoodSyncRequest`. A 404 means something different and worse:
// the route itself is gone from the deployed Worker. That exact regression
// shipped 2026-09-03 when a `main` deploy overwrote the branch carrying this
// route, and it went unnoticed for days because nothing asserted the route
// existed (see plans/039-mood-converge-landing.md). 401 == route present but
// unauthorized (healthy). 404 == the route was dropped, page it.
describe('mood converge route health', () => {
  test('unsigned POST to the converge report route is rejected, not missing', async () => {
    const siteUrl = getSiteUrl();
    const url = `${siteUrl}/api/v2/mood/converge/report`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'health-check', kind: 'empty', pts: 0 }),
      signal: AbortSignal.timeout(10_000),
    });

    expect(
      response.status,
      `POST ${url} -> ${response.status} ${response.statusText}`
      + ' (expected 401 unauthorized; 404 means the deploy dropped the route again)',
    ).toBe(401);
  });
});
