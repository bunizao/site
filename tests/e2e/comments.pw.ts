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
  postStatus?: number;
  patchStatus?: number;
  postOutcome?: 'published' | 'held';
  unverifiedEmail?: boolean;
} = {}) {
  await page.route('**/api/v2/reader/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ reader: null }),
  }));

  let postRelease: (() => void) | undefined;
  let patchRelease: (() => void) | undefined;
  let postCompleted = false;
  const postGate = new Promise<void>((resolve) => { postRelease = resolve; });
  const patchGate = new Promise<void>((resolve) => { patchRelease = resolve; });

  await page.route('**/api/v2/comments**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      if (options.onPost) await options.onPost(() => postRelease?.());
      await postGate;
      if (options.postStatus && options.postStatus !== 200) {
        await route.fulfill({ status: options.postStatus, contentType: 'application/json', body: JSON.stringify({ error: 'rate limited' }) });
        return;
      }
      postCompleted = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ outcome: options.postOutcome ?? 'published', comment: comment({ id: 'comment-posted', body: 'Optimistic comment.', status: options.postOutcome ?? 'published' }), unverifiedEmail: options.unverifiedEmail ?? false }),
      });
      return;
    }
    if (request.method() === 'PATCH') {
      if (options.onPatch) await options.onPatch(() => patchRelease?.());
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
    releasePost: () => postRelease?.(),
    releasePatch: () => patchRelease?.(),
  };
}

test('lab lists every interaction outcome and transitions reader verification', async ({ page }) => {
  await page.goto('/lab/comments?locale=en&receipt=error&error=BOT&verify=pending', { waitUntil: 'networkidle' });

  await expect(page.locator('.blog-compose__alert:visible')).toContainText('human check');
  await expect(page.locator('.blog-comments > .blog-compose [data-compose-identity] input[type="text"]').first()).toHaveAttribute('placeholder', 'Name');
  await expect(page.locator('.comments-lab-catalog tbody tr')).toHaveCount(58);
  await expect(page.locator('.comments-lab-catalog')).toContainText('Submit/edit failure (BOT)');
  await expect(page.locator('.blog-comment--held .blog-comment__note')).toContainText('Posted');
  await expect(page.locator('.comments-lab-preview .blog-compose__preview')).toBeVisible();
  await expect(page.locator('.comments-lab-preview .blog-compose__preview-body strong')).toHaveText('preview');
  await expect(page.locator('.comments-lab-preview .blog-compose__preview-body code')).toHaveText('comment-markdown.ts');
  await expect(page.locator('[data-subscribe-toggle="blog"]')).toContainText('Subscribe');
  await expect(page.locator('[data-share-copy]')).toHaveAttribute('aria-label', 'Copy link');

  const duplicateIds = await page.locator('[id]').evaluateAll((nodes) => {
    const ids = nodes.map((node) => node.id).filter(Boolean);
    return ids.length !== new Set(ids).size;
  });
  expect(duplicateIds).toBe(false);

  await page.locator('[data-verify-confirm]').click();
  await expect(page.locator('.comments-lab-verify .reader-confirm__card')).toHaveAttribute('data-state', 'confirmed');
  await expect(page.locator('.comments-lab-verify')).toContainText("You're verified!");

  await page.goto('/lab/comments?locale=en&verify=invalid', { waitUntil: 'networkidle' });
  await page.locator('[data-verify-resend]').click();
  await expect(page.locator('.comments-lab-verify .reader-confirm__card')).toHaveAttribute('data-state', 'resent');
  await expect(page.locator('.comments-lab-verify')).toContainText('Check your inbox');
});

// The confirmed card is where reply alerts get turned down. Three switches,
// each phrased so that "on" means the thing happens, and the post-scoped one
// only exists when the mail that sent you here named a post.
test('confirm card scopes reply alerts to one post or all of them', async ({ page }) => {
  await page.goto('/lab/comments?locale=zh&verify=confirmed', { waitUntil: 'networkidle' });
  const prefs = page.locator('.comments-lab-verify .reader-confirm__prefs');
  await expect(prefs.locator('input[type="checkbox"]')).toHaveCount(2);
  await expect(prefs).not.toContainText('接收这篇文章的回复提醒');

  await page.goto('/lab/comments?locale=zh&verify=settings', { waitUntil: 'networkidle' });
  const switches = prefs.locator('.reader-confirm__switch');
  await expect(switches).toHaveCount(3);
  await expect(switches.nth(0)).toContainText('有人回复我的评论时发送邮件提醒');
  await expect(switches.nth(1)).toContainText('接收这篇文章的回复提醒');
  await expect(switches.nth(2)).toContainText('订阅 buxx.me 的最新文章');
  // Drawn as a track, not a native box: a 16px checkbox would mean the CSS
  // never landed.
  const width = await switches.nth(0).locator('input').evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(30);
});

test('a resolved avatar draws a photo, everyone else draws initials', async ({ page }) => {
  await page.goto('/lab/comments?locale=en', { waitUntil: 'networkidle' });
  const withPhoto = page.locator('#comment-8 .blog-comment__avatar');
  await expect(withPhoto).toHaveJSProperty('tagName', 'IMG');
  await expect(withPhoto).toHaveAttribute('src', '/avatar.webp');
  // A row whose writer never resolved one falls back to initials rather than
  // a broken image -- the avatar URL is empty precisely when there is nothing
  // to fetch.
  const withoutPhoto = page.locator('#comment-7a .blog-comment__avatar');
  await expect(withoutPhoto).toHaveClass(/blog-avatar-initials/);
});

test('mute card says what went quiet and what did not', async ({ page }) => {
  await page.goto('/lab/comments?locale=zh&mute=muted', { waitUntil: 'networkidle' });
  const card = page.locator('.comments-lab-mute .reader-confirm__card');
  await expect(card).toHaveAttribute('data-state', 'muted');
  // The one thing a reader needs back from a button they pressed in a mail:
  // how far the quiet reaches.
  await expect(card).toContainText('这个对话已静音');
  await expect(card).toContainText('其他文章和其他对话照常提醒');
  await expect(card.getByRole('button', { name: '恢复这个对话的提醒' })).toBeVisible();

  await page.goto('/lab/comments?locale=zh&mute=invalid', { waitUntil: 'networkidle' });
  // An expired mute link is a dead end unless it hands over the settings card.
  await expect(card).toContainText('链接已失效');
  await expect(card.getByRole('link', { name: '打开评论提醒设置' })).toHaveAttribute('href', '/reader/confirm');
});

test('lab previews the localized reader verification email from site-api', async ({ page }) => {
  await page.goto('/lab/comments?locale=zh', { waitUntil: 'networkidle' });
  const preview = page.locator('section[aria-labelledby="comments-lab-newsletter-title"]');
  await expect(preview).toContainText('site-api · buildReaderVerifyEmail');
  await expect(preview.locator('[data-reader-verify-subject]')).toHaveText('你的评论已成功发布！请验证邮箱');
  await expect(preview.locator('[data-reader-verify-email]')).toHaveAttribute('lang', 'zh');
  await expect(preview).toContainText('你的评论已成功发布！请验证邮箱。');
  await expect(preview).toContainText('互动提醒');
  await expect(preview).toContainText('默认关闭');
  await expect(preview.getByRole('link', { name: '验证邮箱' })).toBeVisible();

  await page.goto('/lab/comments?locale=en', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-reader-verify-subject]')).toHaveText('Your comment is live — please confirm your email');
  await expect(page.locator('[data-reader-verify-email]')).toHaveAttribute('lang', 'en');
  await expect(preview).toContainText('Reply alerts');
  await expect(page.getByRole('link', { name: 'Confirm email' })).toBeVisible();
});

test('lab previews the reply notification email', async ({ page }) => {
  await page.goto('/lab/comments?locale=zh', { waitUntil: 'networkidle' });
  const preview = page.locator('section[aria-labelledby="comments-lab-reply-mail-title"]');
  await expect(preview).toContainText('site-api · buildCommentReplyEmail');
  await expect(preview.locator('[data-reader-reply-subject]')).toHaveText('Nina Kato 回复了你的评论');
  await expect(preview.locator('[data-reader-reply-email]')).toHaveAttribute('lang', 'zh');
  // Both halves of the thread: the reader cannot place a reply without the
  // comment it answers.
  await expect(preview).toContainText('你的评论');
  await expect(preview).toContainText('Nina Kato 的回复');
  await expect(preview.getByRole('link', { name: '查看完整对话' })).toBeVisible();
  // Two off switches, and they are not the same switch. The first silences
  // this one conversation; the second is the settings card, and it carries
  // the post so "just this one" is on offer there.
  await expect(preview.getByRole('link', { name: '不再接收这个对话的提醒。' }))
    .toHaveAttribute('href', '/reader/mute?lang=zh&token=preview');
  await expect(preview.getByRole('link', { name: '只关掉这篇文章，或者全部关闭。' }))
    .toHaveAttribute('href', '/reader/confirm?lang=zh&post=sample-post');

  await page.goto('/lab/comments?locale=en', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-reader-reply-subject]')).toHaveText('Nina Kato replied to your comment');
  await expect(page.locator('[data-reader-reply-email]')).toHaveAttribute('lang', 'en');
});

test('compose preview opens only for supported Markdown and closes when emptied', async ({ page }) => {
  await page.goto('/lab/comments?locale=en', { waitUntil: 'networkidle' });
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
  await page.goto('/lab/comments?locale=en', { waitUntil: 'networkidle' });
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
  await page.goto('/lab/comments?locale=en', { waitUntil: 'networkidle' });
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
  await page.goto('/reader/confirm?token=fixture&lang=en', { waitUntil: 'networkidle' });
  // A fixture token is not a real one, so the outcome is the refusal -- what
  // matters here is that the page reached an outcome without a press.
  await expect(page.locator('.reader-confirm__card')).not.toHaveAttribute('data-state', 'pending');
});

test('lab exposes moderation busy, conflict, and empty states', async ({ page }) => {
  await page.goto('/lab/comments?moderation=busy', { waitUntil: 'networkidle' });
  await expect(page.locator('.comments-lab-moderation__actions button').first()).toHaveText('Working…');
  await expect(page.locator('.comments-lab-moderation__actions button').first()).toBeDisabled();

  await page.goto('/lab/comments?moderation=conflict', { waitUntil: 'networkidle' });
  await expect(page.locator('.comments-lab-moderation__error')).toContainText('Already handled somewhere else');

  await page.goto('/lab/comments?moderation=empty', { waitUntil: 'networkidle' });
  await expect(page.locator('.comments-lab-moderation__empty')).toContainText('Nothing is waiting for review');
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
  const posted = page.locator('#comment-comment-posted');
  await expect(posted).toBeVisible();

  // The row says the comment went up -- not "verify your email to edit this",
  // which used to land here, read as a refusal, and then stay for good -- and
  // then takes itself away rather than leaving one row wearing a badge.
  const note = posted.locator('.blog-comment__note--posted');
  await expect(note).toHaveText('Posted.');
  await expect(note).toHaveCount(0, { timeout: 15_000 });
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

test('a late moderation verdict upgrades a held optimistic row', async ({ page }) => {
  let release: (() => void) | undefined;
  await installCommentApi(page, { postOutcome: 'held', onPost: async (next) => { release = next; } });
  await page.goto('/lab/comments?interactive=1&locale=en', { waitUntil: 'networkidle' });
  const compose = page.locator('.blog-comments > .blog-compose');
  await compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await compose.locator('input[type="email"]').fill('reader@example.com');
  await compose.locator('textarea').fill('Optimistic comment.');
  await compose.locator('[data-compose-submit]').click();
  release?.();
  const posted = page.locator('#comment-comment-posted');
  await expect(posted.locator('.blog-comment__note')).toContainText('Publishing');
  await expect(posted.locator('.blog-comment__note')).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('.blog-comments__tally')).toHaveText('2');
});

test('verification nudge opens the localized subscribe panel with the known email', async ({ page }) => {
  let release: (() => void) | undefined;
  await installCommentApi(page, { unverifiedEmail: true, onPost: async (next) => { release = next; } });
  await page.goto('/lab/comments?interactive=1&locale=en', { waitUntil: 'networkidle' });
  const compose = page.locator('.blog-comments > .blog-compose');
  await compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await compose.locator('input[type="email"]').fill('reader@example.com');
  await compose.locator('textarea').fill('Please remember my email.');
  await compose.locator('[data-compose-submit]').click();
  release?.();
  const nudge = compose.locator('[data-compose-nudge]');
  await expect(nudge).toBeVisible();
  await nudge.locator('[data-compose-subscribe]').click();
  await expect(page.locator('.subscribe-panel')).toHaveClass(/is-open/);
  await expect(page.locator('[data-sub-email]')).toHaveValue('reader@example.com');
  await page.locator('[data-sub-close]').click();
  await nudge.locator('[data-compose-dismiss]').click();
  await expect(nudge).toBeHidden();
});

test('optimistic submit and edit failures restore the reader draft', async ({ page }) => {
  let releasePost: (() => void) | undefined;
  await installCommentApi(page, { postStatus: 429, onPost: async (next) => { releasePost = next; } });
  await page.goto('/lab/comments?interactive=1&locale=en', { waitUntil: 'networkidle' });
  const compose = page.locator('.blog-comments > .blog-compose');
  await compose.locator('[data-compose-identity] input[type="text"]:not([data-honeypot])').fill('Reader');
  await compose.locator('input[type="email"]').fill('reader@example.com');
  await compose.locator('textarea').fill('Restore this draft.');
  await compose.locator('[data-compose-submit]').click();
  await expect(page.locator('.blog-comment__text').filter({ hasText: 'Restore this draft.' }).first()).toBeVisible();
  releasePost?.();
  await expect(compose.locator('textarea')).toHaveValue('Restore this draft.');
  await expect(compose.locator('.blog-compose__alert')).toContainText('Wait before trying again');

  let releasePatch: (() => void) | undefined;
  await page.reload({ waitUntil: 'networkidle' });
  // Replace the route with a failed PATCH while keeping the same fixture GETs.
  await page.unroute('**/api/v2/comments**');
  await installCommentApi(page, { patchStatus: 409, onPatch: async (next) => { releasePatch = next; } });
  await page.reload({ waitUntil: 'networkidle' });
  const row = page.locator('#comment-comment-existing');
  await row.locator('[data-comment-edit-open]').click();
  await row.locator('[data-comment-edit-field]').fill('Keep this attempted edit.');
  await row.locator('[data-comment-edit-save]').click();
  releasePatch?.();
  await expect(row.locator('[data-comment-edit-field]')).toBeVisible();
  await expect(row.locator('[data-comment-edit-field]')).toHaveValue('Keep this attempted edit.');
  await expect(row.locator('.blog-comment__edit-error')).toContainText("edit window has closed");
});

test('claimed identity sign-out is armed, cancellable, and clears the form', async ({ page }) => {
  await page.goto('/lab/comments?phase=claimed&locale=en', { waitUntil: 'networkidle' });
  const compose = page.locator('.blog-comments > .blog-compose');
  const signOut = compose.locator('[data-compose-signout]');
  // The button is a symbol now, so what says which press this is -- to a
  // screen reader and to this test -- is the label, not the text.
  await expect(signOut).toHaveAttribute('aria-label', 'Sign out');
  await expect(compose.locator('.blog-compose__claim .blog-compose__whoname')).toHaveText('Murray');
  await signOut.click();
  await expect(signOut).toHaveAttribute('aria-label', 'Sign out?');
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

  await page.locator('.blog-react__card').click();
  await expect(page.locator('.blog-react__error')).toContainText('did not stick');

  page.on('dialog', (dialog) => void dialog.accept());
  await row.locator('[data-comment-delete]').click();
  await expect(row.locator('.blog-comment__action-error')).toContainText("edit window has closed");
});
