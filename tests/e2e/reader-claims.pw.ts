import { expect, test } from './fixtures';

const candidates = [
  { id: 'earlier-a', surface: 'blog', postId: 'post-a', authorName: 'Reader', body: 'I wrote this earlier comment.', createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'earlier-b', surface: 'blog', postId: 'post-b', authorName: 'Someone else', body: 'This is not my comment.', createdAt: '2026-08-30T10:00:00.000Z' },
];

test('historical comments require a verified reader and never claim on page load', async ({ page }) => {
  const writes: string[] = [];
  await page.route('**/api/v2/reader/claims', async (route) => {
    if (route.request().method() === 'POST') writes.push(route.request().postData() ?? '');
    await route.fulfill({ status: 401, json: { error: 'not_verified' } });
  });
  await page.goto('/reader/comments?lang=en', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Review your earlier comments' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Confirm email', exact: true })).toHaveAttribute('href', '/reader/confirm?lang=en');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('the reader explicitly links selected comments and leaves other matching-email rows alone', async ({ page }) => {
  let remaining = [...candidates];
  const writes: unknown[] = [];
  await page.route('**/api/v2/reader/claims', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { commentIds: string[] };
      writes.push(body);
      remaining = remaining.filter((comment) => !body.commentIds.includes(comment.id));
      await route.fulfill({ json: { claimedIds: body.commentIds } });
      return;
    }
    await route.fulfill({ json: { comments: remaining, hasMore: false } });
  });
  await page.goto('/reader/comments?lang=en', { waitUntil: 'networkidle' });
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Link selected comments (0)' })).toBeDisabled();
  expect(writes).toEqual([]);
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Link selected comments (1)' }).click();
  await expect(page.getByRole('status')).toContainText('1 comment linked');
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await expect(page.getByText('This is not my comment.', { exact: true })).toBeVisible();
  expect(writes).toEqual([{ commentIds: ['earlier-a'] }]);
});

test('a failed historical claim keeps the selection available for retry', async ({ page }) => {
  await page.route('**/api/v2/reader/claims', (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 503, json: { error: 'unavailable' } })
    : route.fulfill({ json: { comments: candidates, hasMore: false } }));
  await page.goto('/reader/comments?lang=en', { waitUntil: 'networkidle' });
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Link selected comments (1)' }).click();
  await expect(page.getByRole('status')).toContainText('could not be linked');
  await expect(page.getByRole('checkbox').first()).toBeChecked();
  await expect(page.getByRole('button', { name: 'Link selected comments (1)' })).toBeEnabled();
});

test('older candidate pages are reachable without claiming and selection resets after a claim', async ({ page }) => {
  const requestedOffsets: number[] = [];
  const writes: unknown[] = [];
  await page.route('**/api/v2/reader/claims**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      writes.push(body);
      await route.fulfill({ json: { claimedIds: body.commentIds } });
      return;
    }
    const offset = Number(new URL(request.url()).searchParams.get('offset') ?? 0);
    requestedOffsets.push(offset);
    await route.fulfill({ json: { comments: [candidates[offset === 0 ? 1 : 0]], hasMore: offset === 0 } });
  });
  await page.goto('/reader/comments?lang=en', { waitUntil: 'networkidle' });
  await expect(page.getByText('This is not my comment.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Older comments', exact: true }).click();
  await expect(page.getByText('I wrote this earlier comment.', { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'Previous comments', exact: true }).click();
  await expect(page.getByText('This is not my comment.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Older comments', exact: true }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Link selected comments (1)' }).click();
  await expect(page.getByText('This is not my comment.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Link selected comments (0)' })).toBeDisabled();
  expect(writes).toEqual([{ commentIds: ['earlier-a'] }]);
  expect(requestedOffsets).toEqual([0, 50, 0, 50, 0]);
});
