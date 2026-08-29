import { expect, test } from '@playwright/test';

async function openConversationPlayground(page: import('@playwright/test').Page) {
  await page.goto('/components/conversation#playground');
  await page.locator('#conv-source').waitFor();
}

async function setConversationContainerWidth(
  page: import('@playwright/test').Page,
  width: number,
): Promise<void> {
  const conversation = page.locator('#playground .conv');
  await conversation.evaluate((node, targetWidth) => {
    const preview = node.parentElement;
    if (!preview) throw new Error('conversation preview is missing');

    const previewWidth = preview.getBoundingClientRect().width;
    const conversationWidth = node.getBoundingClientRect().width;
    preview.style.width = `${targetWidth + previewWidth - conversationWidth}px`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const actualWidth = node.getBoundingClientRect().width;
      const currentWidth = parseFloat(preview.style.width);
      preview.style.width = `${currentWidth + targetWidth - actualWidth}px`;
    }
  }, width);
  await expect
    .poll(() => conversation.evaluate((node) => node.getBoundingClientRect().width))
    .toBeCloseTo(width, 1);
}

test.describe('component playgrounds', () => {
  test('conversation controls update a complete copyable source', async ({ page, context }) => {
    await openConversationPlayground(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const source = page.locator('#conv-source');
    await expect(source).toHaveValue(
      /^```conversation\n@conversation avatars=on names=on tints=on\n/,
    );

    await page.getByRole('switch', { name: 'Avatars' }).click();
    await expect(source).toHaveValue(
      /^```conversation\n@conversation avatars=off names=on tints=on\n/,
    );

    await page.getByRole('switch', { name: 'Names' }).click();
    await page.getByRole('switch', { name: 'Tints' }).click();
    await expect(source).toHaveValue(
      /^```conversation\n@conversation avatars=off names=off tints=off\n/,
    );
    await expect(page.locator('#playground .conv-thread')).toHaveAttribute('data-avatars', 'off');
    await expect(page.locator('#playground .conv-thread')).toHaveAttribute('data-names', 'off');
    await expect(page.locator('#playground .conv-thread')).toHaveAttribute('data-tints', 'off');

    await page.getByRole('button', { name: 'Copy complete conversation source' }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
      await source.inputValue(),
    );
  });

  test('conversation source survives a page reload', async ({ page }) => {
    await openConversationPlayground(page);

    const source = page.locator('#conv-source');
    const edited = '```conversation\n@conversation avatars=off names=on\nme: saved draft\n```';
    await source.fill(edited);
    await page.reload();
    await page.locator('#conv-source').waitFor();

    await expect(source).toHaveValue(edited);
    await expect(page.getByRole('switch', { name: 'Avatars' })).not.toBeChecked();
    await expect(page.getByText('saved draft', { exact: true })).toBeVisible();
  });

  test('conversation names align and speakers override thread options', async ({ page }) => {
    await openConversationPlayground(page);

    const source = page.locator('#conv-source');
    await source.fill(
      [
        '```conversation',
        '@conversation avatars=on names=on tints=off',
        '@gemini [Gemini] accent=#6E7FD8 tints=on',
        '@ada [Ada] accent=#6F8F9D',
        '@neutral [Neutral]',
        'you: compare',
        'gemini: tinted override',
        'ada: neutral default',
        'neutral: neutral baseline',
        '```',
      ].join('\n'),
    );

    const groups = page.locator('#playground .conv-group--in');
    await expect(groups.nth(0)).toHaveAttribute('data-tints', 'on');
    await expect(groups.nth(1)).toHaveAttribute('data-tints', 'off');

    const [geminiBackground, adaBackground, neutralBackground] = await Promise.all(
      [0, 1, 2].map((index) =>
        groups
          .nth(index)
          .locator('.conv-bubble')
          .evaluate((bubble) => getComputedStyle(bubble).backgroundColor),
      ),
    );
    expect(geminiBackground).not.toBe(neutralBackground);
    expect(adaBackground).toBe(neutralBackground);

    const offset = await groups.nth(0).evaluate((group) => {
      const name = group.querySelector('.conv-name');
      const body = group.querySelector('.conv-bubble > p');
      if (!name?.firstChild || !body) throw new Error('conversation text is missing');

      const range = document.createRange();
      range.selectNodeContents(name.firstChild);
      return Math.abs(range.getBoundingClientRect().left - body.getBoundingClientRect().left);
    });
    expect(offset).toBeLessThan(1);

    await source.fill(
      [
        '```conversation',
        '@conversation avatars=off names=off tints=off',
        '@gemini [Gemini] accent=#6E7FD8 avatars=on names=on tints=on',
        '@ada [Ada] accent=#6F8F9D',
        'you: compare',
        'gemini: overridden',
        'ada: inherited',
        '```',
      ].join('\n'),
    );

    const overridden = page.locator('#playground .conv-group--in').nth(0);
    const inherited = page.locator('#playground .conv-group--in').nth(1);
    await expect(overridden).toHaveAttribute('data-avatars', 'on');
    await expect(overridden).toHaveAttribute('data-names', 'on');
    await expect(overridden).toHaveAttribute('data-tints', 'on');
    await expect(overridden.locator('.conv-avatar')).toHaveCSS('visibility', 'visible');
    await expect(overridden.locator('.conv-name')).toHaveCSS('position', 'static');

    await expect(inherited).toHaveAttribute('data-avatars', 'off');
    await expect(inherited).toHaveAttribute('data-names', 'off');
    await expect(inherited).toHaveAttribute('data-tints', 'off');
    await expect(inherited.locator('.conv-avatar')).toHaveCSS('visibility', 'hidden');
    await expect(inherited.locator('.conv-name')).toHaveCSS('position', 'absolute');
  });

  test('a wrapped bubble hugs its widest line', async ({ page }) => {
    await openConversationPlayground(page);

    // A message that has to wrap, and whose last two characters cannot be split
    // apart — 「？」 may not begin a line, so 「吗？」 moves down whole and leaves
    // the widest line well short of the cap. That leftover is what the fit pass
    // gives back; without it the bubble sits at max-width with dead space
    // inside its right border.
    await page.locator('#conv-source').fill(
      [
        '```conversation',
        '@ada [Ada]',
        'ada: 标签太概括化了，但现实中的人永远比标签复杂得多，别人给你贴过什么让你觉得不准确的标签吗？',
        '```',
      ].join('\n'),
    );

    const bubble = page.locator('#playground .conv-bubble').first();
    const geometry = () =>
      bubble.evaluate((node) => {
        const body = node.querySelector('p');
        if (!body) throw new Error('conversation text is missing');
        const range = document.createRange();
        range.selectNodeContents(body);
        const rects = [...range.getClientRects()];
        const box = node.getBoundingClientRect();
        return {
          lines: rects.length,
          padding: parseFloat(getComputedStyle(node).paddingLeft),
          gap: box.right - Math.max(...rects.map((rect) => rect.right)),
        };
      });

    await expect.poll(async () => (await geometry()).lines).toBeGreaterThan(1);
    // The pass runs off a ResizeObserver, so poll rather than read once.
    await expect
      .poll(async () => {
        const { padding, gap } = await geometry();
        return Math.abs(gap - padding);
      })
      .toBeLessThan(1.5);
  });

  test('conversation gutters switch strictly below 520px', async ({ page }) => {
    await openConversationPlayground(page);
    await page.locator('#conv-source').fill(
      [
        '```conversation',
        '@conversation avatars=on names=on tints=on',
        '@ada [Ada]',
        'you: outgoing edge',
        'ada: incoming edge',
        '```',
      ].join('\n'),
    );

    const geometry = () => page.locator('#playground .conv-thread').evaluate((thread) => {
      const threadRect = thread.getBoundingClientRect();
      const incoming = thread.querySelector('.conv-group--in');
      const outgoing = thread.querySelector('.conv-group--out');
      const incomingBubble = incoming?.querySelector('.conv-bubble');
      const outgoingBubble = outgoing?.querySelector('.conv-bubble');
      const incomingAvatar = incoming?.querySelector('.conv-avatar');
      const outgoingAvatar = outgoing?.querySelector('.conv-avatar');
      if (!incomingBubble || !outgoingBubble || !incomingAvatar || !outgoingAvatar) {
        throw new Error('conversation geometry is incomplete');
      }

      const incomingBubbleRect = incomingBubble.getBoundingClientRect();
      const outgoingBubbleRect = outgoingBubble.getBoundingClientRect();
      const incomingAvatarStyle = getComputedStyle(incomingAvatar);
      const outgoingAvatarStyle = getComputedStyle(outgoingAvatar);
      return {
        avatarToken: getComputedStyle(thread).getPropertyValue('--conv-avatar').trim(),
        incomingAvatarDisplay: incomingAvatarStyle.display,
        incomingAvatarWidth: incomingAvatar.getBoundingClientRect().width,
        incomingEdge: incomingBubbleRect.left - threadRect.left,
        outgoingAvatarDisplay: outgoingAvatarStyle.display,
        outgoingAvatarWidth: outgoingAvatar.getBoundingClientRect().width,
        outgoingEdge: threadRect.right - outgoingBubbleRect.right,
      };
    });

    await setConversationContainerWidth(page, 519);
    const below = await geometry();
    expect(below.avatarToken).toBe('28px');
    expect(below.incomingAvatarDisplay).not.toBe('none');
    expect(below.incomingAvatarWidth).toBeCloseTo(28, 1);
    expect(below.incomingEdge).toBeCloseTo(40, 1);
    expect(below.outgoingAvatarDisplay).toBe('none');
    expect(below.outgoingAvatarWidth).toBe(0);
    expect(below.outgoingEdge).toBeCloseTo(0, 1);

    for (const width of [520, 521]) {
      await setConversationContainerWidth(page, width);
      const wide = await geometry();
      expect(wide.avatarToken).toBe('34px');
      expect(wide.incomingAvatarDisplay).not.toBe('none');
      expect(wide.incomingAvatarWidth).toBeCloseTo(34, 1);
      expect(wide.incomingEdge).toBeCloseTo(46, 1);
      expect(wide.outgoingAvatarDisplay).not.toBe('none');
      expect(wide.outgoingAvatarWidth).toBeCloseTo(34, 1);
      expect(wide.outgoingEdge).toBeCloseTo(46, 1);
    }
  });

  test('avatars off removes both narrow gutters', async ({ page }) => {
    await openConversationPlayground(page);
    await page.locator('#conv-source').fill(
      [
        '```conversation',
        '@conversation avatars=off names=on tints=on',
        '@ada [Ada]',
        'you: outgoing edge',
        'ada: incoming edge',
        '```',
      ].join('\n'),
    );
    await setConversationContainerWidth(page, 519);

    const edges = await page.locator('#playground .conv-thread').evaluate((thread) => {
      const threadRect = thread.getBoundingClientRect();
      const incoming = thread.querySelector('.conv-group--in');
      const outgoing = thread.querySelector('.conv-group--out');
      const incomingBubble = incoming?.querySelector('.conv-bubble');
      const outgoingBubble = outgoing?.querySelector('.conv-bubble');
      const avatars = [...thread.querySelectorAll('.conv-avatar')];
      if (!incomingBubble || !outgoingBubble || avatars.length !== 2) {
        throw new Error('conversation geometry is incomplete');
      }

      return {
        avatarDisplays: avatars.map((avatar) => getComputedStyle(avatar).display),
        incoming: incomingBubble.getBoundingClientRect().left - threadRect.left,
        outgoing: threadRect.right - outgoingBubble.getBoundingClientRect().right,
      };
    });
    expect(edges.avatarDisplays).toEqual(['none', 'none']);
    expect(edges.incoming).toBeCloseTo(0, 1);
    expect(edges.outgoing).toBeCloseTo(0, 1);
  });

  test('pages with playgrounds expose a colored link beside the introduction', async ({ page }) => {
    await page.goto('/components/decode-text');
    await expect(page.locator('.detail-playground-link')).toHaveAttribute('href', '#playground');
    await expect(page.locator('.detail-playground-link')).toHaveCSS('color', 'rgb(168, 79, 44)');

    await page.goto('/components/conversation');
    await expect(page.locator('.detail-playground-link')).toHaveAttribute('href', '#playground');

    await page.goto('/docs/writing/conversation');
    await expect(page.locator('.docs-playground-link')).toHaveAttribute(
      'href',
      '/components/conversation#playground',
    );
    await expect(page.locator('.docs-playground-link')).toHaveCSS('color', 'rgb(168, 79, 44)');
  });

  test('playground controls keep keyboard focus and minimum target sizes', async ({ page }) => {
    await openConversationPlayground(page);

    const avatarSwitch = page.getByRole('switch', { name: 'Avatars' });
    const copyButton = page.getByRole('button', { name: 'Copy complete conversation source' });

    await avatarSwitch.focus();
    await expect(avatarSwitch).toBeFocused();
    await expect
      .poll(() => avatarSwitch.evaluate((node) => getComputedStyle(node).boxShadow))
      .not.toBe('none');
    await avatarSwitch.press('Space');
    await expect(avatarSwitch).not.toBeChecked();

    for (const target of [avatarSwitch, copyButton]) {
      const size = await target.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      expect(size.width).toBeGreaterThanOrEqual(24);
      expect(size.height).toBeGreaterThanOrEqual(24);
    }
  });
});
