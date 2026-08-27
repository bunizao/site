import { expect, test } from '@playwright/test';

// iOS 26 can paint root-scrolling content above the layout viewport when its
// dynamic toolbar collapses, while every CSS safe-area signal still reads 0.
// Blog and Mood close that band at the source: the root stays locked and a
// full-viewport inner element owns scrolling. Chromium cannot reproduce the
// physical band, so these tests guard the structural contract that prevents it.

const PHONE = { width: 390, height: 844 };
const FAKE_INSET = 59; // iPhone 16 Pro portrait status-bar band.

async function openDemoPost(page: import('@playwright/test').Page) {
  await page.setViewportSize(PHONE);
  await page.goto('/blog/demo-effects', { waitUntil: 'networkidle' });
}

async function scrollPageTo(page: import('@playwright/test').Page, top: number) {
  await page.locator('[data-page-scroller]').evaluate((scroller, nextTop) => {
    scroller.scrollTo({ top: nextTop, behavior: 'instant' });
  }, top);
}

test('every zone opts into the hardware band', async ({ page }) => {
  for (const path of ['/blog', '/blog/demo-effects', '/', '/mood']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const content = await page.getAttribute('meta[name="viewport"]', 'content');
    expect(content, `${path} must declare cover`).toContain('viewport-fit=cover');
  }
});

test('no fixed layer at the screen top is fully opaque', async ({ page }) => {
  await openDemoPost(page);
  await scrollPageTo(page, 800);

  const opaque = await page.evaluate(() => {
    // Chromium serialises a fully opaque colour as rgb(), anything else as rgba().
    const alpha = (color: string) => {
      const match = color.match(/^rgba?\(([^)]+)\)$/);
      if (!match) return 1;
      const parts = match[1].split(',').map((part) => part.trim());
      return parts.length < 4 ? 1 : Number.parseFloat(parts[3]);
    };
    const found: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[class*="blog-"], [class*="toc-"]'))) {
      const style = getComputedStyle(el);
      if (style.position !== 'fixed') continue;
      // Only layers that must reach the physical top are at risk.
      if (Number.parseFloat(style.top) !== 0) continue;
      if (alpha(style.backgroundColor) >= 1) found.push(el.className);
      if (alpha(getComputedStyle(el, '::before').backgroundColor) >= 1) {
        found.push(`${el.className}::before`);
      }
    }
    return found;
  });

  expect(opaque, 'Safari 26 clips opaque fixed layers to the visual viewport').toEqual([]);
});

test('contained scroll keeps the reading chrome at the viewport origin', async ({ page }) => {
  await openDemoPost(page);
  await scrollPageTo(page, 800);

  const geometry = await page.locator('.toc-topbar').evaluate((bar) => {
    const scroller = document.querySelector<HTMLElement>('[data-page-scroller]');
    const row = bar.querySelector<HTMLElement>('.toc-topbar__bar');
    const fade = bar.querySelector<HTMLElement>('.toc-topbar__fade');
    if (!scroller || !row || !fade) return null;

    const barStyle = getComputedStyle(bar);
    const barRect = bar.getBoundingClientRect();
    const fadeRect = fade.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();

    return {
      barTop: barRect.top,
      fadeTop: fadeRect.top,
      marginTop: barStyle.marginTop,
      position: barStyle.position,
      rowTop: rowRect.top,
      rootOverflow: getComputedStyle(document.documentElement).overflowY,
      rootScrollTop: window.scrollY,
      scrollerBottom: scrollerRect.bottom,
      scrollerOverflow: getComputedStyle(scroller).overflowY,
      scrollerScrollTop: scroller.scrollTop,
      scrollerTop: scrollerRect.top,
      top: barStyle.top,
      transform: barStyle.transform,
      viewportHeight: window.innerHeight,
    };
  });

  expect(geometry).not.toBeNull();

  // The bar and scrolling layer share the viewport origin. The root never moves,
  // so Safari never opens the unmeasurable band above them.
  expect(geometry!.position).toBe('fixed');
  expect(geometry!.top).toBe('0px');
  expect(geometry!.marginTop).toBe('0px');
  expect(geometry!.transform).toBe('none');
  expect(geometry!.barTop).toBeCloseTo(0, 0);
  expect(geometry!.fadeTop).toBeCloseTo(0, 0);
  expect(geometry!.rowTop).toBeCloseTo(0, 0);
  expect(geometry!.rootOverflow).toBe('hidden');
  expect(geometry!.rootScrollTop).toBe(0);
  expect(geometry!.scrollerOverflow).toBe('auto');
  expect(geometry!.scrollerScrollTop).toBeGreaterThan(0);
  expect(geometry!.scrollerTop).toBe(0);
  expect(geometry!.scrollerBottom).toBe(geometry!.viewportHeight);
});

test('the reading bar keeps its progressive blur', async ({ page }) => {
  await openDemoPost(page);
  await scrollPageTo(page, 800);

  const fade = await page.locator('.toc-topbar__fade').evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      backgroundImage: style.backgroundImage,
      bottom: el.getBoundingClientRect().bottom,
      filter: style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter'),
      mask: style.maskImage || style.getPropertyValue('-webkit-mask-image'),
    };
  });
  const rowBottom = await page
    .locator('.toc-topbar__bar')
    .evaluate((el) => el.getBoundingClientRect().bottom);

  // One backdrop pass, a multi-stop mask ramp, and a feathered tail trailing the
  // row — the surface has a top edge (the screen) and no bottom edge.
  expect(fade.filter).toContain('blur(22px)');
  expect(fade.mask).toContain('linear-gradient');
  expect(fade.mask.match(/rgba?\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  expect(fade.bottom - rowBottom).toBeCloseTo(40, 0);
  // The near-solid plateau tracks the row rather than a fixed 52px, so a phone
  // does not get a soft wash exactly where the title sits.
  expect(fade.backgroundImage).toContain('gradient');
});

test('opening the reading menu grows the glass without moving the article', async ({ page }) => {
  await openDemoPost(page);
  await scrollPageTo(page, 800);

  const read = () =>
    page.evaluate(() => ({
      fadeHeight: document
        .querySelector<HTMLElement>('.toc-topbar__fade')!
        .getBoundingClientRect().height,
      scrollY: document.querySelector<HTMLElement>('[data-page-scroller]')!.scrollTop,
      shellTop: document.querySelector<HTMLElement>('.blog-shell')!.getBoundingClientRect().top,
    }));

  const before = await read();
  await page.locator('.toc-topbar__title').click();
  await expect.poll(async () => (await read()).fadeHeight).toBeGreaterThan(before.fadeHeight);
  const after = await read();

  // The article never moves; the surface extends downward so the menu reads as
  // the bar growing, not a card landing on it.
  expect(after.shellTop).toBe(before.shellTop);
  expect(after.scrollY).toBe(before.scrollY);
  expect(after.fadeHeight).toBeGreaterThan(before.fadeHeight);
});

test('legacy safe-area variables cannot shift the contained reading column', async ({ page }) => {
  await openDemoPost(page);

  const base = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.blog-shell')!;
    const totop = document.querySelector<HTMLElement>('.blog-totop');
    const lightbox = document.querySelector<HTMLElement>('.blog-lightbox');
    return {
      lightboxPadTop: lightbox ? getComputedStyle(lightbox).paddingTop : null,
      shellPadTop: getComputedStyle(shell).paddingTop,
      totopBottom: totop ? getComputedStyle(totop).bottom : null,
    };
  });

  // Chromium resolves every env() to 0, so these are the inset-free baselines.
  expect(base.shellPadTop).toBe('40px');
  if (base.totopBottom !== null) expect(base.totopBottom).toBe('24px');
  // 5vmin of a 390x844 viewport.
  if (base.lightboxPadTop !== null) expect(base.lightboxPadTop).toBe('19.5px');

  // The contained-scroll strategy does not chase Safari's unreadable band with
  // a synthetic offset; reintroducing that old variable must not move content.
  const shellPadTop = await page.evaluate((inset) => {
    document.body.style.setProperty('--blog-top-safe-area', `${inset}px`);
    return getComputedStyle(document.querySelector<HTMLElement>('.blog-shell')!).paddingTop;
  }, FAKE_INSET);
  expect(shellPadTop).toBe('40px');
});

test('the blog path never reads the pinch-zoom viewport signal', async ({ page }) => {
  await openDemoPost(page);

  const offenders = await page.evaluate(() => {
    const found: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSStyleRule)) continue;
        if (!/^\.(blog-|toc-)/.test(rule.selectorText)) continue;
        // --visual-viewport-top is a pinch-zoom signal that stays 0 on iOS. It
        // belongs to the site nav; in this path it means someone is chasing the
        // band with JS again instead of covering it in CSS.
        if (rule.cssText.includes('--visual-viewport-top')) found.push(rule.selectorText);
      }
    }
    return found;
  });

  expect(offenders).toEqual([]);
});
