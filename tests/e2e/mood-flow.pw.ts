import { expect, test } from './fixtures';
import { getLatestMoodId } from './helpers';

function createMoodFeedPayload(moodId: string) {
  return {
    posts: [
      {
        id: moodId,
        datetime: '2026-02-10T13:00:00+00:00',
        tag: 'e2e',
        previewText: 'E2E mood feed item',
        previewHtml: 'E2E mood feed item',
        image: null,
        mediaHtml: '',
        needsDetailPage: true,
        forwardedFrom: null,
        quote: null,
        reactions: [],
        commentsCount: 1,
      },
    ],
    channel: {
      slug: 'e2e',
      title: 'E2E Channel',
      description: 'E2E mood feed',
      avatar: '',
    },
  };
}

function createGalleryFeedPayload(moodId: string) {
  return {
    posts: [
      {
        id: moodId,
        datetime: '2026-02-10T13:00:00+00:00',
        tag: 'gallery',
        previewText: 'E2E gallery mood',
        previewHtml: 'E2E gallery mood',
        gallery: {
          count: 3,
          items: [
            {
              src: 'https://image.example.test/mood/555/0',
              fallbackSrc: '/static/https://cdn4.telesco.pe/file/gallery-0.jpg',
              width: 720,
              height: 960,
              layout: 'portrait',
              alt: '',
            },
            {
              src: 'https://image.example.test/mood/555/1',
              fallbackSrc: '/static/https://cdn4.telesco.pe/file/gallery-1.jpg',
              width: 1200,
              height: 900,
              layout: 'landscape',
              alt: '',
            },
            {
              src: 'https://image.example.test/mood/555/2',
              fallbackSrc: '/static/https://cdn4.telesco.pe/file/gallery-2.jpg',
              width: 540,
              height: 1200,
              layout: 'ultra-tall',
              alt: '',
            },
          ],
        },
        image: 'https://image.example.test/mood/555/0',
        imageFallback: '/static/https://cdn4.telesco.pe/file/gallery-0.jpg',
        imageWidth: 720,
        imageHeight: 960,
        imageLayout: 'portrait',
        mediaHtml: '',
        needsDetailPage: true,
        forwardedFrom: null,
        quote: null,
        reactions: [],
        commentsCount: 0,
      },
    ],
    channel: {
      slug: 'e2e',
      title: 'E2E Channel',
      description: 'E2E mood feed',
      avatar: '',
    },
  };
}

function createRichCommentsPayload(moodId: string) {
  const replyHref = `/mood/${moodId}#comments`;
  const richContent = [
    `<a class="tgme_widget_message_reply" href="${replyHref}">`,
    '<span class="tgme_widget_message_reply_author">Reply Author</span>',
    '<span class="tgme_widget_message_reply_text">Reply Author: First line<br>Second line</span>',
    '</a>',
    `<p><strong>Bold</strong> <a href="${replyHref}">linked context</a> <span class="emoji"><b>🙂</b></span></p>`,
  ].join('');

  return {
    comments: [
      {
        id: '9001',
        author: 'E2E',
        authorAvatar: '',
        datetime: '2026-02-10T13:10:00+00:00',
        content: richContent,
        reactions: [],
      },
    ],
    hasMore: false,
    nextBefore: '',
  };
}

function createComment(comment: {
  id: string;
  author?: string;
  datetime?: string;
  content?: string;
}) {
  return {
    id: comment.id,
    author: comment.author ?? 'E2E',
    authorAvatar: '',
    datetime: comment.datetime ?? '2026-02-10T13:10:00+00:00',
    content: comment.content ?? `<p>Comment ${comment.id}</p>`,
    reactions: [],
  };
}

async function disableNotifyNativeValidation(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('[data-notify-form]').evaluate((form) => {
    form.setAttribute('novalidate', 'true');
  });
}

test.describe('Mood routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('loads mood feed and opens a detail page from the first item', async ({ page, request }) => {
    const latestMoodId = await getLatestMoodId(request);
    test.skip(!latestMoodId, 'No mood id available from /api/moods');

    const moodFeedPayload = createMoodFeedPayload(latestMoodId as string);
    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('probe') === '1') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ latestId: latestMoodId }),
        });
        return;
      }

      if (url.searchParams.has('before')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ posts: [], channel: moodFeedPayload.channel }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(moodFeedPayload),
      });
    });

    await page.goto('/mood');

    await expect(page).toHaveTitle(/Moods/i);
    await expect(page.locator('[data-mood-hero]')).toBeVisible();
    await expect(page.locator('[data-mood-feed]')).not.toHaveClass(/is-hidden/, { timeout: 30_000 });

    const firstItem = page.locator('[data-mood-list] .mood-item').first();
    await expect(firstItem).toBeVisible();

    const rssAction = page.locator('[data-header-actions] a[href="/mood/rss.xml"]');
    await expect(rssAction).toBeVisible();

    await firstItem.hover();
    const expandLink = firstItem.locator('.mood-item-expand-float');
    await expect(expandLink).toBeVisible();

    const href = await expandLink.getAttribute('href');
    expect(href).toMatch(/^\/mood\/\d+$/);

    await expandLink.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test('renders rich comment content in the feed popover', async ({ page }) => {
    const moodId = '12345';
    const moodFeedPayload = createMoodFeedPayload(moodId);
    const richCommentsPayload = createRichCommentsPayload(moodId);

    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('probe') === '1') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ latestId: moodId }),
        });
        return;
      }

      if (url.searchParams.has('before')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ posts: [], channel: moodFeedPayload.channel }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(moodFeedPayload),
      });
    });

    await page.route('**/api/comments?postId=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(richCommentsPayload),
      });
    });

    await page.goto('/mood', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-mood-feed]')).not.toHaveClass(/is-hidden/, { timeout: 30_000 });

    const firstItem = page.locator('[data-mood-list] .mood-item').first();
    await expect(firstItem).toBeVisible();

    const commentsWrapper = firstItem.locator('.mood-comments-wrapper');
    await expect(commentsWrapper).toBeVisible();
    await commentsWrapper.hover();

    await expect
      .poll(async () => commentsWrapper.locator('.mood-popover-comment').count(), { timeout: 30_000 })
      .toBe(1);

    const popoverContent = commentsWrapper.locator('.mood-popover-comment-content').first();
    await expect(popoverContent.locator('.mood-comment-quote')).toBeVisible();
    await expect(popoverContent.locator('.mood-item-quote-author')).toHaveText('Reply Author');
    await expect(popoverContent.locator('.mood-item-quote-text')).toContainText(/First line\s+Second line/);
    await expect(popoverContent.locator('strong')).toHaveText('Bold');
    await expect(popoverContent.locator('p a')).toHaveAttribute('href', `/mood/${moodId}#comments`);
    await expect(popoverContent).toContainText('🙂');
  });

  test('loads comments on detail page and fallback back-button navigation works', async ({ page, request }) => {
    const latestMoodId = await getLatestMoodId(request);
    test.skip(!latestMoodId, 'No mood id available from /api/moods');

    await page.route('**/api/comments?postId=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comments: [
            {
              id: '9001',
              author: 'E2E',
              authorAvatar: '',
              datetime: '2026-02-10T13:10:00+00:00',
              content: '<p>Test comment</p>',
              reactions: [],
            },
          ],
          hasMore: false,
          nextBefore: '',
        }),
      });
    });

    await page.goto('/mood', { waitUntil: 'domcontentloaded' });
    await page.goto(`/mood/${latestMoodId}`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-back-button]')).toBeVisible();
    await expect(page.locator('[data-comments-list]')).toBeVisible();

    await expect
      .poll(async () => {
        return await page.locator('[data-comments-loading]').count();
      }, { timeout: 30_000 })
      .toBe(0);

    await expect
      .poll(async () => {
        const commentsCount = await page.locator('[data-comments-list] .mood-comment').count();
        if (commentsCount > 0) return true;
        return await page.locator('[data-comments-empty]').isVisible();
      })
      .toBe(true);

    await page.locator('[data-back-button]').click();
    await expect(page).toHaveURL(/\/mood$/);
  });

  test('renders image media in detail comments', async ({ page, request }) => {
    const latestMoodId = await getLatestMoodId(request);
    test.skip(!latestMoodId, 'No mood id available from /api/moods');

    const requestedImages: string[] = [];
    const tinyGif = Buffer.from('R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64');
    const commentImage = 'https://image.example.test/comment-photo.gif';

    await page.route('**/api/comments?postId=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comments: [
            {
              id: '9001',
              author: 'E2E',
              authorAvatar: '',
              datetime: '2026-02-10T13:10:00+00:00',
              content: `
                <div class="image-list-container image-list-odd">
                  <button class="image-preview-button image-preview-wrap">
                    <img src="${commentImage}" alt="Comment photo" loading="eager" />
                  </button>
                </div>
              `,
              reactions: [],
            },
          ],
          hasMore: false,
          nextBefore: '',
        }),
      });
    });

    await page.route('https://image.example.test/**', async (route) => {
      requestedImages.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: tinyGif,
      });
    });

    await page.goto(`/mood/${latestMoodId}#comments`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-comments-loading]')).toHaveCount(0, { timeout: 30_000 });
    const image = page.locator('[data-comments-list] .mood-comment-content .image-preview-wrap img');
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('src', commentImage);
    await expect
      .poll(() => requestedImages.filter((url) => url === commentImage).length, { timeout: 30_000 })
      .toBeGreaterThan(0);
  });

  test('renders custom emoji reactions in detail comments', async ({ page, request }) => {
    const latestMoodId = await getLatestMoodId(request);
    test.skip(!latestMoodId, 'No mood id available from /api/moods');

    const emojiImage = '/static/https://t.me/i/emoji/5389048680659563012.webp';

    await page.route('**/api/comments?postId=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comments: [
            {
              id: '9001',
              author: 'E2E',
              authorAvatar: '',
              datetime: '2026-02-10T13:10:00+00:00',
              content: '<p>Reaction test</p>',
              reactions: [
                {
                  emoji: '',
                  emojiId: '5389048680659563012',
                  emojiImage,
                  count: '1',
                  isPaid: false,
                },
              ],
            },
          ],
          hasMore: false,
          nextBefore: '',
        }),
      });
    });

    await page.goto(`/mood/${latestMoodId}`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-comments-loading]')).toHaveCount(0, { timeout: 30_000 });
    const reactionEmoji = page.locator('[data-comments-list] .mood-comment .mood-reaction-emoji .tg-emoji').first();
    await expect(reactionEmoji).toBeVisible();
    await expect(reactionEmoji.locator('img')).toHaveAttribute('src', emojiImage);

    await reactionEmoji.evaluate((node) => {
      if (!(node instanceof HTMLElement)) return;
      node.dataset.emojiAnimated = 'true';
      const existingImage = node.querySelector('img');
      existingImage?.remove();
      const anim = document.createElement('span');
      anim.className = 'tg-emoji-anim';
      anim.innerHTML = `
        <svg
          viewBox="0 0 512 512"
          width="512"
          height="512"
          style="width: 100%; height: 100%; transform: translate3d(0px, 0px, 0px); content-visibility: visible;"
        >
          <rect width="512" height="512" fill="#ff00aa"></rect>
        </svg>
      `;
      node.appendChild(anim);
    });

    const box = await reactionEmoji.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThan(32);
    expect(box!.height).toBeLessThan(32);
  });

  test('submits the notify panel successfully and closes cleanly', async ({ page }) => {
    const requests: Array<Record<string, unknown>> = [];

    await page.route('**/api/notify/subscribe', async (route) => {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'pending' }),
      });
    });

    await page.goto('/mood?subscribe=1', { waitUntil: 'domcontentloaded' });

    const panel = page.locator('.notify-panel');
    await expect(panel).toHaveClass(/is-open/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/mood$/);

    await disableNotifyNativeValidation(page);
    await page.locator('[data-notify-email]').fill('reader@example.com');
    await page.locator('label[for="notify-mode-daily"]').click();
    await page.locator('[data-notify-submit]').click();

    await expect(page.locator('[data-notify-success-view]')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('[data-notify-success-text]')).toHaveText('Check your inbox to confirm.');
    await expect.poll(() => requests.length).toBe(1);
    await expect(requests[0]?.email).toBe('reader@example.com');
    await expect(requests[0]?.deliveryMode).toBe('daily');

    await page.locator('[data-notify-done]').click();
    await expect(panel).not.toHaveClass(/is-open/);
  });

  test('shows the already subscribed notify state', async ({ page }) => {
    await page.route('**/api/notify/subscribe', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'already_subscribed' }),
      });
    });

    await page.goto('/mood?subscribe=1', { waitUntil: 'domcontentloaded' });

    await disableNotifyNativeValidation(page);
    await page.locator('[data-notify-email]').fill('reader@example.com');
    await page.locator('[data-notify-submit]').click();

    await expect(page.locator('[data-notify-success-view]')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('[data-notify-success-text]')).toHaveText('This email is already subscribed.');
  });

  test('handles notify validation, rate limits, and retryable server errors', async ({ page }) => {
    let requestCount = 0;
    await page.route('**/api/notify/subscribe', async (route) => {
      requestCount += 1;

      if (requestCount === 1) {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Too Many Requests' }),
        });
        return;
      }

      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Backend failed' }),
      });
    });

    await page.goto('/mood?subscribe=1', { waitUntil: 'domcontentloaded' });

    await disableNotifyNativeValidation(page);
    await page.locator('[data-notify-email]').fill('not-an-email');
    await page.locator('[data-notify-submit]').click();
    await expect(page.locator('[data-notify-error-msg]')).toHaveText('Please enter a valid email address.');

    await page.locator('[data-notify-email]').fill('reader@example.com');
    await page.locator('[data-notify-submit]').click();
    await expect(page.locator('[data-notify-error-msg]')).toHaveText('Too many requests. Please try again later.');
    await expect(page.locator('[data-notify-form-view]')).not.toHaveClass(/is-hidden/);

    await page.locator('[data-notify-submit]').click();
    await expect(page.locator('[data-notify-error-view]')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('[data-notify-error-state-text]')).toHaveText('Backend failed');

    await page.locator('[data-notify-retry]').click();
    await expect(page.locator('[data-notify-form-view]')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('[data-notify-error-msg]')).toHaveText('');
  });

  test('shows an empty state when the feed has no moods', async ({ page }) => {
    await page.route('**/api/moods**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          posts: [],
          channel: {
            slug: 'e2e',
            title: 'E2E Channel',
            description: 'E2E mood feed',
            avatar: '',
          },
        }),
      });
    });

    await page.goto('/mood', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-mood-feed]')).not.toHaveClass(/is-hidden/, { timeout: 30_000 });
    await expect(page.locator('[data-load-status]')).toHaveText('No moods yet.');
    await expect(page.locator('[data-mood-list] .mood-item')).toHaveCount(0);
    await expect(page.locator('[data-mood-error]')).toHaveClass(/is-hidden/);
  });

  test('shows an empty state when a detail page has no comments', async ({ page, request }) => {
    const latestMoodId = await getLatestMoodId(request);
    test.skip(!latestMoodId, 'No mood id available from /api/moods');

    await page.route('**/api/comments?postId=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comments: [],
          hasMore: false,
          nextBefore: '',
        }),
      });
    });

    await page.goto(`/mood/${latestMoodId}`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-comments-loading]')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('[data-comments-empty]')).toBeVisible();
    await expect(page.locator('[data-comments-empty]')).toContainText('No comments here yet...');
    await expect(page.locator('[data-comments-list] .mood-comment')).toHaveCount(0);
  });

  test('shows an error state when detail comments fail to load', async ({ page, request }) => {
    const latestMoodId = await getLatestMoodId(request);
    test.skip(!latestMoodId, 'No mood id available from /api/moods');

    await page.route('**/api/comments?postId=*', async (route) => {
      await route.abort('failed');
    });

    await page.goto(`/mood/${latestMoodId}`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-comments-loading]')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('[data-comments-empty]')).toBeVisible();
    await expect(page.locator('[data-comments-empty]')).toContainText('Failed to load comments');
    await expect(page.locator('[data-comments-list] .mood-comment')).toHaveCount(0);
  });

  test('loads more comments without duplicating existing entries', async ({ page, request }) => {
    const latestMoodId = await getLatestMoodId(request);
    test.skip(!latestMoodId, 'No mood id available from /api/moods');

    let requestCount = 0;
    await page.route('**/api/comments?postId=*', async (route) => {
      requestCount += 1;

      if (requestCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            comments: [createComment({ id: '9001' })],
            hasMore: true,
            nextBefore: '9001',
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comments: [
            createComment({ id: '9001' }),
            createComment({
              id: '9000',
              datetime: '2026-02-10T13:05:00+00:00',
              content: '<p>Older comment</p>',
            }),
          ],
          hasMore: false,
          nextBefore: '',
        }),
      });
    });

    await page.goto(`/mood/${latestMoodId}`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-comments-list] .mood-comment')).toHaveCount(1, { timeout: 30_000 });

    const loadMoreButton = page.getByRole('button', { name: 'Load more comments' });
    await expect(loadMoreButton).toBeVisible();
    await loadMoreButton.click();

    await expect(page.locator('[data-comments-list] .mood-comment')).toHaveCount(2);
    await expect(page.locator('[data-comments-list] .mood-comment[data-comment-id="9001"]')).toHaveCount(1);
    await expect(page.locator('[data-comments-list] .mood-comment[data-comment-id="9000"]')).toHaveCount(1);
    await expect(loadMoreButton).toBeHidden();
  });

  test('renders a feed gallery and lazy-loads later slides on horizontal scroll', async ({ page }) => {
    const moodId = '555';
    const payload = createGalleryFeedPayload(moodId);
    const requestedImages: string[] = [];
    const tinyGif = Buffer.from('R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64');

    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('probe') === '1') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ latestId: moodId }),
        });
        return;
      }

      if (url.searchParams.has('before')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ posts: [], channel: payload.channel }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    });

    await page.route('https://image.example.test/**', async (route) => {
      requestedImages.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: tinyGif,
      });
    });

    await page.goto('/mood', { waitUntil: 'domcontentloaded' });

    const gallery = page.locator('[data-mood-list] .mood-gallery--feed').first();
    const track = gallery.locator('[data-mood-gallery-track]');
    const images = gallery.locator('[data-mood-gallery-image]');

    await expect(gallery).toBeVisible();
    await expect(images).toHaveCount(3);

    await expect(images.nth(0)).toHaveAttribute('src', /\/0$/);
    await expect(images.nth(1)).toHaveAttribute('src', /\/1$/);
    expect(requestedImages.some((url) => url.includes('/2'))).toBe(false);
    expect(await images.nth(2).getAttribute('src')).toBeNull();

    await track.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      element.dispatchEvent(new Event('scroll'));
    });

    await expect
      .poll(() => requestedImages.filter((url) => url.includes('/2')).length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    await expect(images.nth(2)).toHaveAttribute('src', /\/2$/);
  });

  test('renders the detail gallery with a justified Flickr-style layout', async ({ page }) => {
    const tinyGif = Buffer.from('R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64');

    await page.route('https://image.example.test/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: tinyGif,
      });
    });

    await page.goto('/mood/990777', { waitUntil: 'domcontentloaded' });

    const content = page.locator('.mood-post-content');
    const gallery = content.locator('.mood-gallery--detail').first();
    const track = gallery.locator('[data-mood-gallery-track]');
    const images = gallery.locator('[data-mood-gallery-image]');

    await expect(gallery).toBeVisible();
    await expect(content).toContainText('E2E multi-image detail post');
    await expect(content).toContainText('Detail text continues after the gallery.');
    await expect(images).toHaveCount(3);
    await expect(images.nth(0)).toHaveAttribute('src', /\/0$/);
    await expect(images.nth(1)).toHaveAttribute('src', /\/1$/);
    await expect(images.nth(2)).toHaveAttribute('src', /\/2$/);
    expect(await track.evaluate((element) => getComputedStyle(element).overflowX)).toBe('visible');
    expect(await track.getAttribute('data-mood-gallery-layout')).toBe('justified');
  });

  test('keeps detail reactions visually stable on hover', async ({ page }) => {
    await page.goto('/mood/990777', { waitUntil: 'domcontentloaded' });

    const reaction = page.locator('.mood-post-reactions .mood-reaction').first();
    await expect(reaction).toBeVisible();

    const readReactionStyle = async () => {
      return reaction.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          border: style.borderColor,
          transform: style.transform,
        };
      });
    };

    const before = await readReactionStyle();
    await reaction.hover();
    await page.waitForTimeout(200);
    const after = await readReactionStyle();

    expect(after.background).toBe(before.background);
    expect(after.border).toBe(before.border);
    expect(after.transform).toBe(before.transform);
  });

  test('redirects /mood/:id?embed=1 to the embed endpoint with expected params', async ({ page }) => {
    const moodId = '12345';

    await page.goto(`/mood/${moodId}?embed=1&theme=dark`);

    const redirected = new URL(page.url());
    expect(redirected.pathname).toBe('/mood/embed');
    expect(redirected.searchParams.get('id')).toBe(moodId);
    expect(redirected.searchParams.get('theme')).toBe('dark');
    expect(redirected.searchParams.get('link')).toBe('false');
  });

  test('applies embed query options to root attributes', async ({ page }) => {
    await page.goto('/mood/embed?count=2&theme=dark&density=compact&font=system&frame=false&link=false');

    await expect(page.locator('html')).toHaveAttribute('data-embed-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-embed-density', 'compact');
    await expect(page.locator('html')).toHaveAttribute('data-embed-font', 'system');
    await expect(page.locator('html')).toHaveAttribute('data-embed-frame', 'false');

    await expect
      .poll(async () => {
        const cards = await page.locator('.embed-card').count();
        if (cards > 0) return true;
        return await page.locator('.empty-state').isVisible();
      })
      .toBe(true);
  });

  test('falls back to /static image when HD image request fails', async ({ page }) => {
    const moodId = '990001';
    const fallbackImage = '/static/https://cdn4.telesco.pe/file/fallback.jpg';
    const payload = {
      posts: [
        {
          id: moodId,
          datetime: '2026-02-10T13:00:00+00:00',
          tag: 'e2e',
          previewText: 'Image fallback case',
          previewHtml: 'Image fallback case',
          image: 'https://image.example.test/mood/990001/0',
          imageFallback: fallbackImage,
          mediaHtml: '',
          needsDetailPage: true,
          forwardedFrom: null,
          quote: null,
          reactions: [],
          commentsCount: 0,
        },
      ],
      channel: {
        slug: 'e2e',
        title: 'E2E Channel',
      },
    };

    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('probe') === '1') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ latestId: moodId }),
        });
        return;
      }

      if (url.searchParams.has('before')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ posts: [], channel: payload.channel }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    });

    await page.route('https://image.example.test/**', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'text/plain',
        body: 'not found',
      });
    });

    await page.route('**/static/https://cdn4.telesco.pe/file/fallback.jpg**', async (route) => {
      const gif = Buffer.from('R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64');
      await route.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: gif,
      });
    });

    await page.goto('/mood');

    const image = page.locator('.mood-item-thumb img').first();
    await expect(image).toBeVisible();
    await expect
      .poll(async () => await image.getAttribute('src'))
      .toContain(fallbackImage);
  });
});
