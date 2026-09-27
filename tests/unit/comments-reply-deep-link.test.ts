// Source assertions -- initCommentsController needs a real DOM (querySelector,
// IntersectionObserver, custom elements) that this suite has no jsdom harness
// for; see mood-comments-live-refresh.test.ts for the same call.
//
// The regression this locks: a reply-notification email links to
// /blog/<slug>#comment-<id>. The comment thread sits after the whole
// article and its bootstrap normally waits for the section to come near the
// viewport (whenNear) -- but the row a reply link names does not exist in
// the prerendered HTML, so the browser's own fragment scroll runs before
// this module even attaches and finds nothing to land on. Waiting for a
// scroll that already (unsuccessfully) happened would mean bootstrap()
// never runs at all for that reader.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../src/features/comments/client/comments-controller.ts', import.meta.url),
  'utf8',
);

function bodyOf(fnSignature: string): string {
  const start = source.indexOf(fnSignature);
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start);
  const end = rest.search(/\n(?:async )?function |\n  \/\*\*/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('comments reply deep link', () => {
  test('hashTargetsThread recognizes a specific comment or the bare thread anchor', () => {
    const body = bodyOf('function hashTargetsThread');
    expect(body).toContain("hash === '#comments'");
    expect(body).toContain("hash.startsWith('#comment-')");
  });

  test('a hash deep link bypasses the near-viewport gate the same way data-load="eager" does', () => {
    expect(source).toContain('const hashTargetsThisThread = hashTargetsThread(window.location.hash);');
    expect(source).toContain(
      "if (section.dataset.load === 'eager' || hashTargetsThisThread) void bootstrap();",
    );
    // Still the fallback for every other case.
    expect(source).toContain('else whenNear(section, () => void bootstrap());');
  });

  test('bootstrap scrolls the named comment into view once the first page has rendered', () => {
    const bootstrap = bodyOf('async function bootstrap');
    // Runs after renderPage/clearSkeleton/setTally/setMoreVisible, not before.
    const renderIdx = bootstrap.indexOf('await renderPage(pageResult.comments);');
    const scrollIdx = bootstrap.indexOf('if (hashTargetsThisThread) scrollHashCommentIntoView();');
    expect(renderIdx).toBeGreaterThan(-1);
    expect(scrollIdx).toBeGreaterThan(renderIdx);
  });

  test('scrollHashCommentIntoView only targets a specific comment row, never the bare thread anchor', () => {
    const body = bodyOf('function scrollHashCommentIntoView');
    expect(body).toContain("if (!hash.startsWith('#comment-')) return;");
    // The id it looks up matches renderCommentRow's own `comment-<id>` ids.
    expect(body).toContain('document.getElementById(hash.slice(1))');
  });

  test("the sibling warm-up prefetch (api-prefetch.ts) makes the same exception", () => {
    const apiPrefetch = readFileSync(
      new URL('../../src/lib/api-prefetch.ts', import.meta.url),
      'utf8',
    );
    expect(apiPrefetch).toContain("h==='#comments'||h.indexOf('#comment-')===0");
  });
});
