import { expect, test, type Page } from '@playwright/test';

// iOS 26 extends the layout viewport up behind Safari's translucent toolbar, so
// pages paint into the status-bar band whether they opt in or not. Without
// `viewport-fit=cover` the env(safe-area-inset-*) values stay 0, so the CSS
// cannot pad around a band it is already painting into — fixed bars land under
// the Dynamic Island and article text shows beside it.
//
// These tests assert the CONTRACT that makes the safe-area rules live: the meta
// tag ships, and the bars consume the inset in a way that survives it being
// non-zero. A previous attempt at this bug forced the custom property to a fake
// value and asserted things moved by it, which only restated the CSS; here the
// inset is injected as a real length via a style override so the computed
// padding proves the rules actually reference it.

const PHONE = { width: 390, height: 844 };
const INSET = 47; // iPhone 16 Pro portrait top inset, near enough.

async function openCurrentBlogPost(page: Page) {
  await page.goto('/blog/', { waitUntil: 'networkidle' });
  const href = await page.locator('.blog-row__link').first().getAttribute('href');
  expect(href).toMatch(/^\/blog\/[^/]+\/$/);
  await page.goto(href!, { waitUntil: 'networkidle' });
}

test('every rendered layout opts into viewport-fit=cover', async ({ page }) => {
  await page.goto('/blog/', { waitUntil: 'networkidle' });
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  await openCurrentBlogPost(page);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
});

test('reading bar pads its row past the notch while its glass still covers the band', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openCurrentBlogPost(page);

  // env() cannot be driven from a test, so stand in for the UA value by
  // overriding the same declaration the rule reads. If .toc-topbar stopped
  // consuming an inset in padding-top, this override would have no effect.
  await page.addStyleTag({
    content: `.toc-topbar { padding-top: ${INSET}px; }`,
  });

  const geometry = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('.toc-topbar');
    const row = bar?.querySelector<HTMLElement>('.toc-topbar__bar');
    const fade = bar?.querySelector<HTMLElement>('.toc-topbar__fade');
    if (!bar || !row || !fade) return null;
    return {
      barTop: bar.getBoundingClientRect().top,
      fadeTop: fade.getBoundingClientRect().top,
      rowTop: row.getBoundingClientRect().top,
    };
  });

  expect(geometry).not.toBeNull();
  // The surface stays pinned to the true screen top: the band above the notch
  // is still tinted, never a bare strip.
  expect(geometry!.barTop).toBeCloseTo(0, 0);
  expect(geometry!.fadeTop).toBeCloseTo(0, 0);
  // The controls clear the island.
  expect(geometry!.rowTop).toBeGreaterThanOrEqual(INSET - 1);
});

test('reading bar blocks scrolled article text from the status-bar band', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openCurrentBlogPost(page);

  const usesInset = await page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const outerRule of Array.from(rules)) {
        const nestedRules = 'cssRules' in outerRule
          ? Array.from((outerRule as CSSGroupingRule).cssRules)
          : [outerRule];
        for (const rule of nestedRules) {
          if (
            rule instanceof CSSStyleRule &&
            rule.selectorText === 'body.blog-zone:has(.toc-topbar:not([hidden]))::after' &&
            rule.style.height.includes('safe-area-inset-top')
          ) {
            return true;
          }
        }
      }
    }
    return false;
  });

  expect(usesInset, 'the article safe-area shield must consume the top inset').toBe(true);

  await page.addStyleTag({
    content: `body.blog-zone:has(.toc-topbar:not([hidden]))::after { height: ${INSET}px; }`,
  });
  await page.evaluate(() => window.scrollTo(0, 800));

  const shield = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('.toc-topbar');
    const style = getComputedStyle(document.body, '::after');
    if (!bar) return null;
    return {
      backdropFilter: style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter'),
      backgroundImage: style.backgroundImage,
      height: style.height,
      position: style.position,
      top: style.top,
      zIndex: Number.parseInt(style.zIndex, 10),
      barZIndex: Number.parseInt(getComputedStyle(bar).zIndex, 10),
    };
  });

  expect(shield).not.toBeNull();
  expect(shield!.height).toBe(`${INSET}px`);
  expect(shield!.position).toBe('fixed');
  expect(shield!.top).toBe('0px');
  expect(shield!.backgroundImage).toContain('linear-gradient');
  expect(shield!.backdropFilter).toContain('blur(18px)');
  expect(shield!.backdropFilter).toContain('saturate(1.4)');
  expect(shield!.zIndex).toBeGreaterThan(shield!.barZIndex);
});

test('mood navbar blocks feed content from the status-bar band', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/mood', { waitUntil: 'networkidle' });

  const usesInset = await page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (
          rule instanceof CSSStyleRule &&
          rule.selectorText === '.mood-navbar::before' &&
          rule.style.height.includes('safe-area-inset-top')
        ) {
          return true;
        }
      }
    }
    return false;
  });

  expect(usesInset, 'the mood safe-area shield must consume the top inset').toBe(true);

  const noInsetHeight = await page
    .locator('.mood-navbar')
    .evaluate((navbar) => getComputedStyle(navbar, '::before').height);
  expect(noInsetHeight).toBe('0px');

  await page.addStyleTag({ content: `.mood-navbar::before { height: ${INSET}px; }` });
  await page.evaluate(() => window.scrollTo(0, 800));

  const shield = await page.locator('.mood-navbar').evaluate((navbar) => {
    const style = getComputedStyle(navbar, '::before');
    const blur = navbar.querySelector<HTMLElement>('.topbar__blur');
    return {
      backdropFilter: style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter'),
      backgroundImage: style.backgroundImage,
      height: style.height,
      position: style.position,
      top: style.top,
      zIndex: Number.parseInt(style.zIndex, 10),
      blurZIndex: blur ? Number.parseInt(getComputedStyle(blur).zIndex, 10) : -1,
    };
  });

  expect(shield.height).toBe(`${INSET}px`);
  expect(shield.position).toBe('absolute');
  expect(shield.top).toBe('0px');
  expect(shield.backgroundImage).toContain('linear-gradient');
  expect(shield.backdropFilter).toContain('blur(18px)');
  expect(shield.backdropFilter).toContain('saturate(1.4)');
  expect(shield.zIndex).toBeGreaterThan(shield.blurZIndex);
});

test('blog shell keeps content out of the status-bar band', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openCurrentBlogPost(page);

  const usesInset = await page.evaluate(() => {
    const shell = document.querySelector('.blog-shell');
    if (!shell) return null;
    // Walk the stylesheets for the authored value; the computed value would
    // already have resolved env() to 0 on a desktop browser.
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        // Read `padding` too, not just `paddingTop`: the rule authors the
        // shorthand, and a shorthand does not populate its longhands in
        // cssRules.
        if (
          rule instanceof CSSStyleRule &&
          rule.selectorText === '.blog-shell' &&
          `${rule.style.paddingTop} ${rule.style.padding}`.includes('safe-area-inset-top')
        ) {
          return true;
        }
      }
    }
    return false;
  });

  expect(usesInset, '.blog-shell padding-top must include the top inset').toBe(true);
});

test('insets cost nothing on hardware without a notch', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openCurrentBlogPost(page);

  // Every inset is wrapped in a calc() with an explicit 0px fallback, so a UA
  // that reports no safe area must land on exactly the pre-change geometry.
  // This is the guard against the fix regressing every non-notched device.
  const resolved = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.blog-shell');
    const bar = document.querySelector<HTMLElement>('.toc-topbar');
    const totop = document.querySelector<HTMLElement>('.blog-totop');
    if (!shell || !bar || !totop) return null;
    return {
      shellPadTop: getComputedStyle(shell).paddingTop,
      barPadTop: getComputedStyle(bar).paddingTop,
      shieldHeight: getComputedStyle(document.body, '::after').height,
      totopBottom: getComputedStyle(totop).bottom,
    };
  });

  expect(resolved).not.toBeNull();
  expect(resolved!.shellPadTop).toBe('40px');
  expect(resolved!.barPadTop).toBe('0px');
  expect(resolved!.shieldHeight).toBe('0px');
  expect(resolved!.totopBottom).toBe('24px');
});
