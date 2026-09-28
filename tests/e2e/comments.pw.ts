import type { Page } from '@playwright/test';
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
  postStatus?: number;
  patchStatus?: number;
  postOutcome?: 'published' | 'held';
  postError?: string;
  unverifiedEmail?: boolean;
  awaitingEmail?: boolean;
} = {}) {
  await page.route('**/api/v2/reader/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ reader: null }),
  }));

  let postRelease!: () => void;
  let patchRelease!: () => void;
  let markPostReceived!: () => void;
  let markPatchReceived!: () => void;
  let postCompleted = false;
  const postGate = new Promise<void>((resolve) => { postRelease = resolve; });
  const patchGate = new Promise<void>((resolve) => { patchRelease = resolve; });
  const postReceived = new Promise<void>((resolve) => { markPostReceived = resolve; });
  const patchReceived = new Promise<void>((resolve) => { markPatchReceived = resolve; });

  await page.route('**/api/v2/comments**', async (route) => {
    const request = route.request();
    if (new URL(request.url()).pathname.endsWith('/telemetry')) return route.fallback();
    if (request.method() === 'POST') {
      markPostReceived();
      await postGate;
      if (options.postStatus && options.postStatus !== 200) {
        await route.fulfill({ status: options.postStatus, contentType: 'application/json', body: JSON.stringify({ error: options.postError ?? 'rate limited' }) });
        return;
      }
      postCompleted = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ outcome: options.postOutcome ?? 'published', comment: comment({ id: 'comment-posted', body: 'Optimistic comment.', status: options.postOutcome ?? 'published' }), unverifiedEmail: options.unverifiedEmail ?? false, awaitingEmail: options.awaitingEmail ?? false }),
      });
      return;
    }
    if (request.method() === 'PATCH') {
      markPatchReceived();
      await patchGate;
      if (options.patchStatus && options.patchStatus !== 200) {
        await route.fulfill({ status: options.patchStatus, contentType: 'application/json', body: JSON.stringify({ error: 'edit_window_closed' }) });
        return;
      }
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
      body: JSON.stringify({
        comments: options.postOutcome === 'held' && postCompleted
          ? [comment(), comment({ id: 'comment-posted', body: 'Optimistic comment.', status: 'published' })]
          : [comment()],
        hasMore: false,
        nextBefore: null,
        total: options.postOutcome === 'held' && postCompleted ? 2 : 1,
      }),
    });
  });

  await page.route('**/api/v2/reactions**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ reactions: { [`comment:${comment().id}`]: [{ emoji: '❤️', count: 0, reacted: false, reactors: [] }] } }),
  }));

  return {
    // Optimistic UI can paint before evidence collection starts the request.
    // Wait for the intercepted request instead of losing an early release.
    releasePost: async () => {
      await postReceived;
      postRelease();
    },
    releasePatch: async () => {
      await patchReceived;
      patchRelease();
    },
  };
}

/** Opens the lab once it is live: every island hydrated and, on the
    interactive harness, the controller's first row drawn. Web-first, so a
    cold dev server's one reload is waited out rather than raced. */
async function gotoLab(page: Page, query: string) {
  await page.goto(`/lab/comments?${query}`);
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  if (query.includes('interactive=1')) await expect(page.locator('#comment-comment-existing')).toBeVisible();
}

test('the BOT refusal shows the human-check alert, and the verify card moves pending → confirmed → resent', async ({ page }) => {
  await gotoLab(page, 'locale=en&receipt=error&error=BOT&verify=pending');

  await expect(page.locator('.blog-compose__alert:visible')).toContainText('human check');
  await expect(page.locator('.blog-comments > .blog-compose [data-compose-identity] input[type="text"]').first()).toHaveAttribute('placeholder', 'Name');
  await expect(page.locator('.comments-lab-catalog')).toContainText('Submit/edit failure (BOT)');
  await expect(page.locator('.blog-comment--held .blog-comment__note')).toContainText('Posted');
  await expect(page.locator('.comments-lab-preview .blog-compose__preview')).toBeVisible();
  await expect(page.locator('.comments-lab-preview .blog-compose__preview-body strong')).toHaveText('preview');
  await expect(page.locator('.comments-lab-preview .blog-compose__preview-body code')).toHaveText('comment-markdown.ts');

  const duplicateIds = await page.locator('[id]').evaluateAll((nodes) => {
    const ids = nodes.map((node) => node.id).filter(Boolean);
    return ids.length !== new Set(ids).size;
  });
  expect(duplicateIds).toBe(false);

  await page.locator('[data-verify-confirm]').click();
  await expect(page.locator('.comments-lab-verify .reader-confirm__card')).toHaveAttribute('data-state', 'confirmed');
  await expect(page.locator('.comments-lab-verify')).toContainText("You're verified!");

  await gotoLab(page, 'locale=en&verify=invalid');
  await page.locator('[data-verify-resend]').click();
  await expect(page.locator('.comments-lab-verify .reader-confirm__card')).toHaveAttribute('data-state', 'resent');
  await expect(page.locator('.comments-lab-verify')).toContainText('Check your inbox');
});

// The confirmed card is where reply alerts get turned down. Two switches,
// both phrased so that "on" means the thing happens.
test('confirm card carries the reply switch and the newsletter switch', async ({ page }) => {
  await gotoLab(page, 'locale=zh&verify=settings');
  const prefs = page.locator('.comments-lab-verify .reader-confirm__prefs');
  const switches = prefs.locator('.reader-confirm__switch');
  await expect(switches).toHaveCount(2);
  await expect(switches.nth(0)).toContainText('有人回复我的评论时发送邮件提醒');
  await expect(switches.nth(1)).toContainText('订阅 buxx.me 的最新文章');
  // A per-post switch used to sit between them. Nobody wants alerts scoped to
  // an article -- the reader who reaches for an off switch wants out of one
  // conversation, and that button lives in the mail itself.
  await expect(prefs).not.toContainText('这篇文章');
  // Drawn as a track, not a native box: a 16px checkbox would mean the CSS
  // never landed.
  const width = await switches.nth(0).locator('input').evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(30);
});

test('a resolved avatar draws a photo, everyone else a drawn face', async ({ page }) => {
  await gotoLab(page, 'locale=en');
  const withPhoto = page.locator('#comment-8 .blog-comment__avatar');
  await expect(withPhoto).toHaveJSProperty('tagName', 'IMG');
  await expect(withPhoto).toHaveAttribute('src', '/avatar.webp');
  // A row whose writer never resolved one falls back to a drawn face rather
  // than a broken image -- the avatar URL is empty precisely when there is
  // nothing to fetch.
  const withoutPhoto = page.locator('#comment-1 .blog-comment__avatar');
  await expect(withoutPhoto).toHaveClass(/blog-avatar-drawn/);
  await expect(withoutPhoto.locator('svg rect')).not.toHaveCount(0);
});

test('mute card says what went quiet and what did not', async ({ page }) => {
  await gotoLab(page, 'locale=zh&mute=muted');
  const card = page.locator('.comments-lab-mute .reader-confirm__card');
  await expect(card).toHaveAttribute('data-state', 'muted');
  // The one thing a reader needs back from a button they pressed in a mail:
  // how far the quiet reaches.
  await expect(card).toContainText('这个对话已静音');
  await expect(card).toContainText('其他文章和其他对话照常提醒');
  await expect(card.getByRole('button', { name: '恢复这个对话的提醒' })).toBeVisible();

  await gotoLab(page, 'locale=zh&mute=invalid');
  // An expired mute link is a dead end unless it hands over the settings card.
  await expect(card).toContainText('链接已失效');
  await expect(card.getByRole('link', { name: '打开评论提醒设置' })).toHaveAttribute('href', '/reader/confirm');
});

test('compose preview opens only for supported Markdown and closes when emptied', async ({ page }) => {
  await gotoLab(page, 'locale=en');
  const compose = page.locator('.blog-comments > .blog-compose');
  const field = compose.locator('.blog-compose__field');
  await field.fill('Plain prose stays compact.');
  await expect(compose.locator('.blog-compose__preview')).toHaveCount(0);
  await field.fill('This is **rendered** with `code`.');
  await expect(compose.locator('.blog-compose__preview')).toBeVisible();
  await expect(compose.locator('.blog-compose__box > .blog-compose__preview')).toHaveCount(1);
  await expect(compose.locator('.blog-compose__preview strong')).toHaveText('rendered');
  await expect(compose.locator('.blog-compose__preview code')).toHaveText('code');
  await field.fill('');
  await expect(compose.locator('.blog-compose__preview')).toBeHidden();
});

test('compose Markdown shortcuts wrap the active selection', async ({ page }) => {
  await gotoLab(page, 'locale=en');
  const compose = page.locator('.blog-comments > .blog-compose');
  const field = compose.locator('.blog-compose__field');
  await field.fill('make this bold');
  await field.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.setSelectionRange(10, 14);
  });
  await field.press(process.platform === 'darwin' ? 'Meta+b' : 'Control+b');
  await expect(field).toHaveValue('make this **bold**');
  await expect(compose.locator('.blog-compose__preview strong')).toHaveText('bold');
});

test('compose validation and body counter expose every refusal', async ({ page }) => {
  await gotoLab(page, 'locale=en');
  const compose = page.locator('.blog-comments > .blog-compose');
  const name = compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])');
  const email = compose.locator('input[type="email"]');
  const body = compose.locator('.blog-compose__field');
  const submit = compose.locator('[data-compose-submit]');

  await submit.click();
  await expect(compose.locator('.blog-compose__alert')).toContainText('deserves a name');
  await name.fill('Reader');
  await submit.click();
  await expect(compose.locator('.blog-compose__alert')).toContainText('write something first');
  await body.fill('A complete comment.');
  await email.fill('not-an-email');
  await submit.click();
  await expect(compose.locator('.blog-compose__alert')).toContainText("doesn't look right");
  await email.fill('reader@example.com');
  await body.fill('x'.repeat(1800));
  await expect(compose.locator('[data-compose-count]')).toHaveText('1800/2000');
  await body.fill('x'.repeat(2001));
  await expect(compose.locator('[data-compose-count]')).toHaveAttribute('data-over', '');
  await submit.click();
  await expect(compose.locator('.blog-compose__alert')).toContainText('2000 characters max');
});

// The per-post comment states a page can be in, from the tags in
// src/content/docs/writing/tags.md. `off` renders the section hidden, so a
// portal override can show it; that case lives with the overrides below.
test('a read-only post keeps its thread and drops its box', async ({ page }) => {
  await gotoLab(page, 'locale=en&state=closed');
  const section = page.locator('.blog-comments');
  await expect(section).toHaveAttribute('data-state', 'closed');
  await expect(section).toContainText('Comments are closed on this post.');
  // The point of read-only rather than off: what was written is still there.
  await expect(section.locator('.blog-comment').first()).toBeVisible();
  // Still in the markup, so a portal override can reopen it without a reload.
  await expect(section.locator('> .blog-compose')).toBeHidden();
  // No way in through a row either -- reply, edit and delete all go with it.
  await expect(section.locator('.blog-comment__actions:visible')).toHaveCount(0);
});

// Pin, lock and the per-post mode are the owner's, set in the portal. The
// list carries them (`pinned`, `locked`, `policy`); these check what the
// thread makes of them. The route below is registered after
// installCommentApi's, so it answers the list reads.
function listWith(page: Page, body: Record<string, unknown>) {
  return page.route((url) => url.pathname === '/api/v2/comments' && url.searchParams.has('post'), (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ hasMore: false, nextBefore: null, total: 1, ...body }),
  }));
}

test('the pinned root leads the thread under a label, and a new root lands under it', async ({ page }) => {
  const api = await installCommentApi(page);
  await listWith(page, {
    comments: [
      comment({ id: 'comment-pin', body: 'The pinned one.', pinned: true, createdAt: new Date(Date.now() - 86_400_000).toISOString() }),
      comment(),
      comment({ id: 'comment-pin-reply', parentId: 'comment-pin', body: 'A reply under the pin.' }),
    ],
    total: 3,
  });
  await gotoLab(page, 'interactive=1&locale=en');

  const rows = page.locator('.blog-comments__list > article.blog-comment');
  await expect(rows.nth(0)).toHaveAttribute('id', 'comment-comment-pin');
  await expect(rows.nth(0).locator('.blog-comment__badge')).toHaveText('Pinned');
  await expect(rows.nth(1)).toHaveAttribute('id', 'comment-comment-pin-reply');
  await expect(rows.nth(2)).toHaveAttribute('id', 'comment-comment-existing');
  await expect(rows.nth(2).locator('.blog-comment__badge')).toHaveCount(0);

  const compose = page.locator('.blog-comments > .blog-compose');
  await compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await compose.locator('textarea').fill('Optimistic comment.');
  await compose.locator('[data-compose-submit]').click();
  await api.releasePost();
  // Newest root, but the pin and its thread stay on top.
  await expect(page.locator('#comment-comment-posted')).toBeVisible();
  await expect(rows.nth(0)).toHaveAttribute('id', 'comment-comment-pin');
  await expect(rows.nth(2)).toHaveAttribute('id', 'comment-comment-posted');
});

// The pin rides on page one out of date order, so it is no page boundary: a
// held reply under the root just below it is polled on the first page.
test('a held reply under the root below the pin is polled on the first page', async ({ page }) => {
  await page.clock.install();
  const api = await installCommentApi(page, { postOutcome: 'held' });
  await listWith(page, { comments: [comment({ id: 'comment-pin', pinned: true }), comment()], total: 2 });
  const cursors: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v2/comments' && url.searchParams.has('post')) cursors.push(url.searchParams.get('before') ?? '');
  });
  await gotoLab(page, 'interactive=1&locale=en');

  await page.locator('#comment-comment-existing [data-reply-to]').click();
  const reply = page.locator('#blog-reply');
  await reply.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await reply.locator('#blog-reply-text').fill('A held reply.');
  await reply.locator('[data-compose-submit]').click();
  await api.releasePost();
  await expect(page.locator('#comment-comment-posted')).toBeVisible();
  await page.clock.runFor(1_500);
  await expect.poll(() => cursors.length).toBeGreaterThan(1);
  expect(cursors.at(-1)).toBe('');
});

test('a locked thread offers no Reply and says so once, and a late reply is told why', async ({ page }) => {
  const api = await installCommentApi(page, { postStatus: 403, postError: 'thread_locked' });
  await listWith(page, {
    comments: [
      comment({ id: 'comment-locked', body: 'Locked by the owner.', locked: true, mine: false, editableUntil: null, deletable: false }),
      comment(),
      comment({ id: 'comment-locked-reply', parentId: 'comment-locked', body: 'Said before the lock.', mine: false, editableUntil: null, deletable: false }),
    ],
    total: 3,
  });
  await gotoLab(page, 'interactive=1&locale=en');

  const locked = page.locator('#comment-comment-locked');
  await expect(locked).toHaveAttribute('data-locked', 'true');
  await expect(locked.locator('[data-reply-to]')).toHaveCount(0);
  await expect(locked.locator('.blog-comment__closed')).toHaveText('Replies closed');
  // Likes stay: a lock stops new replies, nothing else.
  await expect(locked.locator('[data-comment-like]')).toBeVisible();
  await expect(page.locator('#comment-comment-locked-reply [data-reply-to]')).toHaveCount(0);
  await expect(page.locator('#comment-comment-locked-reply .blog-comment__closed')).toHaveCount(0);

  // A box opened before the lock landed: the refusal names it.
  await page.locator('#comment-comment-existing [data-reply-to]').click();
  const reply = page.locator('#blog-reply');
  await reply.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await reply.locator('#blog-reply-text').fill('Too late.');
  await reply.locator('[data-compose-submit]').click();
  await api.releasePost();
  await expect(reply.locator('[data-compose-error-text]')).toHaveText('Replies to this comment are closed.');
  await expect(reply.locator('[data-compose-error-code]')).toHaveText('NOREPLY 403');
  await expect(reply.locator('#blog-reply-text')).toHaveValue('Too late.');
});

test.describe('a portal override of the post mode', () => {
  const policy = (mode: string) => ({ mode, reactions: true, requireVerifiedEmail: false });

  test('reopens a post its tags closed', async ({ page }) => {
    await installCommentApi(page);
    await listWith(page, { comments: [comment()], policy: policy('open') });
    await gotoLab(page, 'interactive=1&locale=en&mode=readonly');
    const section = page.locator('.blog-comments');
    await expect(section).toHaveAttribute('data-state', 'loaded');
    await expect(section.locator('> .blog-compose')).toBeVisible();
    await expect(section.locator('.blog-comments__notice')).toHaveCount(0);
    await expect(page.locator('#comment-comment-existing [data-reply-to]')).toBeVisible();
  });

  test('closes an open post and keeps its thread', async ({ page }) => {
    await installCommentApi(page);
    await listWith(page, { comments: [comment()], policy: policy('readonly') });
    await gotoLab(page, 'interactive=1&locale=en');
    const section = page.locator('.blog-comments');
    await expect(section).toHaveAttribute('data-state', 'closed');
    await expect(section.locator('.blog-comments__notice')).toContainText('Comments are closed on this post.');
    await expect(section.locator('> .blog-compose')).toBeHidden();
    await expect(page.locator('#comment-comment-existing')).toBeVisible();
    await expect(section.locator('.blog-comment__actions:visible')).toHaveCount(0);
  });

  test('shows a section its tags turned off', async ({ page }) => {
    await installCommentApi(page);
    await listWith(page, { comments: [comment()], policy: policy('open') });
    await page.goto('/lab/comments?interactive=1&locale=en&mode=off');
    await expect(page.locator('.blog-comments')).toBeVisible();
    await expect(page.locator('#comment-comment-existing')).toBeVisible();
  });

  test('hides the section when turned off, and the tags alone leave it hidden', async ({ page }) => {
    await installCommentApi(page);
    await listWith(page, { comments: [comment()], policy: policy('off') });
    const rowReactionReads: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/v2/reactions' && url.searchParams.get('targets')?.startsWith('comment:')) rowReactionReads.push(url.search);
    });
    await page.goto('/lab/comments?interactive=1&locale=en');
    // Gone the moment the first page says off: no rows drawn into a hidden
    // section, and no reactions read for them first.
    await expect(page.locator('.blog-comments')).toBeHidden();
    await expect(page.locator('#comment-comment-existing')).toHaveCount(0);
    expect(rowReactionReads).toEqual([]);

    await listWith(page, { comments: [comment()] });
    await page.goto('/lab/comments?interactive=1&locale=en&mode=off');
    await expect(page.locator('#comment-comment-existing')).toBeAttached();
    await expect(page.locator('.blog-comments')).toBeHidden();
  });
});

test('a verified-only post makes the email field required', async ({ page }) => {
  await gotoLab(page, 'locale=en&requireEmail=1');
  const compose = page.locator('.blog-comments > .blog-compose');
  const email = compose.locator('input[type="email"]');
  await expect(compose).toHaveAttribute('data-require-email', 'true');
  await expect(email).toHaveAttribute('placeholder', 'Email (required)');
  await expect(email).toHaveAttribute('required', '');

  // Anonymous posting is not offered here: an empty address is a refusal.
  // Everywhere else it is simply left blank and the comment goes.
  await compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await compose.locator('.blog-compose__field').fill('A complete comment.');
  await compose.locator('[data-compose-submit]').click();
  await expect(compose.locator('.blog-compose__alert')).toContainText('verified addresses only');
});

// The served HTML, not the rendered page: a browser confirms the link on
// arrival and never rests on `pending`, so this asserts what a scanner and a
// no-JS reader actually get -- the button, in the language the mail was
// written in.
test('reader confirmation serves the pending card in the mail locale', async ({ request }) => {
  const zh = await (await request.get('/reader/confirm?token=fixture&lang=zh')).text();
  expect(zh).toContain('lang="zh"');
  expect(zh).toContain('确认一下是你');
  expect(zh).toContain('是我');

  // Astro escapes apostrophes in text nodes, so compare against the decoded
  // form rather than writing &#39; into every English assertion.
  const en = (await (await request.get('/reader/confirm?token=fixture&lang=en')).text()).replaceAll('&#39;', "'");
  expect(en).toContain('lang="en"');
  expect(en).toContain("Confirm it's you");
  expect(en).toContain("Yes, it's me");
});

test('reader confirmation confirms the link on arrival', async ({ page }) => {
  await page.goto('/reader/confirm?token=fixture&lang=en');
  // A fixture token is not a real one, so the outcome is the refusal -- what
  // matters here is that the page reached an outcome without a press.
  await expect(page.locator('.reader-confirm__card')).not.toHaveAttribute('data-state', 'pending');
});

test('lab exposes moderation busy, conflict, and empty states', async ({ page }) => {
  await gotoLab(page, 'moderation=busy');
  await expect(page.locator('.comments-lab-moderation__actions button').first()).toHaveText('Working…');
  await expect(page.locator('.comments-lab-moderation__actions button').first()).toBeDisabled();

  await gotoLab(page, 'moderation=conflict');
  await expect(page.locator('.comments-lab-moderation__error')).toContainText('Already handled somewhere else');

  await gotoLab(page, 'moderation=empty');
  await expect(page.locator('.comments-lab-moderation__empty')).toContainText('Nothing is waiting for review');
});

test('optimistic comment submit paints before the API response', async ({ page }) => {
  await page.clock.install();
  const api = await installCommentApi(page);
  await gotoLab(page, 'interactive=1&locale=en');

  await expect(page.locator('#comment-comment-existing')).toBeVisible();
  const compose = page.locator('.blog-comments > .blog-compose');
  await compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await compose.locator('input[type="email"]').fill('reader@example.com');
  await compose.locator('textarea').fill('Optimistic comment.');
  await compose.locator('[data-compose-submit]').click();

  await expect(page.locator('.blog-comment__text').filter({ hasText: 'Optimistic comment.' }).first()).toBeVisible();
  await api.releasePost();
  const posted = page.locator('#comment-comment-posted');
  await expect(posted).toBeVisible();

  // The row says the comment went up -- not "verify your email to edit this",
  // which used to land here, read as a refusal, and then stay for good -- and
  // then takes itself away rather than leaving one row wearing a badge.
  const note = posted.locator('.blog-comment__note--posted');
  await expect(note).toHaveText('Posted.');
  await page.clock.runFor(5_400);
  await expect(note).toHaveCount(0);
});

test('optimistic edit paints before the API response', async ({ page }) => {
  const api = await installCommentApi(page);
  await gotoLab(page, 'interactive=1&locale=en');

  const row = page.locator('#comment-comment-existing');
  await row.locator('[data-comment-edit-open]').click();
  await row.locator('[data-comment-edit-field]').fill('Edited comment.');
  await row.locator('[data-comment-edit-save]').click();

  await expect(row.locator('[data-comment-text]')).toContainText('Edited comment.');
  await api.releasePatch();
  await expect(row.locator('[data-comment-text]')).toContainText('Edited comment.');
});

// A held create is not a verdict, and neither is a poll that failed on the
// way (a network blip, an edge 5xx): only a listing can settle the row.
test('a late verdict upgrades a held row, even when a probe fails first', async ({ page }) => {
  await page.clock.install();
  const api = await installCommentApi(page, { postOutcome: 'held' });
  await gotoLab(page, 'interactive=1&locale=en');
  let markProbeFailed!: () => void;
  const probeFailed = new Promise<void>((resolve) => { markProbeFailed = resolve; });
  await page.route(
    (url) => url.pathname === '/api/v2/comments' && url.searchParams.has('post'),
    async (route) => {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'temporary' }) });
      markProbeFailed();
    },
    { times: 1 },
  );
  const compose = page.locator('.blog-comments > .blog-compose');
  await compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await compose.locator('input[type="email"]').fill('reader@example.com');
  await compose.locator('textarea').fill('Optimistic comment.');
  await compose.locator('[data-compose-submit]').click();
  await api.releasePost();
  const posted = page.locator('#comment-comment-posted');
  await expect(posted.locator('.blog-comment__note')).toContainText('Publishing');
  await page.clock.runFor(1_500);
  await probeFailed;
  await page.clock.runFor(2_000);
  await expect(posted.locator('.blog-comment__note')).toHaveCount(0);
  await expect(page.locator('.blog-comments__tally')).toHaveText('2');
});

test('a slow verdict says it is still checking', async ({ page }) => {
  await page.clock.install();
  const api = await installCommentApi(page, { postOutcome: 'held' });
  await gotoLab(page, 'interactive=1&locale=en');
  const compose = page.locator('.blog-comments > .blog-compose');
  await compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await compose.locator('textarea').fill('A slow comment.');
  await compose.locator('[data-compose-submit]').click();
  const ghost = page.locator('.blog-comment[data-pending]').first();
  await expect(ghost.locator('.blog-comment__note')).toHaveText('Publishing');
  await page.clock.runFor(3_000);
  await expect(ghost.locator('.blog-comment__note')).toHaveText('Still checking — a few more seconds');
  // The held row that replaces the stand-in keeps the slower word rather
  // than starting the wait over.
  await api.releasePost();
  await expect(page.locator('#comment-comment-posted .blog-comment__note')).toHaveText('Still checking — a few more seconds');
});

// The list pages by root and lists a reply only beside its root, so a held
// reply under an older root is only found on the page that starts at it.
test('a held reply is polled on the page that lists its root', async ({ page }) => {
  await page.clock.install();
  const api = await installCommentApi(page, { postOutcome: 'held' });
  const listing = (url: URL) => url.pathname === '/api/v2/comments' && url.searchParams.has('post');
  await page.route(listing, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ comments: [comment({ id: 'comment-newer' }), comment()], hasMore: false, nextBefore: null, total: 2 }),
  }));
  const cursors: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (listing(url)) cursors.push(url.searchParams.get('before') ?? '');
  });
  await gotoLab(page, 'interactive=1&locale=en');

  await page.locator('#comment-comment-existing [data-reply-to]').click();
  const reply = page.locator('#blog-reply');
  await reply.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await reply.locator('#blog-reply-text').fill('A held reply.');
  await reply.locator('[data-compose-submit]').click();
  await api.releasePost();
  await expect(page.locator('#comment-comment-posted')).toBeVisible();
  await page.clock.runFor(1_500);
  // The older root's page starts right after the root drawn above it.
  await expect.poll(() => cursors.at(-1)).toBe('comment-newer');
});

// The service refuses a dwell token past a day and drops the comment behind a
// fake success, so a tab left open overnight re-mints as the reader starts
// writing -- never at Post, where a token that young is the other silent drop.
test('a tab open past a day re-mints its dwell token when the reader starts writing', async ({ page }) => {
  await page.clock.install();
  await installCommentApi(page);
  let mints = 0;
  await page.route('**/api/v2/comments/dwell-token', (route) => {
    mints += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'dwell-token' }) });
  });
  await gotoLab(page, 'interactive=1&locale=en');
  await expect.poll(() => mints).toBe(1);

  await page.clock.fastForward(25 * 60 * 60_000);
  await page.locator('.blog-comments > .blog-compose textarea').focus();
  await expect.poll(() => mints).toBe(2);
});

test('a comment awaiting its email says how to publish it', async ({ page }) => {
  const api = await installCommentApi(page, { postOutcome: 'held', unverifiedEmail: true, awaitingEmail: true });
  await gotoLab(page, 'interactive=1&locale=en');
  const compose = page.locator('.blog-comments > .blog-compose');
  await compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await compose.locator('input[type="email"]').fill('reader@example.com');
  await compose.locator('textarea').fill('Optimistic comment.');
  await compose.locator('[data-compose-submit]').click();
  await api.releasePost();
  const posted = page.locator('#comment-comment-posted');
  await expect(posted.locator('.blog-comment__note')).toHaveText('Confirm the link in your inbox and this goes public. Only you can see it for now.');
  await expect(posted).not.toHaveAttribute('data-pending');
  await expect(compose.locator('.blog-compose__nudge-text')).toHaveText("We've sent a message to reader@example.com — confirm it and this comment goes public.");
});

test('an email request keeps a draft typed while it was in the air', async ({ page }) => {
  const api = await installCommentApi(page, { postStatus: 403, postError: 'email_required' });
  await gotoLab(page, 'interactive=1&locale=en');
  const compose = page.locator('.blog-comments > .blog-compose');
  await compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await compose.locator('textarea').fill('First thought.');
  await compose.locator('[data-compose-submit]').click();
  await compose.locator('textarea').fill('Second thought.');
  await api.releasePost();
  await expect(compose.locator('textarea')).toHaveValue('First thought.\n\nSecond thought.');
  await expect(compose.locator('.blog-compose__alert')).toContainText('needs an email');
  await expect(compose.locator('input[type="email"]')).toBeFocused();
});

test('verification nudge opens the localized subscribe panel with the known email', async ({ page }) => {
  const api = await installCommentApi(page, { unverifiedEmail: true });
  await gotoLab(page, 'interactive=1&locale=en');
  const compose = page.locator('.blog-comments > .blog-compose');
  await compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await compose.locator('input[type="email"]').fill('reader@example.com');
  await compose.locator('textarea').fill('Please remember my email.');
  await compose.locator('[data-compose-submit]').click();
  await api.releasePost();
  const nudge = compose.locator('[data-compose-nudge]');
  await expect(nudge).toBeVisible();
  await nudge.locator('[data-compose-subscribe]').click();
  await expect(page.locator('.subscribe-panel')).toHaveClass(/is-open/);
  await expect(page.locator('[data-sub-email]')).toHaveValue('reader@example.com');
  await page.locator('[data-sub-close]').click();
  await nudge.locator('[data-compose-dismiss]').click();
  await expect(nudge).toBeHidden();
});

test('optimistic submit and edit failures restore the reader draft, and report none of it', async ({ page }) => {
  const postApi = await installCommentApi(page, { postStatus: 429 });
  const reports = await captureTelemetry(page);
  await gotoLab(page, 'interactive=1&locale=en');
  const compose = page.locator('.blog-comments > .blog-compose');
  await compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await compose.locator('input[type="email"]').fill('reader@example.com');
  await compose.locator('textarea').fill('Restore this draft.');
  await compose.locator('[data-compose-submit]').click();
  await expect(page.locator('.blog-comment__text').filter({ hasText: 'Restore this draft.' }).first()).toBeVisible();
  await postApi.releasePost();
  await expect(compose.locator('textarea')).toHaveValue('Restore this draft.');
  await expect(compose.locator('.blog-compose__alert')).toContainText('Wait before trying again');
  // One report of the final outcome, and nothing the reader wrote in it.
  await expect.poll(() => reports.length).toBe(1);
  expect(reports).toEqual([{ kind: 'comment', outcome: 'http_error', challenges: 0 }]);

  // Replace the route with a failed PATCH while keeping the same fixture GETs.
  await page.unroute('**/api/v2/comments**');
  const patchApi = await installCommentApi(page, { patchStatus: 409 });
  await page.reload();
  await expect(page.locator('#comment-comment-existing')).toBeVisible();
  const row = page.locator('#comment-comment-existing');
  await row.locator('[data-comment-edit-open]').click();
  await row.locator('[data-comment-edit-field]').fill('Keep this attempted edit.');
  await row.locator('[data-comment-edit-save]').click();
  await patchApi.releasePatch();
  await expect(row.locator('[data-comment-edit-field]')).toBeVisible();
  await expect(row.locator('[data-comment-edit-field]')).toHaveValue('Keep this attempted edit.');
  await expect(row.locator('.blog-comment__edit-error')).toContainText("edit window has closed");
});

test('claimed identity sign-out is armed, cancellable, and clears the form', async ({ page }) => {
  await gotoLab(page, 'phase=claimed&locale=en');
  const compose = page.locator('.blog-comments > .blog-compose');
  const signOut = compose.locator('[data-compose-signout]');
  // A symbol at rest, so the state lives in the label -- and the question the
  // second press answers has to be legible without a screen reader, which is
  // the width assertion: the button is a 28px square until it is armed.
  await expect(signOut).toHaveAttribute('aria-label', 'Sign out');
  expect((await signOut.boundingBox())?.width).toBe(28);
  await expect(compose.locator('.blog-compose__claim .blog-compose__whoname')).toHaveText('Murray');
  await signOut.click();
  await expect(signOut).toHaveAttribute('aria-label', 'Sign out?');
  await expect(compose.locator('.blog-compose__signout-label')).toHaveText('Sign out?');
  // Polled, not read once: the label opens over 220ms, so a single measure
  // races the transition it is there to prove.
  await expect
    .poll(async () => (await signOut.boundingBox())?.width ?? 0)
    .toBeGreaterThan(40);
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
    if (new URL(route.request().url()).pathname.endsWith('/telemetry')) return route.fallback();
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

  await gotoLab(page, 'interactive=1&locale=en');
  const more = page.locator('[data-load-more]');
  await more.click();
  await expect(more).toHaveText('Retry');
  await expect(page.locator('.blog-comments__more-error')).toContainText("didn't make it");

  const row = page.locator('#comment-comment-existing');
  await row.locator('[data-comment-like]').click();
  await expect(row.locator('[data-comment-action-error]')).toHaveCount(0);
  await expect(row.locator('.blog-comment__action-error')).toContainText('Something dozed off');

  await page.locator('.blog-react__card').click();
  await expect(page.locator('.blog-react__error')).toContainText('did not stick');

  page.on('dialog', (dialog) => void dialog.accept());
  await row.locator('[data-comment-delete]').click();
  await expect(row.locator('.blog-comment__action-error')).toContainText("edit window has closed");
});

/* The refusal a reader hits from one IP after a handful of likes: Cloudflare
   decides it wants a human, the interaction-only widget cannot settle it on
   its own, and site-api answers 400 `turnstile_failed`. The message that lands
   says "tick the box below", so a box has to be there -- these two lock down
   that it is, in the surface that was refused, and that solving it sends the
   like rather than leaving the reader to reload.

   Cloudflare is stubbed rather than reached: the real widget cannot be solved
   by a test, and `window.turnstile` being present is also what stops
   loadTurnstileScript from fetching challenges.cloudflare.com at all. */
async function stubTurnstile(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    (window as unknown as { __turnstileRenders: number }).__turnstileRenders = 0;
    (window as unknown as { turnstile: unknown }).turnstile = {
      render(container: HTMLElement, opts: Record<string, any>) {
        (window as unknown as { __turnstileRenders: number }).__turnstileRenders += 1;
        // The escalated case: the silent widget fails, exactly as it does for
        // an IP Cloudflare has decided to look at twice.
        if (opts.appearance !== 'always') {
          container.replaceChildren();
          setTimeout(() => opts['error-callback']?.(), 10);
          return 'silent';
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.fakeChallenge = '';
        button.textContent = 'I am human';
        button.addEventListener('click', () => opts.callback('good-token'));
        container.replaceChildren(button);
        opts['before-interactive-callback']?.();
        return 'forced';
      },
      reset() {},
      remove() {},
    };
  });
}

/** Refuses every like until one arrives carrying a solved challenge, then
    -- like site-api -- hands out a reader pass and honours a bare request
    for as long as it lasts. The pass is a cookie the browser cannot read, so
    the stand-in only tracks whether one was issued. */
async function installRefusedReactions(page: import('@playwright/test').Page) {
  const bodies: Array<Record<string, unknown>> = [];
  let passIssued = false;
  await page.route('**/api/v2/reactions**', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reactions: {} }) });
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    bodies.push(body);
    const token = body.turnstileToken;
    if (token !== 'good-token' && !(token === '' && passIssued)) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'turnstile_failed', code: 'invalid_token' }),
      });
      return;
    }
    passIssued = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reaction: { emoji: '❤️', count: 42, reacted: true, reactors: [] },
        passUntil: Date.now() + 60 * 60_000,
      }),
    });
  });
  return bodies;
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v2/comments/telemetry', (route) => route.fulfill({ status: 204 }));
  await page.addInitScript(() => {
    try { window.localStorage.removeItem('blog:reaction-pass-until'); } catch {}
  });
});

async function captureTelemetry(page: import('@playwright/test').Page) {
  const reports: unknown[] = [];
  await page.route('**/api/v2/comments/telemetry', async (route) => {
    reports.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  return reports;
}

test('a network failure on the post heart reports once without blocking recovery', async ({ page }) => {
  await installCommentApi(page);
  const reports = await captureTelemetry(page);
  await page.route('**/api/v2/reactions/toggle', (route) => route.abort('failed'));
  await gotoLab(page, 'interactive=1&locale=en');
  await page.locator('.blog-react__card').click();
  await expect.poll(() => reports.length).toBe(1);
  expect(reports).toEqual([{ kind: 'reaction', outcome: 'network_error', challenges: 0 }]);
  await expect(page.locator('.blog-react__card')).toHaveAttribute('aria-pressed', 'false');
});

test('a refused comment posts once its challenge is solved, and reports one accepted attempt', async ({ page }) => {
  await stubTurnstile(page);
  await installCommentApi(page);
  let requests = 0;
  await page.route('**/api/v2/comments**', async (route) => {
    if (new URL(route.request().url()).pathname !== '/api/v2/comments' || route.request().method() !== 'POST') return route.fallback();
    requests += 1;
    if (route.request().postDataJSON().turnstileToken !== 'good-token') {
      await route.fulfill({ status: 400, json: { error: 'turnstile_failed' } });
      return;
    }
    await route.fulfill({ json: { outcome: 'published', comment: comment({ id: 'comment-posted' }) } });
  });
  const reports = await captureTelemetry(page);
  await gotoLab(page, 'interactive=1&turnstile=1&locale=en');
  const compose = page.locator('.blog-comments > .blog-compose');
  await compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await compose.locator('input[type="email"]').fill('reader@example.com');
  await compose.locator('textarea').fill('A comment after a challenge.');
  await compose.locator('[data-compose-submit]').click();
  await compose.locator('[data-fake-challenge]').click();
  await expect(page.locator('#comment-comment-posted')).toBeVisible();
  await expect.poll(() => reports.length).toBe(1);
  expect(requests).toBe(2);
  expect(reports).toEqual([{ kind: 'comment', outcome: 'accepted', challenges: 1 }]);
});

for (const surface of ['comment', 'post'] as const) {
  test(`a final challenge refusal reports one ${surface} heart attempt across retries`, async ({ page }) => {
    await stubTurnstile(page);
    await installCommentApi(page);
    const reports = await captureTelemetry(page);
    let requests = 0;
    await page.route('**/api/v2/reactions/toggle', async (route) => {
      requests += 1;
      await route.fulfill({ status: 400, json: { error: 'turnstile_failed' } });
    });
    await gotoLab(page, 'interactive=1&turnstile=1&locale=en');
    const owner = surface === 'comment' ? page.locator('#comment-comment-existing') : page.locator('.blog-react');
    await owner.locator(surface === 'comment' ? '[data-comment-like]' : '.blog-react__card').click();
    await owner.locator('[data-fake-challenge]').click();
    await expect.poll(() => reports.length).toBe(1);
    expect(requests).toBe(2);
    expect(reports).toEqual([{ kind: 'reaction', outcome: 'challenge_failed', challenges: 1 }]);
  });
}

test('a refused like on a comment opens a challenge under that row and resends once it is solved', async ({ page }) => {
  await stubTurnstile(page);
  await installCommentApi(page);
  const bodies = await installRefusedReactions(page);
  const reports = await captureTelemetry(page);

  await gotoLab(page, 'interactive=1&turnstile=1&locale=en');

  const row = page.locator('#comment-comment-existing');
  await row.locator('[data-comment-like]').click();

  const alert = row.locator('.blog-comment__action-error');
  await expect(alert).toContainText('human check');
  const host = row.locator('[data-reaction-turnstile]');
  await expect(host).toHaveAttribute('data-turnstile-interactive', '');
  const challenge = host.locator('[data-fake-challenge]');
  await expect(challenge).toBeVisible();

  await challenge.click();
  await expect(alert).toHaveCount(0);
  await expect(row.locator('[data-like-count]')).toHaveText('42');
  await expect(row.locator('[data-comment-like]')).toHaveAttribute('aria-pressed', 'true');
  await expect(host).not.toHaveAttribute('data-turnstile-interactive', '');
  expect(bodies.map((body) => body.turnstileToken)).toEqual(['', 'good-token']);
  // The row's like carries the same optional browser evidence as the post heart.
  expect(bodies[1]).toHaveProperty('clientFp');
  await expect.poll(() => reports.length).toBe(1);
  expect(reports).toEqual([{ kind: 'reaction', outcome: 'accepted', challenges: 1 }]);
});

test('a refused like on the post bar opens a challenge in the bar and resends once it is solved', async ({ page }) => {
  await stubTurnstile(page);
  await installCommentApi(page);
  const bodies = await installRefusedReactions(page);

  await gotoLab(page, 'interactive=1&turnstile=1&locale=en');

  const bar = page.locator('.blog-react');
  await bar.locator('.blog-react__card').click();

  await expect(page.locator('.blog-react__error')).toContainText('human check');
  const host = bar.locator('.blog-compose__turnstile');
  await expect(host).toHaveAttribute('data-turnstile-interactive', '');
  await host.locator('[data-fake-challenge]').click();

  await expect(page.locator('.blog-react__error')).toHaveCount(0);
  await expect(bar.locator('.blog-react__pill--liked .blog-react__count')).toHaveText('42');
  expect(bodies.map((body) => body.turnstileToken)).toEqual(['', 'good-token']);
});

test('a solved challenge earns a pass that the next like spends without a widget', async ({ page }) => {
  await stubTurnstile(page);
  await installCommentApi(page);
  const bodies = await installRefusedReactions(page);

  await gotoLab(page, 'interactive=1&turnstile=1&locale=en');

  const row = page.locator('#comment-comment-existing');
  await row.locator('[data-comment-like]').click();
  await row.locator('[data-reaction-turnstile] [data-fake-challenge]').click();
  await expect(row.locator('[data-like-count]')).toHaveText('42');
  const rendersAfterChallenge = await page.evaluate(() => (window as unknown as { __turnstileRenders: number }).__turnstileRenders);

  // The pass came back on that success. The post bar's like now goes out
  // bare: no token, no render, no challenge, and it lands.
  await page.locator('.blog-react__card').click();
  await expect(page.locator('.blog-react__pill--liked .blog-react__count')).toHaveText('42');
  await expect(page.locator('.blog-react__error')).toHaveCount(0);
  expect(bodies.map((body) => body.turnstileToken)).toEqual(['', 'good-token', '']);
  expect(await page.evaluate(() => (window as unknown as { __turnstileRenders: number }).__turnstileRenders)).toBe(rendersAfterChallenge);
});

/** The avatar-seed route: `issue` hands out one seed, `offer` a fresh five per
    call, `choose` echoes the pick. Every body is kept for the assertions. */
async function installAvatarSeedApi(page: import('@playwright/test').Page) {
  const bodies: Array<{ mode?: string; seed?: number; current?: number | null }> = [];
  let batch = 0;
  await page.route('**/api/v2/reader/avatar-seed', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    bodies.push(body);
    if (body.mode === 'offer') {
      batch += 1;
      const seeds = Array.from({ length: 5 }, (_, i) => 1_000_000 * batch + 104_729 * i + i);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ seeds }) });
      return;
    }
    const seed = body.mode === 'choose' ? body.seed : 424_242;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ seed, persisted: false }) });
  });
  return bodies;
}

const fanSeeds = (page: import('@playwright/test').Page) =>
  page.locator('.blog-avatar-fan.is-open .blog-avatar-fan__item[data-seed]').evaluateAll(
    (items) => items.map((item) => (item as HTMLElement).dataset.seed),
  );

test('the face beside the name field does not follow what is typed', async ({ page }) => {
  await installCommentApi(page);
  const bodies = await installAvatarSeedApi(page);
  await page.goto('/lab/comments?interactive=1&locale=en', { waitUntil: 'networkidle' });

  const compose = page.locator('.blog-comments > .blog-compose');
  const face = compose.locator('[data-compose-identity] [data-avatar-own]');
  const name = compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])');
  await name.pressSequentially('n');
  await expect(face).not.toHaveClass(/is-empty/);
  const first = await face.innerHTML();

  await name.pressSequentially('nnn');
  expect(await face.innerHTML()).toBe(first);
  expect(bodies.filter((body) => !body.mode)).toHaveLength(1);
});

test('pressing your face fans out five to pick from, and more deals five others', async ({ page }) => {
  await installCommentApi(page);
  const bodies = await installAvatarSeedApi(page);
  await page.goto('/lab/comments?interactive=1&locale=en', { waitUntil: 'networkidle' });

  const face = page.locator('.blog-comments > .blog-compose [data-compose-identity] [data-avatar-own]');
  await face.click();
  await expect(face).toHaveAttribute('aria-expanded', 'true');
  const fan = page.locator('.blog-avatar-fan.is-open');
  await expect(fan.locator('.blog-avatar-fan__item')).toHaveCount(6);
  await expect(fan.locator('.blog-avatar-fan__item[data-seed]')).toHaveCount(5);
  const firstBatch = await fanSeeds(page);

  await fan.getByRole('button', { name: 'Show five more' }).click();
  await expect.poll(() => fanSeeds(page)).not.toEqual(firstBatch);
  const secondBatch = await fanSeeds(page);
  expect(new Set(secondBatch).size).toBe(5);

  await fan.getByRole('button', { name: 'Face 3' }).click();
  await expect(page.locator('.blog-avatar-fan')).toHaveCount(0);
  await expect(face).toHaveAttribute('aria-expanded', 'false');
  await expect(face).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('blog:avatar-seed'))).toBe(secondBatch[2]);
  await expect.poll(() => bodies.find((body) => body.mode === 'choose')?.seed).toBe(Number(secondBatch[2]));
});

test('the fan answers the keyboard and puts itself away', async ({ page }) => {
  await installCommentApi(page);
  await installAvatarSeedApi(page);
  await page.goto('/lab/comments?interactive=1&locale=en', { waitUntil: 'networkidle' });

  const face = page.locator('.blog-comments > .blog-compose [data-compose-identity] [data-avatar-own]');
  await face.focus();
  await page.keyboard.press('Enter');
  const fan = page.locator('.blog-avatar-fan.is-open');
  await expect(fan.getByRole('button', { name: 'Face 1' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(fan.getByRole('button', { name: 'Show five more' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.blog-avatar-fan')).toHaveCount(0);
  await expect(face).toBeFocused();

  // A press anywhere else dismisses it too. The face's own spot is the more
  // button while the fan is out, so a second press there deals instead.
  await face.click();
  await expect(fan).toHaveCount(1);
  const more = await fan.getByRole('button', { name: 'Show five more' }).boundingBox();
  const own = await face.boundingBox();
  expect(Math.abs(more!.x + more!.width / 2 - (own!.x + own!.width / 2))).toBeLessThan(1);
  await page.mouse.click(5, 5);
  await expect(page.locator('.blog-avatar-fan')).toHaveCount(0);
});

test('on a phone the fan fits on screen and a drag from the face picks one', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-US' });
  const page = await context.newPage();
  await installCommentApi(page);
  const bodies = await installAvatarSeedApi(page);
  await page.goto('/lab/comments?interactive=1&locale=en', { waitUntil: 'networkidle' });

  const face = page.locator('.blog-comments > .blog-compose [data-compose-identity] [data-avatar-own]');
  await face.scrollIntoViewIfNeeded();
  await face.tap();
  const fan = page.locator('.blog-avatar-fan.is-open');
  await expect(fan.locator('.blog-avatar-fan__item[data-seed]')).toHaveCount(5);
  await page.waitForTimeout(500);
  for (const box of await fan.locator('.blog-avatar-fan__item').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().toJSON()))) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(390);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(844);
  }

  // Put it away, then press, slide onto the fourth face and lift.
  const beside = await face.boundingBox();
  await page.touchscreen.tap(4, beside!.y + 250);
  await expect(page.locator('.blog-avatar-fan')).toHaveCount(0);
  const from = await face.boundingBox();
  const cdp = await context.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', from!.x + from!.width / 2, from!.y + from!.height / 2);
  const target = fan.getByRole('button', { name: 'Face 4' });
  await expect(target).toHaveAttribute('data-seed', /\d+/);
  await page.waitForTimeout(450);
  const to = await target.boundingBox();
  await touch('touchMove', from!.x + 20, from!.y + 10);
  await touch('touchMove', to!.x + to!.width / 2, to!.y + to!.height / 2);
  await expect(target).toHaveClass(/is-hot/);
  const picked = await target.getAttribute('data-seed');
  await touch('touchEnd', 0, 0);

  await expect(page.locator('.blog-avatar-fan')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('blog:avatar-seed'))).toBe(picked);
  await expect.poll(() => bodies.find((body) => body.mode === 'choose')?.seed).toBe(Number(picked));
  await context.close();
});
