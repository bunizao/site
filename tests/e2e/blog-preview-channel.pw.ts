import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { expect, test } from './fixtures';
import { E2E_GHOST_ADMIN_ORIGIN } from '../../playwright.config';

// Exercises the postMessage channel between /dev/blog/[id] (site) and the
// koenig-editor live preview pane (fork, not present in this repo) — see
// "Live preview" in plans/koenig-editor.md. There is no real Ghost admin
// here, so this test plays the parent's part itself: a tiny local HTTP
// server frames the preview and drives it exactly the way the fork's
// LivePreviewPlugin does.
//
// That parent is a *real* listening server, not a page.route() mock — Chrome
// treats a fully-mocked navigation (no actual TCP connection) as coming from
// an indeterminate address space and blocks it from framing/fetching the
// loopback dev server under Local Network Access checks, independently of
// CSP. A real loopback server avoids that false block entirely.
//
// Trust boundary this test is pinned to: src/middleware.ts always allows
// `frame-ancestors 'self'` on /dev/blog/* (the /dev/portal/blog same-origin
// preview needs it in every environment, not just e2e) and additionally
// allows readGhostAdminOrigin() — derived from PUBLIC_GHOST_URL — which is
// what playwright.config.ts sets to E2E_GHOST_ADMIN_ORIGIN for this whole
// suite. Only that second, configured origin is what the channel itself
// trusts (draft-live-channel.ts's isTrustedParentOrigin) — 'self' framing
// alone does not let a page talk to the channel, and this suite's second
// test frames from neither to prove that.

const FIXTURE_POST_ID = '5ddc9141c35e7700383b2937';

interface ReceivedMessage {
  origin: string;
  data: { type?: string; warnings?: { message: string }[]; ok?: boolean };
}

function buildParentHarness(siteOrigin: string, previewPath: string): string {
  // Mirrors the fork's pane: one iframe of /dev/blog/<id>, a listener for the
  // preview's replies, and a `sendDraft` hook this test calls in place of
  // LivePreviewPlugin's debounced $generateHtmlFromNodes → postMessage.
  return `<!doctype html>
<html>
<body>
<iframe id="preview" src="${siteOrigin}${previewPath}"></iframe>
<script>
  window.__received = [];
  window.addEventListener('message', (event) => {
    window.__received.push({ origin: event.origin, data: event.data });
  });
  window.sendDraft = (html) => {
    document.getElementById('preview').contentWindow.postMessage(
      { type: 'buxx:draft', html },
      ${JSON.stringify(siteOrigin)},
    );
  };
</script>
</body>
</html>`;
}

/** A real loopback HTTP server serving one fixed HTML document, closed by the caller. */
async function serveHarness(port: number, html: string): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function receivedOfType(page: import('@playwright/test').Page, type: string): Promise<ReceivedMessage[]> {
  return page.evaluate((wantedType) => {
    const received = (window as unknown as { __received: ReceivedMessage[] }).__received;
    return received.filter((message) => message.data?.type === wantedType);
  }, type);
}

test.describe('Preview channel (koenig-editor live pane)', () => {
  test('renders a posted draft, surfaces warnings, and pauses/resumes the HEAD poll', async ({ page }) => {
    // baseURL (127.0.0.1:4321 by default, overridable via E2E_HOST/E2E_PORT —
    // see playwright.config.ts) read off a real navigation rather than
    // reimplementing its derivation here.
    await page.goto('/');
    const siteOrigin = new URL(page.url()).origin;
    const previewPath = `/dev/blog/${FIXTURE_POST_ID}`;

    // Vite's first-ever request against a cold dev server triggers a
    // dependency pre-bundle and reloads the page once (see repo memory:
    // "cold dev server reloads once") — do that reload now, outside the
    // iframe, so the buxx:ready handshake below is not lost to it.
    await page.goto(`${siteOrigin}${previewPath}`, { waitUntil: 'networkidle' });

    const parentPort = Number(new URL(E2E_GHOST_ADMIN_ORIGIN).port);
    const parent = await serveHarness(parentPort, buildParentHarness(siteOrigin, previewPath));
    expect(parent.origin).toBe(E2E_GHOST_ADMIN_ORIGIN);

    try {
      const headRequestUrl = `${siteOrigin}${previewPath}`;
      const headRequests: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'HEAD' && request.url() === headRequestUrl) {
          headRequests.push(request.url());
        }
      });

      await page.goto(parent.origin);
      const frame = page.frameLocator('#preview');
      const root = frame.locator('[data-ghost-draft-preview]');
      await expect(root).toBeVisible();

      // 1. buxx:ready posted on load — only happens when the channel is
      // armed (a configured parent origin), so this also proves the
      // PUBLIC_GHOST_URL wiring above actually took effect.
      await expect.poll(() => receivedOfType(page, 'buxx:ready')).not.toEqual([]);

      // The poll is live before anything is posted to it.
      await expect(root).toHaveAttribute('data-preview-state', 'live', { timeout: 15_000 });
      const requestsBeforeDraft = headRequests.length;
      expect(requestsBeforeDraft).toBeGreaterThan(0);

      // 2. A good marker: the article swaps in place and the mood embed renders.
      await page.evaluate(
        (html) => (window as unknown as { sendDraft(h: string): void }).sendDraft(html),
        '<p>[!mood id=482]</p>',
      );

      await expect(root).toHaveAttribute('data-preview-state', 'parent-driven');
      await expect.poll(() => receivedOfType(page, 'buxx:warnings')).not.toEqual([]);
      const goodWarnings = (await receivedOfType(page, 'buxx:warnings')).at(-1)?.data.warnings;
      expect(goodWarnings).toEqual([]);
      await expect(frame.locator('[data-blog-mood-embed]')).toHaveCount(1);

      // 3. Pausing is real: no HEAD probe lands while the parent is driving.
      await page.waitForTimeout(3_000);
      expect(headRequests.length).toBe(requestsBeforeDraft);

      // 4. A bad marker does not throw — it comes back as a warning, rendered
      // in the same .blog-preview-warnings block the saved-draft path uses.
      await page.evaluate(
        (html) => (window as unknown as { sendDraft(h: string): void }).sendDraft(html),
        '<p>[!mood id=not-a-number]</p>',
      );
      await expect.poll(async () => (await receivedOfType(page, 'buxx:warnings')).at(-1)?.data.warnings?.length)
        .toBe(1);
      await expect(frame.locator('.blog-preview-warnings')).toBeVisible();
      await expect(frame.locator('.blog-preview-warnings li')).toContainText('Invalid "mood" directive');

      // 5. Silence resumes the poll (RESUME_AFTER_SILENCE_MS in
      // draft-live-channel.ts) — a fresh HEAD lands and the status flips back.
      await expect.poll(() => headRequests.length, { timeout: 15_000, intervals: [500] })
        .toBeGreaterThan(requestsBeforeDraft);
      await expect(root).toHaveAttribute('data-preview-state', 'live', { timeout: 15_000 });
    } finally {
      await parent.close();
    }
  });

  test('refuses to be framed by an origin that is not the configured Ghost admin', async ({ page }) => {
    await page.goto('/');
    const siteOrigin = new URL(page.url()).origin;
    const previewPath = `/dev/blog/${FIXTURE_POST_ID}`;

    // Neither 'self' nor the one configured Ghost admin origin — a port two
    // steps away from the site's own, still loopback so this stays a CSP test
    // rather than tripping the same Local Network Access check documented above.
    const untrustedPort = Number(new URL(E2E_GHOST_ADMIN_ORIGIN).port) + 1000;
    const untrusted = await serveHarness(untrustedPort, buildParentHarness(siteOrigin, previewPath));

    try {
      await page.goto(untrusted.origin);

      // frame-ancestors on /dev/blog/* is 'self' plus the one configured
      // Ghost admin origin (see readGhostAdminOrigin in src/middleware.ts) —
      // this origin is neither, so the browser refuses to render the framed
      // document at all. The preview's own DOM never appears, which is a
      // stronger guarantee than the channel's isTrustedParentOrigin check:
      // that check only stops an untrusted postMessage from being acted on,
      // this stops the untrusted page from loading the preview in the first
      // place.
      await page.waitForTimeout(2_000);
      await expect(page.frameLocator('#preview').locator('[data-ghost-draft-preview]')).toHaveCount(0);
      await expect.poll(() => page.evaluate(
        () => (window as unknown as { __received: ReceivedMessage[] }).__received.length,
      )).toBe(0);
    } finally {
      await untrusted.close();
    }
  });
});
