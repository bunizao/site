import { expect, test } from '@playwright/test';

// iOS 26 can paint root-scrolling content above the layout viewport when its
// dynamic toolbar collapses, while every CSS safe-area signal still reads 0.
// Mood and Docs close that band at the source: the root stays locked and a
// full-viewport inner element owns scrolling. The blog scrolls the root
// (2026-09-25): locked, its toolbar never collapsed and the strip under it was
// a flat slab nothing could paint into. Instead its reading bar hands Safari a
// colour for the band. Chromium cannot reproduce the physical band, so these
// tests guard structure.

const PHONE = { width: 390, height: 844 };
const FAKE_INSET = 59; // iPhone 16 Pro portrait status-bar band.
const DOCS_ARTICLE = '/docs/surfaces/comments';

async function openDemoPost(page: import('@playwright/test').Page) {
  await page.setViewportSize(PHONE);
  await page.goto('/blog/demo-effects', { waitUntil: 'networkidle' });
}

async function scrollPageTo(page: import('@playwright/test').Page, top: number) {
  await page.evaluate((nextTop) => window.scrollTo({ top: nextTop, behavior: 'instant' }), top);
}

test('every zone opts into the hardware band', async ({ page }) => {
  for (const path of ['/blog', '/blog/demo-effects', '/', '/mood', '/docs', DOCS_ARTICLE]) {
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
      // The band strips are Safari's colour probe target, not a cover for the
      // band; being clipped to the viewport is fine for them.
      if (el.classList.contains('toc-topbar__band')) continue;
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

// Safari 26 colours the status-bar band from a hit test about 8px inside the
// top edge: fixed and sticky layers only, first plain background-color up to
// the fixed ancestor. The bar's controls sit over the same point, so this
// checks what the probe actually lands on.
test('the reading bar gives Safari an opaque colour at the top-edge probe', async ({ page }) => {
  await openDemoPost(page);
  await scrollPageTo(page, 800);
  await expect(page.locator('.toc-topbar')).toHaveClass(/is-visible/);

  const probe = await page.evaluate(() => {
    const hit = document.elementFromPoint(window.innerWidth / 2, 8);
    return {
      className: hit?.className ?? null,
      background: hit ? getComputedStyle(hit).backgroundColor : null,
    };
  });

  expect(probe.className).toBe('toc-topbar__band toc-topbar__band--light');
  expect(probe.background).toMatch(/^rgb\(/);

  await scrollPageTo(page, 0);
  await expect(page.locator('.toc-topbar')).not.toHaveClass(/is-visible/);
  const atTop = await page.evaluate(() => document.elementFromPoint(window.innerWidth / 2, 8)?.className ?? null);
  expect(atTop).not.toContain('toc-topbar__band');
});

test('the blog scrolls the root and keeps the reading chrome at the viewport origin', async ({ page }) => {
  await openDemoPost(page);
  await scrollPageTo(page, 800);

  const geometry = await page.locator('.toc-topbar').evaluate((bar) => {
    const row = bar.querySelector<HTMLElement>('.toc-topbar__bar');
    const fade = bar.querySelector<HTMLElement>('.toc-topbar__fade');
    if (!row || !fade) return null;

    const barStyle = getComputedStyle(bar);
    const barRect = bar.getBoundingClientRect();
    const fadeRect = fade.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();

    return {
      barTop: barRect.top,
      fadeTop: fadeRect.top,
      marginTop: barStyle.marginTop,
      position: barStyle.position,
      rowTop: rowRect.top,
      containedScroller: document.querySelector('[data-page-scroller]') !== null,
      rootOverflow: getComputedStyle(document.documentElement).overflowY,
      rootScrollTop: window.scrollY,
      top: barStyle.top,
      transform: barStyle.transform,
    };
  });

  expect(geometry).not.toBeNull();

  // The document scrolls, so Safari can collapse its toolbar; the bar stays a
  // fixed lid at the viewport origin.
  expect(geometry!.position).toBe('fixed');
  expect(geometry!.top).toBe('0px');
  expect(geometry!.marginTop).toBe('0px');
  expect(geometry!.transform).toBe('none');
  expect(geometry!.barTop).toBeCloseTo(0, 0);
  expect(geometry!.fadeTop).toBeCloseTo(0, 0);
  expect(geometry!.rowTop).toBeCloseTo(0, 0);
  expect(geometry!.containedScroller).toBe(false);
  expect(geometry!.rootOverflow).not.toBe('hidden');
  expect(geometry!.rootScrollTop).toBeGreaterThan(0);
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
      scrollY: window.scrollY,
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

test('legacy safe-area variables cannot shift the reading column', async ({ page }) => {
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

  // The blog does not chase Safari's unreadable band with a synthetic offset;
  // reintroducing that old variable must not move content.
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


// Docs carry a full-width opaque bar pinned to the top of a long reference page,
// which is the exact shape that drifts when the root scroller moves. They were
// built after Blog and Mood were contained and inherited neither the containment
// nor the ban on chasing the band with JS.
test('docs contain their scroll instead of moving the root', async ({ page }) => {
  for (const path of ['/docs', DOCS_ARTICLE]) {
    await page.setViewportSize(PHONE);
    await page.goto(path, { waitUntil: 'networkidle' });

    const geometry = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[data-page-scroller]');
      const bar = document.querySelector<HTMLElement>('.site-nav--docs');
      if (!scroller || !bar) return null;
      scroller.scrollTo({ top: 600, behavior: 'instant' });
      const barStyle = getComputedStyle(bar);
      return {
        barPosition: barStyle.position,
        barTop: bar.getBoundingClientRect().top,
        barTransform: barStyle.transform,
        rootOverflow: getComputedStyle(document.documentElement).overflowY,
        rootScrollTop: window.scrollY,
        scrollerOverflow: getComputedStyle(scroller).overflowY,
        scrollerScrollTop: scroller.scrollTop,
      };
    });

    expect(geometry, `${path} must render a contained scroller and a docs bar`).not.toBeNull();
    expect(geometry!.rootOverflow).toBe('hidden');
    expect(geometry!.rootScrollTop).toBe(0);
    expect(geometry!.scrollerOverflow).toBe('auto');
    expect(geometry!.scrollerScrollTop).toBeGreaterThan(0);
    // The bar sits outside the scrolling layer, so scrolling never moves it.
    expect(geometry!.barPosition).toBe('fixed');
    expect(geometry!.barTransform).toBe('none');
    expect(geometry!.barTop).toBeCloseTo(0, 0);
  }
});

test('the pinch-zoom viewport signal cannot move the docs bar', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(DOCS_ARTICLE, { waitUntil: 'networkidle' });

  const read = () =>
    page.evaluate(() => ({
      actionsTop: document
        .querySelector<HTMLElement>('.global-header-actions')!
        .getBoundingClientRect().top,
      barTop: document.querySelector<HTMLElement>('.site-nav--docs')!.getBoundingClientRect().top,
      shellPadTop: getComputedStyle(document.querySelector<HTMLElement>('.site-shell')!).paddingTop,
    }));

  const before = await read();
  // The docs bar used to consume --site-nav-mobile-top, which adds this token.
  // It reads 0 through an entire iOS scroll, so it never corrected the drift it
  // was there for — and when it is non-zero it shoves the bar down by a
  // toolbar's height. Contained scroll removes the drift at the source, so no
  // docs chrome may chase the band any more, directly or through that alias.
  const after = await page.evaluate((inset) => {
    document.documentElement.style.setProperty('--visual-viewport-top', `${inset}px`);
    return {
      actionsTop: document
        .querySelector<HTMLElement>('.global-header-actions')!
        .getBoundingClientRect().top,
      barTop: document.querySelector<HTMLElement>('.site-nav--docs')!.getBoundingClientRect().top,
      shellPadTop: getComputedStyle(document.querySelector<HTMLElement>('.site-shell')!).paddingTop,
    };
  }, FAKE_INSET);

  expect(after.barTop).toBe(before.barTop);
  expect(after.actionsTop).toBe(before.actionsTop);
  expect(after.shellPadTop).toBe(before.shellPadTop);
});
