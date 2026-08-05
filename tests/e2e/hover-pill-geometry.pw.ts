import { expect, test } from '@playwright/test';

const PHONE = { width: 390, height: 844 };

// Two layout regressions, both mechanically checkable:
//   1. the hover pill keeps its corners (no scale() on a 1x1 box)
//   2. the blog post footer reserves no void under the pledge line on phones
//
// Blog routes are prerendered, so point E2E_BASE_URL at a static server over
// dist/client. The default webServer (astro dev) 404s the posts.

test('blog list pill is a rounded rect, not an ellipse', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/blog/', { waitUntil: 'networkidle' });

  // .blog-row is the hover target PostHover.astro binds the pill to.
  const row = page.locator('.blog-row').first();
  await row.hover();
  await page.waitForTimeout(200);

  const pill = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.blog-indicator');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      transform: cs.transform,
      radius: cs.borderTopLeftRadius,
      height: box.height,
      styleWidth: el.style.width,
    };
  });

  expect(pill).not.toBeNull();
  // Size must live in layout, not in a scale() — a scaled 1x1 box scales the
  // radius with it, clamps on both axes, and renders as an ellipse.
  expect(pill!.styleWidth).not.toBe('');
  const matrix = pill!.transform.match(/matrix\(([^)]+)\)/);
  if (matrix) {
    const [a, , , d] = matrix[1].split(',').map((n) => parseFloat(n));
    expect(Math.abs(a - 1)).toBeLessThan(0.01);
    expect(Math.abs(d - 1)).toBeLessThan(0.01);
  }
  // A rounded rect: the radius stays well under half the short edge.
  expect(parseFloat(pill!.radius)).toBeLessThan(pill!.height / 2);
});

test('post footer pledge line reserves no vertical void on a phone', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/blog/demo-effects/', { waitUntil: 'networkidle' });

  const metrics = await page.evaluate(() => {
    const aside = document.querySelector<HTMLElement>('.not-by-ai, .ai-credit');
    if (!aside) return null;
    const line = aside.querySelector<HTMLElement>('.not-by-ai__line, .ai-credit__line');
    return {
      asideHeight: aside.getBoundingClientRect().height,
      lineHeight: line?.getBoundingClientRect().height ?? 0,
      flexBasis: getComputedStyle(aside).flexBasis,
    };
  });

  expect(metrics).not.toBeNull();
  // flex-basis follows the flex axis: under `flex-direction: column` the old
  // `flex: 1 1 320px` reserved 320px of HEIGHT around a ~22px line.
  expect(metrics!.flexBasis).toBe('auto');
  expect(metrics!.asideHeight).toBeLessThan(metrics!.lineHeight * 3);
});
