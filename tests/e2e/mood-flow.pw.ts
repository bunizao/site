import { expect, test } from './fixtures';
import { getLatestMoodId } from './helpers';
import type { Page } from '@playwright/test';

async function readPageScrollTop(page: Page): Promise<number> {
  return page.locator('[data-page-scroller]').evaluate((scroller) => scroller.scrollTop);
}

async function scrollPageTo(page: Page, top: number): Promise<void> {
  await page.locator('[data-page-scroller]').evaluate((scroller, nextTop) => {
    scroller.scrollTo({ top: nextTop, behavior: 'instant' });
  }, top);
}

function createMoodFeedPost(
  id: string,
  text = `E2E mood feed item ${id}`,
  overrides: Partial<{
    datetime: string;
    image: string | null;
    imageFallback: string | null;
    imageHeight: number | null;
    imageKind: 'sticker' | null;
    imageLayout: string | null;
    imageWidth: number | null;
    gallery: {
      count: number;
      items: Array<Record<string, unknown>>;
    } | null;
    groupIds: string[];
    media: Array<Record<string, unknown>>;
    previewMediaType: string;
    quote: {
      text: string;
      author?: string;
      href?: string;
      thumbnailSrc?: string;
    } | null;
  }> = {}
) {
  return {
    id,
    datetime: '2026-02-10T13:00:00+00:00',
    tag: 'e2e',
    previewText: text,
    previewHtml: text,
    image: null,
    media: [],
    mediaHtml: '',
    needsDetailPage: true,
    forwardedFrom: null,
    quote: null,
    reactions: [],
    commentsCount: 0,
    ...overrides,
  };
}

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

async function followMoodBackButton(page: Page): Promise<void> {
  await page.evaluate(() => {
    const backButton = document.querySelector<HTMLAnchorElement>('[data-back-button]');
    if (!backButton) {
      throw new Error('Missing mood back button');
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = backButton.href;
  });
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
  await page.locator('[data-sub-form]').evaluate((form) => {
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

    const subscribeAction = page.locator('[data-mood-navbar] [data-subscribe-toggle="mood"]');
    await expect(subscribeAction).toBeVisible();

    await firstItem.hover();
    const expandLink = firstItem.locator('.mood-item-expand-float');
    await expect(expandLink).toBeVisible();

    const href = await expandLink.getAttribute('href');
    expect(href).toMatch(/^\/mood\/\d+$/);

    await expandLink.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test('derives tall image limits from feed dimensions', async ({ page }) => {
    const moodId = '9903623';
    const imageUrl = 'https://image.example.test/mood/9903623/0';
    const payload = {
      posts: [
        createMoodFeedPost(moodId, 'Tall image without layout metadata', {
          image: imageUrl,
          imageHeight: 2560,
          imageLayout: null,
          imageWidth: 1178,
        }),
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

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    });

    await page.route(imageUrl, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1178" height="2560"></svg>',
      });
    });

    await page.goto('/mood');

    const thumbnail = page.locator(`[data-mood-id="${moodId}"] .mood-item-thumb`);
    await expect(thumbnail).toHaveClass(/mood-item-thumb--ultra-tall/);
    await expect
      .poll(async () => thumbnail.evaluate((element) => element.getBoundingClientRect().height))
      .toBeLessThanOrEqual(400);
  });

  test('contains an unknown-dimension portrait inside a stable feed frame', async ({ page }) => {
    const moodId = '9903769';
    const imageUrl = 'https://image.example.test/mood/9903769/0';
    const payload = {
      posts: [createMoodFeedPost(moodId, 'Portrait with incomplete metadata', {
        image: imageUrl,
        imageHeight: null,
        imageLayout: null,
        imageWidth: 225,
      })],
      channel: { slug: 'e2e', title: 'E2E Channel' },
    };
    let releaseImage!: () => void;
    const imageGate = new Promise<void>((resolve) => {
      releaseImage = resolve;
    });

    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(url.searchParams.get('probe') === '1' ? { latestId: moodId } : payload),
      });
    });
    await page.route(imageUrl, async (route) => {
      await imageGate;
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="589" height="1280"></svg>',
      });
    });

    await page.goto('/mood', { waitUntil: 'domcontentloaded' });
    const frame = page.locator(`[data-mood-id="${moodId}"] .mood-item-thumb`);
    const image = frame.locator('[data-mood-image-main]');
    const before = await frame.boundingBox();
    expect(before).not.toBeNull();
    expect(before!.height).toBeGreaterThan(100);

    releaseImage();
    await expect.poll(() => image.evaluate((node) => {
      const element = node as HTMLImageElement;
      return element.complete && element.naturalHeight > element.naturalWidth;
    })).toBe(true);
    const after = await frame.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.height - before!.height)).toBeLessThan(1);
    expect(await image.evaluate((node) => getComputedStyle(node).objectFit)).toBe('contain');
  });

  test('keeps sticker thumbnails left-aligned at the tuned size', async ({ page }) => {
    const moodId = '9903669';
    const imageUrl = 'https://image.example.test/mood/9903669/sticker.webp';
    const payload = {
      posts: [
        createMoodFeedPost(moodId, '', {
          image: imageUrl,
          imageHeight: 512,
          imageKind: 'sticker',
          imageLayout: null,
          imageWidth: 512,
          previewMediaType: 'sticker',
        }),
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

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    });

    await page.route('https://image.example.test/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"></svg>',
      });
    });

    await page.goto('/mood');

    const item = page.locator(`[data-mood-id="${moodId}"]`);
    const thumbnail = item.locator('.mood-item-thumb--sticker');
    const image = thumbnail.locator('img');
    await expect(thumbnail).toBeVisible();

    const geometry = await item.evaluate((element) => {
      const contentElement = element.querySelector('.mood-item-content');
      const thumbnailElement = element.querySelector('.mood-item-thumb--sticker');
      const imageElement = thumbnailElement?.querySelector('img');
      if (!contentElement || !thumbnailElement || !imageElement) {
        throw new Error('Missing sticker thumbnail elements');
      }

      const contentRect = contentElement.getBoundingClientRect();
      const thumbnailRect = thumbnailElement.getBoundingClientRect();
      const imageRect = imageElement.getBoundingClientRect();
      return {
        imageWidth: imageRect.width,
        leftOffset: thumbnailRect.left - contentRect.left,
        thumbnailWidth: thumbnailRect.width,
      };
    });

    expect(geometry.leftOffset).toBe(0);
    expect(geometry.thumbnailWidth).toBe(256);
    expect(geometry.imageWidth).toBe(256);
    await expect(image).toBeVisible();
  });

  test('keeps a failed media-only quote slot stable', async ({ page }) => {
    const moodId = '9903770';
    const imageUrl = 'https://image.example.test/mood/broken-quote.jpg';
    const payload = {
      posts: [
        createMoodFeedPost(moodId, '', {
          quote: {
            text: 'Media',
            href: '/mood/9903769',
            thumbnailSrc: imageUrl,
          },
        }),
      ],
      channel: { slug: 'e2e', title: 'E2E Channel' },
    };
    let releaseImage!: () => void;
    const imageGate = new Promise<void>((resolve) => {
      releaseImage = resolve;
    });

    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(url.searchParams.get('probe') === '1' ? { latestId: moodId } : payload),
      });
    });
    await page.route(imageUrl, async (route) => {
      await imageGate;
      await route.fulfill({ status: 404, body: 'not found' });
    });

    await page.goto('/mood', { waitUntil: 'domcontentloaded' });
    const quote = page.locator(`[data-mood-id="${moodId}"] .mood-item-quote--media-only`);
    await expect(quote).toBeVisible();
    await expect(quote).toHaveAccessibleName('View quoted media');
    const before = await quote.boundingBox();
    expect(before).not.toBeNull();

    releaseImage();
    await expect(quote.locator('.mood-item-quote-media')).toHaveClass(/is-media-error/);
    await expect(quote.locator('img')).toHaveCount(0);
    const after = await quote.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.width - before!.width)).toBeLessThan(1);
    expect(Math.abs(after!.height - before!.height)).toBeLessThan(1);
  });

  test('loads the mood flow from the archive fixture', async ({ page }) => {
    await page.goto('/mood?source=archive');

    await expect(page.locator('[data-mood-feed]')).toHaveAttribute('data-mood-read-source', 'archive');
    await expect(page.locator('[data-mood-feed]')).not.toHaveClass(/is-hidden/, { timeout: 30_000 });
    await expect(page.locator('[data-mood-list] .mood-item').first()).toBeVisible();
  });

  test('shows live comments on an archived post without reactions', async ({ page }) => {
    const moodId = '991234';
    const payload = createMoodFeedPayload(moodId);
    payload.posts[0].commentsCount = 0;

    await page.route('**/api/v2/mood**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('probe') === '1') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ latestId: moodId }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    });
    await page.route('**/api/v2/moods/live-counts?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          counts: {
            [moodId]: {
              commentsCount: 4,
              reactions: [],
            },
          },
        }),
      });
    });

    await page.goto('/mood?source=archive', { waitUntil: 'domcontentloaded' });

    const item = page.locator(`[data-mood-id="${moodId}"]`);
    const comments = item.locator('.mood-comments-wrapper');
    await expect(comments.locator('.mood-comments-count')).toHaveText('4');
    await expect(comments).toBeVisible();
  });

  test('returns from detail to the originating feed anchor', async ({ page }) => {
    const channel = {
      slug: 'e2e',
      title: 'E2E Channel',
      description: 'E2E mood feed',
      avatar: '',
    };
    const posts = Array.from({ length: 32 }, (_, index) => {
      const id = String(990050 - index);
      return createMoodFeedPost(
        id,
        `E2E return anchor item ${id} ${'body '.repeat(18)}`
      );
    });
    const targetId = '990030';

    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('probe') === '1') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ latestId: posts[0].id }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts, channel }),
      });
    });

    await page.goto('/mood', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-mood-feed]')).not.toHaveClass(/is-hidden/, { timeout: 30_000 });

    const targetItem = page.locator(`[data-mood-id="${targetId}"]`);
    await expect(targetItem).toBeVisible();
    await targetItem.scrollIntoViewIfNeeded();
    await expect
      .poll(() => readPageScrollTop(page))
      .toBeGreaterThan(0);

    await targetItem.hover();
    const expandLink = targetItem.locator('.mood-item-expand-float');
    await expect(expandLink).toBeVisible();
    await expandLink.click();
    await expect(page).toHaveURL(new RegExp(`/mood/${targetId}$`));

    await followMoodBackButton(page);
    await expect(page).toHaveURL(new RegExp(`/mood\\?${targetId}$`));
    await expect(page.locator(`[data-mood-id="${targetId}"]`)).toBeVisible();
    await expect
      .poll(async () => {
        return page.locator(`[data-mood-id="${targetId}"]`).evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < window.innerHeight;
        });
      })
      .toBe(true);
  });

  test('continues older pagination during a slow detail return', async ({ page }) => {
    const anchorId = '1000';
    const slowImage = 'https://image.example.test/mood/return-anchor/0';
    const channel = {
      slug: 'e2e',
      title: 'E2E Channel',
      description: 'E2E mood feed',
      avatar: '',
    };
    const focusedPosts = Array.from({ length: 18 }, (_, index) => {
      const id = String(1017 - index);
      return createMoodFeedPost(id, `E2E return pagination item ${id} ${'body '.repeat(20)}`);
    });
    let returning = false;
    const beforeRequests: string[] = [];

    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      const before = url.searchParams.get('before');
      if (before) beforeRequests.push(before);

      if (before === '1011') {
        const posts = focusedPosts.map((post) => {
          if (!returning || post.id !== '1001') return post;
          return {
            ...post,
            image: slowImage,
            imageHeight: null,
            imageLayout: null,
            imageWidth: null,
          };
        });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ posts, channel }),
        });
        return;
      }

      if (before === anchorId) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            posts: [
              createMoodFeedPost('999', 'E2E first post after return'),
              createMoodFeedPost('998', 'E2E second post after return'),
            ],
            channel,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts: focusedPosts, channel }),
      });
    });
    await page.route(slowImage, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1600"></svg>',
      });
    });

    await page.goto(`/mood?${anchorId}`, { waitUntil: 'domcontentloaded' });
    const anchor = page.locator(`[data-mood-id="${anchorId}"]`);
    await expect(anchor).toBeVisible();
    await page.waitForTimeout(1_500);
    await anchor.hover();
    await anchor.locator('.mood-item-expand-float').click();
    await expect(page).toHaveURL(new RegExp(`/mood/${anchorId}$`));

    returning = true;
    const backButton = page.locator('[data-back-button]');
    await expect(backButton).toHaveAttribute('href', new RegExp(`/mood\\?${anchorId}$`));
    await page.goto(`/mood?${anchorId}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/mood\\?${anchorId}$`));
    await expect(anchor).toBeVisible();

    await page.locator('[data-page-scroller]').evaluate((scroller) => {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' });
    });
    await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      deltaY: 600,
    })));

    await expect(page.locator('[data-mood-id="999"]')).toBeVisible({ timeout: 10_000 });
    expect(beforeRequests).toContain(anchorId);
  });

  test('keeps anchored feed position when returning from detail to the same URL', async ({ page }) => {
    const channel = {
      slug: 'e2e',
      title: 'E2E Channel',
      description: 'E2E mood feed',
      avatar: '',
    };
    const posts = Array.from({ length: 32 }, (_, index) => {
      const id = String(990050 - index);
      return createMoodFeedPost(
        id,
        `E2E same-url return item ${id} ${'body '.repeat(18)}`
      );
    });
    const targetId = '990030';

    await page.addInitScript((id) => {
      window.addEventListener('pageshow', () => {
        if (window.sessionStorage.getItem('mood-test-shift-on-return') !== '1') return;
        if (window.location.pathname !== '/mood' || !window.location.search.includes(id)) return;
        window.sessionStorage.removeItem('mood-test-shift-on-return');

        window.setTimeout(() => {
          if (document.querySelector('[data-test-anchor-shift]')) return;
          const target = document.querySelector(`[data-mood-id="${id}"]`);
          if (!target?.parentElement) return;

          const spacer = document.createElement('div');
          spacer.dataset.testAnchorShift = 'true';
          spacer.style.height = '320px';
          spacer.style.flex = '0 0 auto';
          target.parentElement.insertBefore(spacer, target);
        }, 700);
      });
    }, targetId);

    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('probe') === '1') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ latestId: posts[0].id }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts, channel }),
      });
    });

    await page.goto(`/mood?${targetId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-mood-feed]')).not.toHaveClass(/is-hidden/, { timeout: 30_000 });

    const targetItem = page.locator(`[data-mood-id="${targetId}"]`);
    await expect(targetItem).toBeVisible();
    await expect
      .poll(async () => {
        return targetItem.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < window.innerHeight;
        });
      })
      .toBe(true);
    const beforeTop = await targetItem.evaluate((element) => element.getBoundingClientRect().top);

    await targetItem.hover();
    const expandLink = targetItem.locator('.mood-item-expand-float');
    await expect(expandLink).toBeVisible();
    await expandLink.click();
    await expect(page).toHaveURL(new RegExp(`/mood/${targetId}$`));

    await page.evaluate(() => {
      window.sessionStorage.setItem('mood-test-shift-on-return', '1');
    });
    await followMoodBackButton(page);
    await expect(page).toHaveURL(new RegExp(`/mood\\?${targetId}$`));
    await expect(page.locator('[data-test-anchor-shift]')).toBeAttached({ timeout: 3_000 });
    await expect
      .poll(async () => {
        return targetItem.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < window.innerHeight;
        });
      })
      .toBe(true);
    const afterTop = await targetItem.evaluate((element) => element.getBoundingClientRect().top);
    expect(Math.abs(afterTop - beforeTop)).toBeLessThanOrEqual(24);
  });

  test('uses short query ids as bounded feed anchors without repeated scroll correction', async ({ page }) => {
    await page.addInitScript(() => {
      const original = Element.prototype.scrollIntoView;
      (window as any).__moodScrollIntoViewCalls = [];
      Element.prototype.scrollIntoView = function patchedScrollIntoView(
        arg?: boolean | ScrollIntoViewOptions
      ) {
        if (this instanceof HTMLElement && this.dataset.moodId) {
          (window as any).__moodScrollIntoViewCalls.push({
            id: this.dataset.moodId,
            time: performance.now(),
          });
        }
        return original.call(this, arg as any);
      };
    });

    const shiftingImage = 'https://image.example.test/mood/1001/0';
    const channel = {
      slug: 'e2e',
      title: 'E2E Channel',
      description: 'E2E mood feed',
      avatar: '',
    };
    const afterRequests: string[] = [];
    const beforeRequests: string[] = [];

    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      const after = url.searchParams.get('after');
      const before = url.searchParams.get('before');

      if (after) {
        afterRequests.push(after);
      }
      if (before) {
        beforeRequests.push(before);
      }

      if (before === '1011') {
        const imagePost = createMoodFeedPost('1001', 'E2E mood feed item 1001', {
          image: shiftingImage,
          imageHeight: null,
          imageLayout: null,
          imageWidth: null,
        });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            posts: [createMoodFeedPost('1002'), imagePost, createMoodFeedPost('1000'), createMoodFeedPost('999')],
            channel,
          }),
        });
        return;
      }

      if (after === '1002') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            posts: [createMoodFeedPost('1004'), createMoodFeedPost('1003'), createMoodFeedPost('1002')],
            channel,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts: [], channel }),
      });
    });

    await page.route('https://image.example.test/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1600"></svg>',
      });
    });

    await page.goto('/mood?1000', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-mood-id="1001"]')).toBeVisible();
    await expect(page.locator('[data-mood-id="1000"]')).toBeVisible();
    await expect(page).toHaveURL(/\/mood\?1000$/);

    const initialOrder = await page.locator('[data-mood-list] .mood-item').evaluateAll((items) => (
      items.map((item) => (item as HTMLElement).dataset.moodId)
    ));
    expect(initialOrder.indexOf('1001')).toBeLessThan(initialOrder.indexOf('1000'));

    await expect
      .poll(async () => {
        return page.locator('[data-mood-id="1000"]').evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= window.innerHeight;
        });
      }, { timeout: 30_000 })
      .toBe(true);

    await page.waitForTimeout(1200);
    const anchorScrollCalls = await page.evaluate(() => (
      (window as any).__moodScrollIntoViewCalls as Array<{ id: string }>
    ).filter((call) => call.id === '1000').length);
    expect(anchorScrollCalls).toBe(1);
    expect(afterRequests).not.toContain('1002');
    await expect
      .poll(async () => {
        return page.locator('[data-mood-id="1000"]').evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < window.innerHeight;
        });
      }, { timeout: 10_000 })
      .toBe(true);

    await scrollPageTo(page, 0);
    await expect(page.locator('[data-mood-id="1003"]')).toBeVisible();

    const updatedOrder = await page.locator('[data-mood-list] .mood-item').evaluateAll((items) => (
      items.map((item) => (item as HTMLElement).dataset.moodId)
    ));
    expect(updatedOrder.indexOf('1003')).toBeLessThan(updatedOrder.indexOf('1002'));
    expect(afterRequests).toContain('1002');
    expect(beforeRequests).not.toContain('1021');

    const dateGroupsHaveItems = await page.locator('.mood-date-group').evaluateAll((groups) => (
      groups.every((group) => group.querySelectorAll('.mood-item').length > 0)
    ));
    expect(dateGroupsHaveItems).toBe(true);
  });

  test('hydrates anchored live metadata before the first visible positioning', async ({ page }) => {
    const anchorId = '1000';
    const reactionId = '1001';
    const channel = { slug: 'e2e', title: 'E2E Channel' };
    const posts = Array.from({ length: 25 }, (_value, index) => {
      const id = String(1024 - index);
      return createMoodFeedPost(id, `E2E anchor metadata item ${id} ${'body '.repeat(50)}`);
    });

    await page.addInitScript(({ targetId, hydratedId }) => {
      const originalScrollIntoView = Element.prototype.scrollIntoView;
      const originalScrollBy = HTMLElement.prototype.scrollBy;
      (window as any).__anchorPositioning = [];
      (window as any).__anchorScrollByCalls = 0;
      Element.prototype.scrollIntoView = function patchedScrollIntoView(
        arg?: boolean | ScrollIntoViewOptions
      ) {
        if (this instanceof HTMLElement && this.dataset.moodId === targetId) {
          (window as any).__anchorPositioning.push({
            liveMetaReady: Boolean(document.querySelector(
              `[data-mood-id="${hydratedId}"] [data-mood-reaction-key]`
            )),
          });
        }
        return originalScrollIntoView.call(this, arg as any);
      };
      HTMLElement.prototype.scrollBy = function patchedScrollBy(
        this: HTMLElement,
        first?: number | ScrollToOptions,
        second?: number,
      ) {
        if (this.matches('[data-page-scroller]')) {
          (window as any).__anchorScrollByCalls += 1;
        }
        if (typeof first === 'number') return originalScrollBy.call(this, first, second ?? 0);
        return (originalScrollBy as (this: HTMLElement, options?: ScrollToOptions) => void).call(this, first);
      } as typeof HTMLElement.prototype.scrollBy;
    }, { targetId: anchorId, hydratedId: reactionId });

    await page.route('**/api/v2/moods/live-counts**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          counts: Object.fromEntries(posts.map((post) => [
            post.id,
            {
              commentsCount: 0,
              reactions: post.id === reactionId
                ? [{ emoji: '💩', count: '3', isPaid: false }]
                : [],
            },
          ])),
        }),
      });
    });

    await page.route(/\/api\/v2\/mood(?:\?|$)/, async (route) => {
      const before = new URL(route.request().url()).searchParams.get('before');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts: before === '1011' ? posts : [], channel }),
      });
    });

    await page.goto(`/mood?${anchorId}&source=archive`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(`[data-mood-id="${anchorId}"]`)).toBeVisible();
    await expect(page.locator(`[data-mood-id="${reactionId}"] [data-mood-reaction-key]`)).toHaveCount(1);
    await expect.poll(() => page.locator(`[data-mood-id="${anchorId}"]`).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    })).toBe(true);

    const result = await page.evaluate(() => ({
      positioning: (window as any).__anchorPositioning,
      scrollByCalls: (window as any).__anchorScrollByCalls,
    }));
    expect(result.positioning).toEqual([{ liveMetaReady: true }]);
    expect(result.scrollByCalls).toBe(0);
  });

  test('renders a grouped album once and preserves a member alias through detail navigation', async ({ page }) => {
    const canonicalId = '3470';
    const anchorId = '3472';
    const groupIds = ['3470', '3471', '3472', '3473'];
    const items = groupIds.map((_, index) => ({
      src: `https://image.example.test/mood/${canonicalId}/${index}`,
      fallbackSrc: null,
      width: 1200,
      height: 900,
      layout: 'landscape',
      alt: '',
    }));
    const post = createMoodFeedPost(canonicalId, "what i've done in 24 hrs", {
      groupIds,
      gallery: { count: items.length, items },
      image: items[0]?.src ?? null,
      imageHeight: 900,
      imageLayout: 'landscape',
      imageWidth: 1200,
    });
    const channel = {
      slug: 'e2e',
      title: 'E2E Channel',
      description: 'E2E mood feed',
      avatar: '',
    };
    const tinyGif = Buffer.from('R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64');
    const beforeRequests: string[] = [];
    const afterRequests: string[] = [];

    await page.route(/\/api\/(?:v2\/mood|moods)(?:\?|$)/, async (route) => {
      const url = new URL(route.request().url());
      const before = url.searchParams.get('before');
      const after = url.searchParams.get('after');
      if (before) beforeRequests.push(before);
      if (after) afterRequests.push(after);

      const posts = after === '3473'
        ? [createMoodFeedPost('3474', 'Newer than the album')]
        : before === '3470'
          ? [createMoodFeedPost('3469', 'Older than the album')]
          : before === '3491'
            ? [post]
            : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts, channel }),
      });
    });
    await page.route('https://image.example.test/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: tinyGif,
      });
    });

    await page.goto(`/mood?${anchorId}&source=archive`, { waitUntil: 'domcontentloaded' });

    const album = page.locator(`[data-mood-id="${canonicalId}"]`);
    const images = album.locator('[data-mood-gallery-image]');
    await expect(album).toBeVisible();
    await expect(album).toHaveAttribute('data-mood-group-ids', groupIds.join(','));
    await expect(page.locator('[data-mood-list] .mood-item')).toHaveCount(1);
    await expect(images).toHaveCount(4);
    await expect(images.nth(0)).toHaveAttribute('src', /\/3470\/0$/);
    await expect(images.nth(3)).toHaveAttribute('data-deferred-src', /\/3470\/3$/);

    const detailLink = album.locator('.mood-item-expand-float');
    await expect(detailLink).toHaveAttribute('href', '/mood/3472');
    await detailLink.click();
    await expect(page).toHaveURL(/\/mood\/3472$/);
    await expect(page.locator('[data-back-button]')).toHaveAttribute('href', '/mood?3472');

    await followMoodBackButton(page);
    await expect(page).toHaveURL(/\/mood\?3472$/);
    await expect(album).toBeVisible();

    await page.evaluate(() => {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: -600 }));
      document.querySelector<HTMLElement>('[data-page-scroller]')
        ?.scrollTo({ top: 0, behavior: 'instant' });
    });
    await expect(page.locator('[data-mood-id="3474"]')).toBeVisible();
    expect(afterRequests).toContain('3473');

    await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[data-page-scroller]');
      scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' });
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 600 }));
    });
    await expect(page.locator('[data-mood-id="3469"]')).toBeVisible();
    expect(beforeRequests).toContain('3470');
  });

  test('loads older moods when an anchored feed starts at the bottom boundary', async ({ page }) => {
    const anchorId = '1000';
    const channel = {
      slug: 'e2e',
      title: 'E2E Channel',
      description: 'E2E mood feed',
      avatar: '',
    };
    const focusedPosts = Array.from({ length: 18 }, (_, index) => {
      const id = String(1017 - index);
      return createMoodFeedPost(id, `E2E anchored boundary item ${id} ${'body '.repeat(20)}`);
    });
    const beforeRequests: string[] = [];

    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      const before = url.searchParams.get('before');
      if (before) beforeRequests.push(before);

      if (before === '1011') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ posts: focusedPosts, channel }),
        });
        return;
      }

      if (before === anchorId) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            posts: [
              createMoodFeedPost('999', 'E2E first older boundary item', {
                datetime: '2026-02-09T13:00:00+00:00',
              }),
              createMoodFeedPost('998', 'E2E second older boundary item', {
                datetime: '2026-02-08T13:00:00+00:00',
              }),
            ],
            channel,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts: [], channel }),
      });
    });

    await page.goto(`/mood?${anchorId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(`[data-mood-id="${anchorId}"]`)).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => (
        (() => {
          const scroller = document.querySelector<HTMLElement>('[data-page-scroller]')!;
          return Math.abs(scroller.scrollTop - (scroller.scrollHeight - scroller.clientHeight));
        })()
      )), { timeout: 30_000 })
      .toBeLessThanOrEqual(2);

    await page.mouse.move(20, 20);
    await page.mouse.wheel(0, 600);

    await expect(page.locator('[data-mood-id="999"]')).toBeVisible();
    expect(beforeRequests).toContain(anchorId);
  });

  test('loads older moods from intent captured before controller readiness', async ({ page }) => {
    const anchorId = '1000';
    const channel = {
      slug: 'e2e',
      title: 'E2E Channel',
      description: 'E2E mood feed',
      avatar: '',
    };
    const beforeRequests: string[] = [];

    await page.addInitScript(() => {
      (window as any).__moodAnchorIntentCapture = {
        direction: 'older',
      };
    });
    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      const before = url.searchParams.get('before');
      if (before) beforeRequests.push(before);

      if (before === '1011') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            posts: [
              createMoodFeedPost('1002'),
              createMoodFeedPost('1001'),
              createMoodFeedPost(anchorId),
            ],
            channel,
          }),
        });
        return;
      }

      if (before === anchorId) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            posts: [createMoodFeedPost('999', 'E2E captured boundary intent item')],
            channel,
          }),
        });
        return;
      }

      if (before === '999') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            posts: [createMoodFeedPost('998', 'E2E captured BFCache intent item')],
            channel,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts: [], channel }),
      });
    });

    await page.goto(`/mood?${anchorId}`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-mood-id="999"]')).toBeVisible();
    expect(beforeRequests).toContain(anchorId);

    await page.evaluate(() => {
      (window as any).__moodAnchorIntentCapture.direction = 'older';
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });

    await expect(page.locator('[data-mood-id="998"]')).toBeVisible();
    expect(beforeRequests).toContain('999');
  });

  test('renders a same-day page while the following cursor is still loading', async ({ page }) => {
    const channel = {
      slug: 'e2e',
      title: 'E2E Channel',
      description: 'E2E mood feed',
      avatar: '',
    };
    let releaseFollowingRequest = (): void => {};
    const followingRequestGate = new Promise<void>((resolve) => {
      releaseFollowingRequest = resolve;
    });

    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      const before = url.searchParams.get('before');

      if (url.searchParams.get('probe') === '1') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ latestId: '990001' }),
        });
        return;
      }

      if (before === null) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            posts: [
              createMoodFeedPost('990001'),
              createMoodFeedPost('990000'),
              createMoodFeedPost('989999'),
            ],
            channel,
          }),
        });
        return;
      }

      if (before === '989999') {
        await followingRequestGate;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            posts: [createMoodFeedPost('989998', 'E2E following date item', {
              datetime: '2026-02-09T13:00:00+00:00',
            })],
            channel,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts: [], channel }),
      });
    });

    try {
      await page.goto('/mood', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-mood-id="990000"]')).toBeVisible({ timeout: 1_500 });
    } finally {
      releaseFollowingRequest();
    }
  });

  test('hydrates and plays a shared listening card for mood audio', async ({ page }) => {
    await page.addInitScript(() => {
      class FakeAudio extends EventTarget {
        paused = true;
        currentTime = 0;
        preload = '';
        duration = 245;
        src = '';

        play() {
          this.paused = false;
          return new Promise<void>((resolve) => {
            (window as typeof window & { __resolvePreviewPlay?: () => void }).__resolvePreviewPlay = resolve;
          });
        }

        pause() {
          this.paused = true;
          this.dispatchEvent(new Event('pause'));
        }
      }

      Object.defineProperty(window, 'Audio', {
        configurable: true,
        writable: true,
        value: FakeAudio,
      });
    });

    const channel = {
      slug: 'e2e',
      title: 'E2E Channel',
      description: 'E2E mood feed',
      avatar: '',
    };

    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('probe') === '1') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ latestId: '880001' }),
        });
        return;
      }

      const posts = url.searchParams.has('before')
        ? []
        : [createMoodFeedPost('880001', 'E2E audio mood', {
            media: [{
              type: 'audio',
              src: 'https://audio.example.test/mood/880001/song.mp3',
              fileName: 'Test Artist - Test Song.mp3',
              fileSizeLabel: '9.2 MB',
              durationSeconds: 245,
              originalUrl: 'https://t.me/example/880001',
              thumbnailSrc: '/avatar.webp',
            }],
          })];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts, channel }),
      });
    });

    await page.goto('/mood', { waitUntil: 'domcontentloaded' });

    const mood = page.locator('[data-mood-id="880001"]');
    const card = mood.locator('[data-listening]');
    const playButton = card.locator('[data-listening-play]');

    await expect(card).toHaveAttribute('data-bound', 'true');
    await expect(card.locator('[data-listening-title-label]')).toHaveText('Test Song');
    await expect(card.locator('[data-listening-artist]')).toHaveText('Test Artist');
    await expect(card.locator('[data-listening-total]')).toHaveText('4:05');
    await expect(playButton).toHaveAttribute(
      'data-preview-url',
      'https://audio.example.test/mood/880001/song.mp3',
    );
    await expect(mood.locator('audio')).toHaveCount(0);
    await expect(mood).not.toContainText('9.2 MB');

    await playButton.click();
    await expect(playButton).toHaveAttribute('aria-busy', 'true');
    await expect(playButton).toHaveClass(/is-preview-loading/);
    await expect(card).toHaveClass(/is-preview-loading/);
    await expect(card.locator('.listening-art-icon--loading')).toBeVisible();

    await page.evaluate(() => {
      (window as typeof window & { __resolvePreviewPlay?: () => void }).__resolvePreviewPlay?.();
    });
    await expect(playButton).toHaveAttribute('aria-pressed', 'true');
    await expect(playButton).not.toHaveAttribute('aria-busy', 'true');
    await expect(playButton).not.toHaveClass(/is-preview-loading/);
    await expect(card).toHaveClass(/is-preview-playing/);

    await playButton.click();
    await expect(playButton).toHaveAttribute('aria-pressed', 'false');
    await expect(card).not.toHaveClass(/is-preview-playing/);
  });

  test('binds a client-rendered YouTube preview without country branching or overflow', async ({ page }) => {
    const moodId = '880002';
    const channel = {
      slug: 'e2e',
      title: 'E2E Channel',
      description: 'E2E mood feed',
      avatar: '',
    };
    let playerRequests = 0;

    await page.route('https://www.youtube.com/iframe_api', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript',
        headers: { 'cache-control': 'no-store' },
        body: [
          'window.YT = {',
          '  Player: class {',
          '    constructor(_iframe, options) {',
          '      setTimeout(() => { options.events.onReady(); }, 50);',
          '    }',
          '  }',
          '};',
          'window.onYouTubeIframeAPIReady?.();',
        ].join('\n'),
      });
    });

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

      const posts = url.searchParams.has('before')
        ? []
        : [createMoodFeedPost(moodId, 'E2E YouTube mood', {
            media: [{
              type: 'link-preview',
              href: 'https://youtu.be/aqz-KE-bpKQ?t=12',
              title: 'Big Buck Bunny',
              siteName: 'YouTube',
            }],
          })];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts, channel }),
      });
    });
    await page.route('**/static/youtube/**', async (route) => {
      if (new URL(route.request().url()).pathname.endsWith('/metadata.json')) {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            channelName: 'Blender Foundation',
            channelUrl: 'https://www.youtube.com/@BlenderOfficial',
          }),
        });
        return;
      }
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>',
      });
    });
    await page.route('https://www.youtube-nocookie.com/**', async (route) => {
      playerRequests += 1;
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>YouTube mood fixture</title>',
      });
    });

    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/mood', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      document.documentElement.dataset.country = 'CN';
      sessionStorage.removeItem('youtube-embed-reachable:v1');
    });

    const card = page.locator(`[data-mood-id="${moodId}"] [data-yt]`);
    await expect(card).toHaveAttribute('data-yt-bound', 'true');
    await expect(card.locator('[data-yt-channel]')).toHaveText('Blender Foundation');
    await expect(card.locator('[data-yt-channel]')).toHaveAttribute(
      'href',
      'https://www.youtube.com/@BlenderOfficial',
    );
    await expect(card.locator('[data-yt-player]')).not.toHaveAttribute('src', /.+/u);
    expect(playerRequests).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

    await card.locator('[data-yt-frame]').click();
    await expect(card).toHaveClass(/is-loading/u);

    await expect(card).toHaveClass(/is-playing/u);
    expect(playerRequests).toBe(1);
  });

  test('retries a transient mood page failure', async ({ page }) => {
    const anchorId = '1000';
    const channel = {
      slug: 'e2e',
      title: 'E2E Channel',
      description: 'E2E mood feed',
      avatar: '',
    };
    let attempts = 0;

    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('before') !== '1011') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ posts: [], channel }),
        });
        return;
      }

      attempts += 1;
      if (attempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'temporary_failure' } }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts: [createMoodFeedPost(anchorId)], channel }),
      });
    });

    await page.goto(`/mood?${anchorId}`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator(`[data-mood-id="${anchorId}"]`)).toBeVisible();
    expect(attempts).toBe(2);
  });

  test('keeps archive failures off the live feed after retries fail', async ({ page }) => {
    const anchorId = '1000';
    const channel = {
      slug: 'e2e',
      title: 'E2E Channel',
      description: 'E2E mood feed',
      avatar: '',
    };
    let archiveAttempts = 0;
    let liveAttempts = 0;

    await page.route(/\/api\/v2\/mood(?:\?|$)/, async (route) => {
      archiveAttempts += 1;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'archive_unavailable' } }),
      });
    });
    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('before') !== '1011') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ posts: [], channel }),
        });
        return;
      }

      liveAttempts += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts: [createMoodFeedPost(anchorId)], channel }),
      });
    });

    await page.goto(`/mood?${anchorId}&source=archive`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-mood-feed]')).toHaveAttribute('data-mood-read-source', 'archive');
    await expect(page.locator('[data-mood-error]')).toBeVisible();
    await expect(page.locator('[data-mood-initial-retry]')).toBeVisible();
    expect(archiveAttempts).toBe(2);
    expect(liveAttempts).toBe(0);
  });

  test('renders a too-big video placeholder on anchored feed posts without a poster image', async ({ page }) => {
    const moodId = '9903515';
    const payload = {
      posts: [
        createMoodFeedPost(moodId, 'Forwarded from E2E Source', {
          image: null,
          imageFallback: null,
          imageHeight: null,
          imageLayout: null,
          imageWidth: null,
          previewMediaType: 'too-big-video',
        }),
      ],
      channel: {
        slug: 'e2e',
        title: 'E2E Channel',
        description: 'E2E mood feed',
        avatar: '',
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

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    });

    await page.goto(`/mood?${moodId}`, { waitUntil: 'domcontentloaded' });

    const item = page.locator(`[data-mood-id="${moodId}"]`);
    const expectedTime = new Date(payload.posts[0].datetime).toTimeString().slice(0, 5);
    await expect(item).toBeVisible();
    await expect(item.locator('.mood-item-thumb--video')).toBeVisible();
    await expect(item.locator('.mood-item-thumb-video-label')).toHaveText('Media is too big');
    await expect(item.locator('.mood-item-thumb-video-time')).toHaveText(expectedTime);
    await expect(item.locator('.mood-item-thumb img')).toHaveCount(0);
  });

  test('renders structured too-big video media with the existing feed thumbnail UI', async ({ page }) => {
    const moodId = '9903567';
    const payload = {
      posts: [
        createMoodFeedPost(moodId, 'build w/ claude fable & opus', {
          image: null,
          imageFallback: null,
          imageHeight: null,
          imageLayout: null,
          imageWidth: null,
          media: [
            {
              id: 'telegram-3567-video-0',
              type: 'document',
              href: `https://t.me/tutumood/${moodId}`,
              originalUrl: `https://t.me/tutumood/${moodId}`,
              title: 'Media is too big',
              fileName: 'Media is too big',
              mimeType: 'video',
              width: 2286,
              height: 1440,
              thumbnailSrc: '/static/https:/cdn.example.test/video-thumb.jpg',
            },
          ],
          previewMediaType: 'document',
        }),
      ],
      channel: {
        slug: 'e2e',
        title: 'E2E Channel',
        description: 'E2E mood feed',
        avatar: '',
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

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    });

    await page.goto(`/mood?${moodId}`, { waitUntil: 'domcontentloaded' });

    const item = page.locator(`[data-mood-id="${moodId}"]`);
    const expectedTime = new Date(payload.posts[0].datetime).toTimeString().slice(0, 5);
    await expect(item.locator('.mood-item-thumb--video')).toBeVisible();
    await expect(item.locator('.mood-item-thumb--video img')).toBeVisible();
    await expect(item.locator('.mood-item-thumb-video-label')).toHaveText('Media is too big');
    await expect(item.locator('.mood-item-thumb-video-time')).toHaveText(expectedTime);
    await expect(item.locator('.mood-item-media .video-too-big')).toHaveCount(0);
  });

  test('defers feed video requests and only autoplays while visible', async ({ page }) => {
    const videoId = '9903660';
    const videoUrl = 'https://media.example.test/mood/lazy-video.mp4';
    const posterUrl = 'https://image.example.test/mood/lazy-video-poster.jpg';
    const requestedVideos: string[] = [];
    const tinyGif = Buffer.from('R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64');
    const posts = [
      ...Array.from({ length: 24 }, (_value, index) =>
        createMoodFeedPost(
          String(Number(videoId) + 100 - index),
          `E2E spacer mood ${index} ${'body '.repeat(12)}`,
        )
      ),
      createMoodFeedPost(videoId, 'Deferred video post', {
        media: [
          {
            type: 'video',
            src: videoUrl,
            posterSrc: posterUrl,
            width: 720,
            height: 1280,
          },
        ],
      }),
    ];
    const payload = {
      posts,
      channel: {
        slug: 'e2e',
        title: 'E2E Channel',
        description: 'E2E mood feed',
        avatar: '',
      },
    };

    await page.setViewportSize({ width: 900, height: 520 });
    await page.addInitScript(() => {
      const setPlaybackState = (media: HTMLMediaElement, state: 'paused' | 'playing') => {
        if (media instanceof HTMLVideoElement) {
          media.dataset.testPlaybackState = state;
        }
      };

      HTMLMediaElement.prototype.play = function play() {
        setPlaybackState(this, 'playing');
        return Promise.resolve();
      };
      HTMLMediaElement.prototype.pause = function pause() {
        setPlaybackState(this, 'paused');
      };
    });

    await page.route('**/api/moods**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('probe') === '1') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ latestId: posts[0].id }),
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
        status: 200,
        contentType: 'image/gif',
        body: tinyGif,
      });
    });

    await page.route('https://media.example.test/**', async (route) => {
      requestedVideos.push(route.request().url());
      await route.abort();
    });

    await page.goto('/mood', { waitUntil: 'domcontentloaded' });

    const video = page.locator(`[data-mood-id="${videoId}"] video`);
    await expect(video).toHaveCount(1);
    await expect(video).toHaveAttribute('data-mood-video-src', videoUrl);
    expect(await video.getAttribute('src')).toBeNull();
    await page.waitForTimeout(250);
    expect(requestedVideos).toHaveLength(0);
    await expect(video).not.toHaveAttribute('data-test-playback-state', 'playing');

    await video.evaluate((element) => {
      element.scrollIntoView({ block: 'center' });
    });

    await expect
      .poll(() => requestedVideos.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    await expect(video).toHaveAttribute('src', videoUrl);
    await expect(video).toHaveAttribute('data-test-playback-state', 'playing');

    await scrollPageTo(page, 0);
    await expect(video).toHaveAttribute('data-test-playback-state', 'paused');
  });

  test('keeps compact mood navbar controls visible while scrolling', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const moodId = '12345';
    const longChannelTitle = 'E2E Channel with a deliberately long navigation title';
    const moodFeedPayload = createMoodFeedPayload(moodId);
    moodFeedPayload.channel.title = longChannelTitle;
    moodFeedPayload.posts = Array.from({ length: 12 }, (_value, index) => ({
      ...moodFeedPayload.posts[0],
      id: String(Number(moodId) + index),
      previewText: `E2E mood feed item ${index + 1}`,
      previewHtml: `E2E mood feed item ${index + 1}`,
    }));
    await page.setViewportSize({ width: 320, height: 500 });

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

    await page.goto('/mood');
    const navbar = page.locator('[data-mood-navbar]');
    const controls = navbar.locator('.mood-navbar__controls');
    const blurLayers = navbar.locator('[data-progressive-blur][data-preset="topbar"] .pblur__layer');
    await expect(page.locator('[data-back-to-top]')).toHaveCount(0);
    await expect(navbar).toBeVisible();
    await expect(controls).toBeVisible();
    await expect(blurLayers).toHaveCount(4);
    await expect(navbar.locator('.topbar-action')).toHaveCount(2);
    expect(await navbar.evaluate((element) => element.parentElement === document.body)).toBe(true);
    expect(await navbar.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
    const containedScroll = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[data-page-scroller]')!;
      return {
        rootOverflow: getComputedStyle(document.documentElement).overflowY,
        scrollerOverflow: getComputedStyle(scroller).overflowY,
        timelineName: getComputedStyle(scroller).getPropertyValue('scroll-timeline-name'),
      };
    });
    expect(containedScroll).toEqual({
      rootOverflow: 'hidden',
      scrollerOverflow: 'auto',
      timelineName: '--page-scroll',
    });
    expect(await blurLayers.evaluateAll((layers) => layers.map((layer) => getComputedStyle(layer).backdropFilter))).toEqual([
      'blur(4px)',
      'blur(8px)',
      'blur(14px) saturate(1.4)',
      'blur(22px) saturate(1.6)',
    ]);
    await expect(page.locator('[data-mood-feed]')).not.toHaveClass(/is-hidden/, { timeout: 30_000 });
    await expect(navbar.locator('[data-mood-nav-title]')).toHaveText(longChannelTitle);
    await expect.poll(() => navbar.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).getPropertyValue('--run'))
    )).toBeGreaterThan(1);
    const dockRun = await navbar.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).getPropertyValue('--run'))
    );
    const heroOrigin = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[data-page-scroller]')!;
      const shell = document.querySelector<HTMLElement>('.site-shell')!;
      const heroAvatar = document.querySelector<HTMLElement>('[data-mood-hero] [data-hero-avatar]')!;
      const heroTitle = document.querySelector<HTMLElement>('[data-mood-hero] [data-hero-title]')!;
      const flyer = document.querySelector<HTMLElement>('[data-mood-nav-flyer]')!;
      const titleInk = document.querySelector<HTMLElement>('[data-mood-nav-title]')!;
      const heroAvatarRect = heroAvatar.getBoundingClientRect();
      const flyerRect = flyer.getBoundingClientRect();
      const heroTitleRect = heroTitle.getBoundingClientRect();
      const titleInkRect = titleInk.getBoundingClientRect();
      const heroTransform = getComputedStyle(heroTitle).transform;
      const matrix = heroTransform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(heroTransform);
      const scrollerRect = scroller.getBoundingClientRect();

      return {
        avatarX: Math.abs(flyerRect.x - heroAvatarRect.x),
        avatarY: Math.abs(flyerRect.y - heroAvatarRect.y),
        avatarWidth: Math.abs(flyerRect.width - heroAvatarRect.width),
        avatarHeight: Math.abs(flyerRect.height - heroAvatarRect.height),
        titleX: Math.abs(titleInkRect.x - (heroTitleRect.x - matrix.e)),
        titleY: Math.abs(titleInkRect.y - (heroTitleRect.y - matrix.f)),
        scrollerTop: scrollerRect.top,
        scrollerBottom: scrollerRect.bottom,
        shellTop: shell.getBoundingClientRect().top,
        viewportHeight: window.innerHeight,
      };
    });
    expect(Math.max(
      heroOrigin.avatarX,
      heroOrigin.avatarY,
      heroOrigin.avatarWidth,
      heroOrigin.avatarHeight,
      heroOrigin.titleX,
      heroOrigin.titleY,
    )).toBeLessThanOrEqual(1.5);
    expect(heroOrigin.scrollerTop).toBe(0);
    expect(heroOrigin.shellTop).toBe(0);
    expect(heroOrigin.scrollerBottom).toBe(heroOrigin.viewportHeight);

    // Chromium clamps real element scrolling at 0, while iOS WebKit exposes a
    // negative scrollTop during rubber-band pull. Inject that boundary value and
    // verify ownership returns to the naturally scrolling/levitating hero.
    await page.locator('[data-page-scroller]').evaluate((scroller) => {
      Object.defineProperty(scroller, 'scrollTop', {
        configurable: true,
        get: () => -24,
      });
      scroller.dispatchEvent(new Event('scroll'));
    });
    await expect(page.locator('[data-mood-hero] [data-hero-avatar]')).toHaveCSS('visibility', 'visible');
    await expect(page.locator('[data-mood-hero] [data-hero-title]')).toHaveCSS('visibility', 'visible');
    await expect(navbar.locator('[data-mood-nav-flyer]')).toHaveCSS('visibility', 'hidden');
    await expect(navbar.locator('[data-mood-nav-title]')).toHaveCSS('visibility', 'hidden');
    await page.locator('[data-page-scroller]').evaluate((scroller) => {
      Reflect.deleteProperty(scroller, 'scrollTop');
      scroller.scrollTo({ top: 0, behavior: 'instant' });
      scroller.dispatchEvent(new Event('scroll'));
    });

    await scrollPageTo(page, dockRun + 5);

    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await readPageScrollTop(page)).toBeGreaterThan(dockRun);

    await expect(navbar).toHaveClass(/is-docked/, { timeout: 30_000 });
    await expect.poll(() => navbar.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).getPropertyValue('--dock-ride'))
    )).toBeGreaterThan(0.99);
    await expect.poll(() => navbar.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).getPropertyValue('--dock-fold'))
    )).toBeGreaterThan(0.99);

    const dockedGeometry = await navbar.evaluate((element) => {
      const flyer = element.querySelector<HTMLElement>('[data-mood-nav-flyer]');
      const slot = element.querySelector<HTMLElement>('[data-mood-nav-avatar-slot]');
      if (!flyer || !slot) throw new Error('Mood navbar dock geometry is missing');
      const flyerRect = flyer.getBoundingClientRect();
      const slotRect = slot.getBoundingClientRect();
      return {
        x: Math.abs(flyerRect.x - slotRect.x),
        y: Math.abs(flyerRect.y - slotRect.y),
        width: Math.abs(flyerRect.width - slotRect.width),
        height: Math.abs(flyerRect.height - slotRect.height),
      };
    });
    expect(Math.max(...Object.values(dockedGeometry))).toBeLessThanOrEqual(1.5);

    const compactLayout = await navbar.evaluate((element) => {
      const titleBox = element.querySelector<HTMLElement>('[data-mood-nav-title-box]');
      const titleInk = element.querySelector<HTMLElement>('[data-mood-nav-title]');
      const search = element.querySelector<HTMLElement>('[data-command-open]');
      if (!titleBox || !titleInk || !search) throw new Error('Mood navbar compact layout is missing');
      const titleBoxRect = titleBox.getBoundingClientRect();
      const titleInkRect = titleInk.getBoundingClientRect();
      const searchRect = search.getBoundingClientRect();
      return {
        titleBoxRight: titleBoxRect.right,
        titleInkRight: titleInkRect.right,
        searchLeft: searchRect.left,
        titleTruncated: titleInk.scrollWidth > titleInk.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });
    expect(compactLayout.titleBoxRight).toBeLessThanOrEqual(compactLayout.searchLeft + 1);
    expect(compactLayout.titleInkRight).toBeLessThanOrEqual(compactLayout.searchLeft + 1);
    expect(compactLayout.titleTruncated).toBe(true);
    expect(compactLayout.scrollWidth).toBeLessThanOrEqual(compactLayout.clientWidth + 1);
    await expect(controls).toBeVisible();

    await page.evaluate(() => {
      window.history.scrollRestoration = 'manual';
      document.querySelector<HTMLElement>('[data-page-scroller]')
        ?.scrollTo({ top: 0, behavior: 'instant' });
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload({ waitUntil: 'domcontentloaded' });

    const reducedNavbar = page.locator('[data-mood-navbar]');
    const reducedFlyer = reducedNavbar.locator('[data-mood-nav-flyer]');
    await expect(page.locator('[data-mood-feed]')).not.toHaveClass(/is-hidden/, { timeout: 30_000 });
    await expect.poll(() => reducedNavbar.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).getPropertyValue('--run'))
    )).toBeGreaterThan(1);
    const reducedRun = await reducedNavbar.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).getPropertyValue('--run'))
    );
    expect(await reducedNavbar.evaluate((element) =>
      element.style.getPropertyValue('animation-timeline')
    )).toBe('');

    await scrollPageTo(page, reducedRun / 2);
    await expect(reducedNavbar).not.toHaveClass(/is-docked/);
    await expect(reducedFlyer).toHaveCSS('visibility', 'hidden');
    expect(await reducedNavbar.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).getPropertyValue('--dock-ride'))
    )).toBe(0);

    await scrollPageTo(page, reducedRun + 5);
    await expect(reducedNavbar).toHaveClass(/is-docked/);
    await expect(reducedFlyer).toHaveCSS('visibility', 'visible');
    expect(await reducedNavbar.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).getPropertyValue('--dock-ride'))
    )).toBe(1);
  });

  test('keeps the update notice above the desktop navbar blur', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/mood', { waitUntil: 'domcontentloaded' });

    const navbar = page.locator('[data-mood-navbar]');
    const updateNotice = navbar.locator('[data-mood-update-notice]');
    await updateNotice.evaluate((element) => {
      element.style.display = 'inline-flex';
      element.style.opacity = '1';
      element.style.transform = 'none';
    });
    await expect(updateNotice).toBeVisible();

    const noticeLayer = await updateNotice.evaluate((element) => {
      const blur = element.parentElement?.querySelector<HTMLElement>(':scope > .topbar__blur');
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        insideNavbar: element.parentElement?.matches('[data-mood-navbar]') ?? false,
        noticeOwnsPixels: hit?.closest('[data-mood-update-notice]') === element,
        noticeZIndex: Number.parseInt(getComputedStyle(element).zIndex, 10),
        blurZIndex: blur ? Number.parseInt(getComputedStyle(blur).zIndex, 10) : -1,
        pointerEvents: getComputedStyle(element).pointerEvents,
      };
    });

    expect(noticeLayer.insideNavbar).toBe(true);
    expect(noticeLayer.noticeOwnsPixels).toBe(true);
    expect(noticeLayer.noticeZIndex).toBeGreaterThan(noticeLayer.blurZIndex);
    expect(noticeLayer.pointerEvents).toBe('auto');
  });

  test('returns anchored feeds to the latest window from the desktop timeline wheel', async ({ page }) => {
    const moodId = '991000';
    const channel = {
      slug: 'e2e',
      title: 'E2E Channel',
      description: 'E2E mood feed',
      avatar: '',
    };
    const posts = Array.from({ length: 36 }, (_value, index) => {
      const date = new Date(Date.UTC(2026, 1, 10 - Math.floor(index / 6), 13, index));
      const id = String(Number(moodId) - index);
      return createMoodFeedPost(
        id,
        `E2E timeline wheel item ${id} ${'body '.repeat(24)}`,
        { datetime: date.toISOString() }
      );
    });

    await page.setViewportSize({ width: 1280, height: 720 });

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

      if (url.searchParams.has('before') || url.searchParams.has('after')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ posts: [], channel }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ posts, channel }),
      });
    });

    await page.goto('/mood', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-mood-feed]')).not.toHaveClass(/is-hidden/, { timeout: 30_000 });

    const wheel = page.locator('[data-timeline-wheel]');
    const topButton = page.locator('[data-timeline-top]');
    const label = page.locator('[data-timeline-label]');
    await expect(wheel).toHaveClass(/is-visible/, { timeout: 30_000 });
    await expect(topButton).toBeVisible();
    await expect.poll(() => label.evaluate((element) => element.textContent?.trim() ?? '')).not.toBe('');

    const beforeHover = await page.evaluate(() => {
      const notches = Array.from(document.querySelectorAll<HTMLElement>('.timeline-notch.is-major'));
      const active = document.querySelector<HTMLElement>('.timeline-notch.is-major.is-active');
      const top = document.querySelector<HTMLElement>('[data-timeline-top]');
      if (!active || !top) throw new Error('Timeline wheel is missing active controls');

      return {
        activeTransform: getComputedStyle(active).transform,
        activeWidth: active.getBoundingClientRect().width,
        cursor: getComputedStyle(top).cursor,
        transforms: notches.map((notch) => getComputedStyle(notch).transform),
        wheelTransform: getComputedStyle(document.querySelector<HTMLElement>('[data-timeline-wheel]')!).transform,
      };
    });

    await topButton.hover();
    await expect
      .poll(() => label.evaluate((element) => (
        element.textContent?.replace(/(.)\1+/g, '$1').replace(/\s+/g, ' ').trim() ?? ''
      )))
      .toContain('TOP');
    await page.waitForTimeout(350);

    const afterHover = await page.evaluate(() => {
      const notches = Array.from(document.querySelectorAll<HTMLElement>('.timeline-notch.is-major'));
      const active = document.querySelector<HTMLElement>('.timeline-notch.is-major.is-active');
      const top = document.querySelector<HTMLElement>('[data-timeline-top]');
      if (!active || !top) throw new Error('Timeline wheel is missing active controls');

      return {
        activeTransform: getComputedStyle(active).transform,
        activeWidth: active.getBoundingClientRect().width,
        cursor: getComputedStyle(top).cursor,
        transforms: notches.map((notch) => getComputedStyle(notch).transform),
        wheelTransform: getComputedStyle(document.querySelector<HTMLElement>('[data-timeline-wheel]')!).transform,
      };
    });

    expect(afterHover.transforms).toEqual(beforeHover.transforms);
    expect(afterHover.activeTransform).toBe(beforeHover.activeTransform);
    expect(afterHover.activeWidth).toBeGreaterThan(beforeHover.activeWidth);
    expect(afterHover.wheelTransform).toBe(beforeHover.wheelTransform);
    expect(afterHover.cursor).toBe('pointer');
    expect(beforeHover.cursor).toBe('pointer');

    await page.locator('[data-page-scroller]').evaluate((scroller) => {
      scroller.scrollTo({ top: scroller.scrollHeight * 0.7, behavior: 'instant' });
    });
    await expect.poll(() => readPageScrollTop(page)).toBeGreaterThan(720);

    const labelBox = await label.boundingBox();
    expect(labelBox).not.toBeNull();
    const labelCenter = {
      x: labelBox!.x + labelBox!.width / 2,
      y: labelBox!.y + labelBox!.height / 2,
    };
    const topButtonOwnsLabelHitArea = await page.evaluate(({ x, y }) => {
      return document.elementFromPoint(x, y)?.closest('[data-timeline-top]') !== null;
    }, labelCenter);
    expect(topButtonOwnsLabelHitArea).toBe(true);

    await page.mouse.click(labelCenter.x, labelCenter.y);
    await expect.poll(async () => Math.round(await readPageScrollTop(page))).toBe(0);

    await page.goto(`/mood?${moodId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-mood-feed]')).not.toHaveClass(/is-hidden/, { timeout: 30_000 });
    await page.locator('[data-mood-nav-top]').dispatchEvent('click');
    await page.waitForURL((url) => url.pathname === '/mood' && url.search === '');
    await expect.poll(async () => Math.round(await readPageScrollTop(page))).toBe(0);
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
    const popoverId = await commentsWrapper.locator('.mood-item-comments').getAttribute('aria-controls');
    expect(popoverId).toBeTruthy();
    if (!popoverId) throw new Error('Missing comments popover id');
    const popover = page.locator(`#${popoverId}`);
    await commentsWrapper.hover();

    await expect
      .poll(async () => popover.locator('.mood-popover-comment').count(), { timeout: 30_000 })
      .toBe(1);

    const popoverContent = popover.locator('.mood-popover-comment-content').first();
    await expect(popoverContent.locator('.mood-comment-quote')).toBeVisible();
    await expect(popoverContent.locator('.mood-item-quote-author')).toHaveText('Reply Author');
    await expect(popoverContent.locator('.mood-item-quote-text')).toContainText(/First line\s+Second line/);
    await expect(popoverContent.locator('strong')).toHaveText('Bold');
    await expect(popoverContent.locator('p a')).toHaveAttribute('href', `/mood/${moodId}#comments`);
    await expect(popoverContent).toContainText('🙂');
  });

  test('keeps the feed comments popover open and scrollable under the pointer', async ({ page }) => {
    const moodId = '12345';
    const viewport = { width: 828, height: 620 };
    const moodFeedPayload = createMoodFeedPayload(moodId);
    moodFeedPayload.posts[0].commentsCount = 8;

    const commentsPayload = {
      comments: Array.from({ length: 8 }, (_value, index) => createComment({
        id: String(9100 + index),
        author: `E2E ${index + 1}`,
        content: `<p>Scrollable comment ${index + 1} ${'preview text '.repeat(18)}</p>`,
      })),
      hasMore: false,
      nextBefore: '',
    };

    await page.setViewportSize(viewport);

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
        body: JSON.stringify(commentsPayload),
      });
    });

    await page.goto('/mood', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-mood-feed]')).not.toHaveClass(/is-hidden/, { timeout: 30_000 });

    const firstItem = page.locator('[data-mood-list] .mood-item').first();
    const commentsWrapper = firstItem.locator('.mood-comments-wrapper');
    await expect(commentsWrapper).toBeVisible();
    const popoverId = await commentsWrapper.locator('.mood-item-comments').getAttribute('aria-controls');
    expect(popoverId).toBeTruthy();
    if (!popoverId) throw new Error('Missing comments popover id');
    const popover = page.locator(`#${popoverId}`);
    await commentsWrapper.hover();

    await expect
      .poll(async () => popover.locator('.mood-popover-comment').count(), { timeout: 30_000 })
      .toBe(8);
    await expect(popover).toBeVisible();

    const box = await popover.boundingBox();
    expect(box).toBeTruthy();
    if (!box) throw new Error('Missing comments popover box');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

    await page.mouse.move(
      box.x + (box.width / 2),
      box.y + Math.min(box.height - 16, Math.max(16, box.height / 2))
    );
    await page.waitForTimeout(250);
    await expect(popover).toBeVisible();

    await page.mouse.wheel(0, 360);
    await expect
      .poll(async () => popover.evaluate((element) => Math.round(element.scrollTop)), { timeout: 5_000 })
      .toBeGreaterThan(0);
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
    await expect(page.locator('[data-back-to-top]')).toBeAttached();
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
    await expect(page).toHaveURL(new RegExp(`/mood\\?${latestMoodId}$`));
  });

  test('renders image media in detail comments', async ({ page, request }) => {
    const latestMoodId = await getLatestMoodId(request);
    test.skip(!latestMoodId, 'No mood id available from /api/moods');

    const requestedImages: string[] = [];
    const tinyGif = Buffer.from('R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64');
    const commentImages = [
      'https://image.example.test/comment-photo-1.gif',
      'https://image.example.test/comment-photo-2.gif',
      'https://image.example.test/comment-photo-3.gif',
    ];

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
                    <img src="${commentImages[0]}" alt="Comment photo 1" loading="eager" />
                  </button>
                  <button class="image-preview-button image-preview-wrap">
                    <img src="${commentImages[1]}" alt="Comment photo 2" loading="eager" />
                  </button>
                  <button class="image-preview-button image-preview-wrap">
                    <img src="${commentImages[2]}" alt="Comment photo 3" loading="eager" />
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
    const image = page.locator('[data-comments-list] .mood-comment-content .image-preview-wrap img').first();
    await expect(page.locator('[data-comments-list] .mood-comment-content .image-preview-wrap img')).toHaveCount(3);
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('src', commentImages[0]);
    const imageBox = await image.boundingBox();
    expect(imageBox).not.toBeNull();
    expect(imageBox!.width).toBeLessThanOrEqual(130);
    expect(imageBox!.height).toBeLessThanOrEqual(130);
    for (const commentImage of commentImages) {
      await expect
        .poll(() => requestedImages.filter((url) => url === commentImage).length, { timeout: 30_000 })
        .toBeGreaterThan(0);
    }
  });

  test('reserves a single comment image before its bytes arrive', async ({ page, request }) => {
    const latestMoodId = await getLatestMoodId(request);
    test.skip(!latestMoodId, 'No mood id available from /api/moods');

    const imageUrl = 'https://image.example.test/comment-photo-single.gif';
    const tinyGif = Buffer.from('R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64');
    let releaseImage!: () => void;
    const imageGate = new Promise<void>((resolve) => {
      releaseImage = resolve;
    });

    await page.route('**/api/comments?postId=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comments: [{
            id: 'single-image-comment',
            author: 'E2E',
            authorAvatar: '',
            datetime: '2026-02-10T13:10:00+00:00',
            content: `<div class="image-list-container"><button class="image-preview-button image-preview-wrap"><img src="${imageUrl}" alt="" loading="eager" /></button></div>`,
            reactions: [],
          }],
          hasMore: false,
          nextBefore: '',
        }),
      });
    });
    await page.route(imageUrl, async (route) => {
      await imageGate;
      await route.fulfill({ status: 200, contentType: 'image/gif', body: tinyGif });
    });

    await page.goto(`/mood/${latestMoodId}#comments`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-comments-loading]')).toHaveCount(0, { timeout: 30_000 });

    const frame = page.locator('.mood-comment-content .image-preview-wrap');
    const before = await frame.boundingBox();
    expect(before).not.toBeNull();
    expect(before!.width).toBeGreaterThan(100);
    expect(Math.abs(before!.height - before!.width)).toBeLessThan(1);

    releaseImage();
    const image = frame.locator('img');
    await expect.poll(() => image.evaluate((node) => {
      const img = node as HTMLImageElement;
      return img.complete && img.naturalWidth > 0;
    })).toBe(true);
    const after = await frame.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.height - before!.height)).toBeLessThan(1);
  });

  test('clips sticker media in detail comments without changing the comment bubble shape', async ({ page, request }) => {
    const latestMoodId = await getLatestMoodId(request);
    test.skip(!latestMoodId, 'No mood id available from /api/moods');

    await page.setViewportSize({ width: 390, height: 844 });

    const stickerImage = 'https://image.example.test/comment-sticker.webp';
    const tinyGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
    let releaseSticker!: () => void;
    const stickerGate = new Promise<void>((resolve) => {
      releaseSticker = resolve;
    });

    await page.route('**/api/comments?postId=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          comments: [
            {
              id: '9002',
              author: 'Sticker',
              authorAvatar: '',
              datetime: '2026-02-10T13:10:00+00:00',
              content: `<img class="sticker" src="${stickerImage}" style="width: 256px;" alt="Sticker" loading="lazy" decoding="async" />`,
              reactions: [],
            },
          ],
          hasMore: false,
          nextBefore: '',
        }),
      });
    });

    await page.route(stickerImage, async (route) => {
      await stickerGate;
      await route.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: tinyGif,
      });
    });

    await page.goto(`/mood/${latestMoodId}#comments`, { waitUntil: 'domcontentloaded' });

    const sticker = page.locator('[data-comments-list] .mood-comment-content img.sticker');
    await expect(sticker).toBeVisible({ timeout: 30_000 });
    const matte = sticker.locator('..');
    const before = await matte.boundingBox();
    expect(before).not.toBeNull();
    expect(before!.height).toBeGreaterThan(100);

    releaseSticker();
    await expect.poll(() => sticker.evaluate((node) => {
      const image = node as HTMLImageElement;
      return image.complete && image.naturalWidth > 0;
    })).toBe(true);
    const after = await matte.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.height - before!.height)).toBeLessThan(1);

    const styles = await sticker.evaluate((image) => {
      const stickerStyle = getComputedStyle(image);
      const matte = image.closest('p');
      const matteStyle = matte ? getComputedStyle(matte) : null;
      const body = image.closest('.mood-comment-body');
      const bodyStyle = body ? getComputedStyle(body) : null;

      return {
        bodyBottomLeftRadius: bodyStyle?.borderBottomLeftRadius,
        bodyTopLeftRadius: bodyStyle?.borderTopLeftRadius,
        matteBackground: matteStyle?.backgroundColor,
        matteOverflow: matteStyle?.overflow,
        stickerRadius: stickerStyle.borderTopLeftRadius,
        stickerTransform: stickerStyle.transform,
      };
    });

    expect(styles.bodyTopLeftRadius).toBe('16px');
    expect(styles.bodyBottomLeftRadius).toBe('5px');
    expect(styles.stickerRadius).toBe('8px');
    expect(styles.matteBackground).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles.matteOverflow).toBe('hidden');
    expect(styles.stickerTransform).toContain('1.2');
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

    await page.setViewportSize({ width: 390, height: 844 });

    await page.route('**/api/notify/subscribe', async (route) => {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'pending' }),
      });
    });

    await page.goto('/mood?subscribe=1', { waitUntil: 'domcontentloaded' });

    const panel = page.locator('.subscribe-panel');
    const scrim = page.locator('[data-subscribe-scrim][data-subscribe-id="mood"]');
    await expect(panel).toHaveClass(/is-open/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/mood$/);
    await expect(scrim).toHaveClass(/is-open/);
    await expect(scrim).toBeVisible();
    expect(await panel.evaluate((element) => element.parentElement === document.body)).toBe(true);
    expect(await scrim.evaluate((element) => element.parentElement === document.body)).toBe(true);
    await expect(panel.getByRole('link', { name: '通过 RSS 订阅' })).toHaveAttribute('href', '/mood/rss.xml');
    await expect(panel.getByRole('link', { name: '订阅 Telegram 频道' })).toHaveAttribute('href', 'https://t.me/e2e');

    await disableNotifyNativeValidation(page);
    await page.locator('[data-sub-email]').fill('reader@example.com');
    await page.locator('label[for="mood-mode-daily"]').click();
    await page.locator('[data-sub-submit]').click();

    await expect(page.locator('[data-sub-success-view]')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('[data-sub-success-text]')).toHaveText('确认邮件已发，去收件箱点一下。');
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]?.email).toBe('reader@example.com');
    expect(requests[0]?.channels).toEqual(['blog', 'mood']);
    expect(requests[0]?.deliveryMode).toBe('daily');

    await page.locator('[data-sub-done]').click();
    await expect(panel).not.toHaveClass(/is-open/);
    await expect(scrim).not.toHaveClass(/is-open/);
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
    await page.locator('[data-sub-email]').fill('reader@example.com');
    await page.locator('[data-sub-submit]').click();

    await expect(page.locator('[data-sub-success-view]')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('[data-sub-success-text]')).toHaveText('已经订阅过了。');
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
    await page.locator('[data-sub-email]').fill('not-an-email');
    await page.locator('[data-sub-submit]').click();
    await expect(page.locator('[data-sub-error]')).toHaveText('请输入有效的邮箱地址。');

    await page.locator('[data-sub-email]').fill('reader@example.com');
    await page.locator('[data-sub-submit]').click();
    await expect(page.locator('[data-sub-error]')).toHaveText('太频繁了，稍后再试。');
    await expect(page.locator('[data-sub-form-view]')).not.toHaveClass(/is-hidden/);

    await page.locator('[data-sub-submit]').click();
    await expect(page.locator('[data-sub-error-view]')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('[data-sub-error-text]')).toHaveText('Backend failed');

    await page.locator('[data-sub-retry]').click();
    await expect(page.locator('[data-sub-form-view]')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('[data-sub-error]')).toHaveText('');
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

  test('renders the detail gallery with a stable ratio-aware layout', async ({ page }) => {
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
    expect(await track.evaluate((element) => getComputedStyle(element).display)).toBe('flex');
  });

  test('reserves a detail gallery without client JavaScript', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/*.js', (route) => route.abort());
    await page.route('https://image.example.test/**', (route) => route.abort());

    await page.goto('/mood/990777', { waitUntil: 'domcontentloaded' });

    const track = page.locator('.mood-gallery--detail [data-mood-gallery-track]');
    const box = await track.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(300);
    expect(box!.height).toBeLessThan(450);
    const slides = track.locator('[data-mood-gallery-slide]');
    await expect(slides).toHaveCount(3);
    const geometry = await slides.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, right: rect.right, height: rect.height };
    }));
    expect(Math.abs(geometry[1].right - (box!.x + box!.width))).toBeLessThan(2);
    expect(Math.abs(geometry[0].top - geometry[1].top)).toBeLessThan(1);
    expect(geometry[2].top).toBeGreaterThan(geometry[0].top + geometry[0].height);
    expect(geometry[2].height).toBeLessThanOrEqual(210);
  });

  test('reserves a single detail image and paints its blur placeholder before load', async ({ page }) => {
    const imagePattern = '**/api/v2/images/mood/990778/0*';
    const tinyGif = Buffer.from('R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64');
    let releaseImages!: () => void;
    const imageGate = new Promise<void>((resolve) => {
      releaseImages = resolve;
    });

    await page.route(imagePattern, async (route) => {
      if (new URL(route.request().url()).searchParams.get('w') === '32') {
        await route.fulfill({ status: 200, contentType: 'image/gif', body: tinyGif });
        return;
      }
      await imageGate;
      await route.fulfill({ status: 200, contentType: 'image/gif', body: tinyGif });
    });
    await page.goto('/mood/990778', { waitUntil: 'domcontentloaded' });

    const frame = page.locator('.mood-post-content [data-mood-image-frame]').first();
    const mainImage = frame.locator('[data-mood-image-main]');
    const blurImage = frame.locator('.mood-image-blur');
    const before = await frame.boundingBox();
    expect(before).not.toBeNull();
    expect(before!.width).toBeGreaterThan(100);
    expect(before!.height).toBeGreaterThan(100);
    await expect(blurImage).toHaveAttribute('src', /\?w=32$/);
    await expect.poll(() => blurImage.evaluate((node) => {
      const image = node as HTMLImageElement;
      return image.complete && image.naturalWidth > 0;
    })).toBe(true);
    const blurBox = await blurImage.boundingBox();
    expect(blurBox).not.toBeNull();
    expect(blurBox!.width).toBeGreaterThan(before!.width);
    expect(await blurImage.evaluate((node) => getComputedStyle(node).objectFit)).toBe('cover');

    releaseImages();
    await expect.poll(() => mainImage.evaluate((node) => {
      const img = node as HTMLImageElement;
      return img.complete && img.naturalWidth > 0;
    })).toBe(true);
    const after = await frame.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.height - before!.height)).toBeLessThan(1);
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

  test('keeps embed channel and rich text on mono while honoring density', async ({ page }) => {
    await page.goto('/mood/embed?count=1&theme=light&density=regular&link=false');
    const regular = await page.locator('.mood-item-text, .mood-item-quote, .empty-state').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
      };
    });
    const channel = await page.locator('.channel-name').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontFamily: style.fontFamily,
        text: element.textContent?.trim() ?? '',
      };
    });

    await page.goto('/mood/embed?count=1&theme=light&density=compact&font=mono&link=false');
    const compact = await page.locator('.mood-item-text, .mood-item-quote, .empty-state').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
      };
    });

    expect(channel.text.length).toBeGreaterThan(0);
    expect(channel.fontFamily.toLowerCase()).toContain('jetbrains mono');
    expect(regular.fontFamily.toLowerCase()).toContain('jetbrains mono');
    expect(regular.fontSize).toBe('14px');
    expect(compact.fontFamily.toLowerCase()).toContain('jetbrains mono');
    expect(compact.fontSize).toBe('13px');
  });

  test('keeps transparent auto embeds readable on light hosts', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/mood/embed?count=1&theme=auto&frame=false&link=false');

    await expect(page.locator('html')).toHaveAttribute('data-embed-theme', 'auto');
    await expect(page.locator('html')).toHaveAttribute('data-embed-frame', 'false');

    await expect
      .poll(async () => page.locator('.embed-card, .empty-state').first().evaluate((element) => {
        return getComputedStyle(element).color;
      }))
      .toBe('rgb(0, 0, 0)');
  });

  test('renders embed galleries with feed image styling', async ({ page }) => {
    await page.goto('/mood/embed?id=990777&theme=light&link=false');

    await expect(page.locator('.mood-gallery--feed')).toBeVisible();
    await expect(page.locator('.mood-gallery-image')).toHaveCount(3);
    await expect(page.locator('.mood-image')).toHaveCount(0);
  });

  test('reserves an embedded image before its bytes arrive', async ({ page }) => {
    const imagePattern = '**/api/v2/images/mood/990778/0*';
    const blurSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#999" /></svg>';
    const sharpSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#333" /></svg>';
    let releaseImages!: () => void;
    const imageGate = new Promise<void>((resolve) => {
      releaseImages = resolve;
    });

    await page.route(imagePattern, async (route) => {
      if (new URL(route.request().url()).searchParams.get('w') === '32') {
        await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: blurSvg });
        return;
      }
      await imageGate;
      await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: sharpSvg });
    });
    await page.goto('/mood/embed?id=990778&theme=light&link=false', { waitUntil: 'domcontentloaded' });

    const frame = page.locator('.mood-item-thumb[data-mood-image-frame]');
    const before = await frame.boundingBox();
    expect(before).not.toBeNull();
    expect(before!.width).toBeGreaterThan(100);
    expect(before!.height).toBeGreaterThan(100);
    const blurImage = frame.locator('.mood-image-blur');
    await expect(blurImage).toHaveAttribute('src', /\?w=32$/);
    await expect.poll(() => blurImage.evaluate((node) => {
      const image = node as HTMLImageElement;
      return image.complete && image.naturalWidth > 0;
    })).toBe(true);
    const blurBox = await blurImage.boundingBox();
    expect(blurBox).not.toBeNull();
    expect(blurBox!.width).toBeGreaterThan(before!.width);
    expect(await blurImage.evaluate((node) => getComputedStyle(node).objectFit)).toBe('cover');
    releaseImages();
    const mainImage = frame.locator('[data-mood-image-main]');
    await expect.poll(() => mainImage.evaluate((node) => {
      const image = node as HTMLImageElement;
      return image.complete && image.naturalWidth > 0;
    })).toBe(true);
    const after = await frame.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.height - before!.height)).toBeLessThan(1);
    expect(await mainImage.evaluate((node) => getComputedStyle(node).objectFit)).toBe('contain');
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
