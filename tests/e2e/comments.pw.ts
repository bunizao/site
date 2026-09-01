import { expect, test } from './fixtures';

const postId = 'lab-post';

function comment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'comment-existing',
    postId,
    parentId: null,
    author: { name: 'Murray', avatarUrl: '', byAuthor: false },
    body: 'An existing comment.',
    status: 'published',
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    editedAt: null,
    mine: true,
    editableUntil: Date.now() + 10 * 60_000,
    deletable: true,
    tombstone: false,
    ...overrides,
  };
}

async function installCommentApi(page: import('@playwright/test').Page, options: {
  onPost?: (release: () => void) => Promise<void>;
  onPatch?: (release: () => void) => Promise<void>;
} = {}) {
  await page.route('**/api/v2/reader/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ reader: null }),
  }));

  let postRelease: (() => void) | undefined;
  let patchRelease: (() => void) | undefined;
  const postGate = new Promise<void>((resolve) => { postRelease = resolve; });
  const patchGate = new Promise<void>((resolve) => { patchRelease = resolve; });

  await page.route('**/api/v2/comments**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      if (options.onPost) await options.onPost(() => postRelease?.());
      await postGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ outcome: 'published', comment: comment({ id: 'comment-posted', body: 'Optimistic comment.' }), unverifiedEmail: false }),
      });
      return;
    }
    if (request.method() === 'PATCH') {
      if (options.onPatch) await options.onPatch(() => patchRelease?.());
      await patchGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ comment: comment({ body: 'Edited comment.', editedAt: new Date().toISOString() }) }),
      });
      return;
    }
    if (new URL(request.url()).pathname.endsWith('/dwell-token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'dwell-token' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ comments: [comment()], hasMore: false, nextBefore: null, total: 1 }),
    });
  });

  await page.route('**/api/v2/reactions**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ reactions: { [`comment:${comment().id}`]: [{ emoji: '❤️', count: 0, reacted: false, reactors: [] }] } }),
  }));

  return {
    releasePost: () => postRelease?.(),
    releasePatch: () => patchRelease?.(),
  };
}

test('lab lists every interaction outcome and transitions reader verification', async ({ page }) => {
  await page.goto('/lab/comments?locale=en&receipt=error&error=BOT&verify=pending', { waitUntil: 'networkidle' });

  await expect(page.locator('.blog-compose__alert:visible')).toContainText('bot check');
  await expect(page.locator('.blog-comments > .blog-compose [data-compose-identity] input[type="text"]').first()).toHaveAttribute('placeholder', 'Name');
  await expect(page.locator('.comments-lab-catalog tbody tr')).toHaveCount(33);
  await expect(page.locator('.comments-lab-catalog')).toContainText('Submit/edit failure (BOT)');
  await expect(page.locator('.blog-comment--held .blog-comment__note')).toContainText('Posted');

  const duplicateIds = await page.locator('[id]').evaluateAll((nodes) => {
    const ids = nodes.map((node) => node.id).filter(Boolean);
    return ids.length !== new Set(ids).size;
  });
  expect(duplicateIds).toBe(false);

  await page.locator('[data-verify-confirm]').click();
  await expect(page.locator('.comments-lab-verify .reader-confirm__card')).toHaveAttribute('data-state', 'confirmed');
  await expect(page.locator('.comments-lab-verify')).toContainText("You're confirmed");

  await page.goto('/lab/comments?locale=en&verify=invalid', { waitUntil: 'networkidle' });
  await page.locator('[data-verify-resend]').click();
  await expect(page.locator('.comments-lab-verify .reader-confirm__card')).toHaveAttribute('data-state', 'resent');
  await expect(page.locator('.comments-lab-verify')).toContainText('Check your inbox');
});

test('optimistic comment submit paints before the API response', async ({ page }) => {
  let release: (() => void) | undefined;
  await installCommentApi(page, { onPost: async (next) => { release = next; } });
  await page.goto('/lab/comments?interactive=1&locale=en', { waitUntil: 'networkidle' });

  await expect(page.locator('#comment-comment-existing')).toBeVisible();
  const compose = page.locator('.blog-comments > .blog-compose');
  await compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await compose.locator('input[type="email"]').fill('reader@example.com');
  await compose.locator('textarea').fill('Optimistic comment.');
  await compose.locator('[data-compose-submit]').click();

  await expect(page.locator('.blog-comment__text').filter({ hasText: 'Optimistic comment.' }).first()).toBeVisible();
  expect(release).toBeDefined();
  release?.();
  await expect(page.locator('#comment-comment-posted')).toBeVisible();
});

test('optimistic edit paints before the API response', async ({ page }) => {
  let release: (() => void) | undefined;
  await installCommentApi(page, { onPatch: async (next) => { release = next; } });
  await page.goto('/lab/comments?interactive=1&locale=en', { waitUntil: 'networkidle' });

  const row = page.locator('#comment-comment-existing');
  await row.locator('[data-comment-edit-open]').click();
  await row.locator('[data-comment-edit-field]').fill('Edited comment.');
  await row.locator('[data-comment-edit-save]').click();

  await expect(row.locator('[data-comment-text]')).toContainText('Edited comment.');
  expect(release).toBeDefined();
  release?.();
  await expect(row.locator('[data-comment-text]')).toContainText('Edited comment.');
});

test('claimed identity sign-out is armed, cancellable, and clears the form', async ({ page }) => {
  await page.goto('/lab/comments?phase=claimed&locale=en', { waitUntil: 'networkidle' });
  const compose = page.locator('.blog-comments > .blog-compose');
  const signOut = compose.locator('[data-compose-signout]');
  await expect(signOut).toHaveText('Sign out');
  await signOut.click();
  await expect(signOut).toHaveText('Sign out?');
  await signOut.click();
  await expect(compose).toHaveAttribute('data-phase', 'anonymous');
  await expect(signOut).toBeHidden();
  await expect(compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])')).toBeFocused();
});

test('load-more, like, and delete failures remain actionable', async ({ page }) => {
  await page.route('**/api/v2/reader/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ reader: null }),
  }));
  await page.route('**/api/v2/comments**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/dwell-token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'dwell-token' }) });
      return;
    }
    if (request.method() === 'DELETE') {
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'edit_window_closed' }) });
      return;
    }
    if (url.searchParams.has('before')) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'temporary' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ comments: [comment()], hasMore: true, nextBefore: 'cursor', total: 1 }),
    });
  });
  await page.route('**/api/v2/reactions**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'temporary' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reactions: {} }) });
  });

  await page.goto('/lab/comments?interactive=1&locale=en', { waitUntil: 'networkidle' });
  const more = page.locator('[data-load-more]');
  await more.click();
  await expect(more).toHaveText('Retry');
  await expect(page.locator('.blog-comments__more-error')).toContainText("didn't make it");

  const row = page.locator('#comment-comment-existing');
  await row.locator('[data-comment-like]').click();
  await expect(row.locator('[data-comment-action-error]')).toHaveCount(0);
  await expect(row.locator('.blog-comment__action-error')).toContainText('Something dozed off');

  page.on('dialog', (dialog) => void dialog.accept());
  await row.locator('[data-comment-delete]').click();
  await expect(row.locator('.blog-comment__action-error')).toContainText("edit window has closed");
});
