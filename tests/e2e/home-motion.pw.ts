import { expect, test } from './fixtures';

test.describe('Home motion', () => {
  test('composes native parallax with the section reveal', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo({ top: 1000, behavior: 'instant' }));
    await expect.poll(() =>
      page.locator('#experience-section').evaluate((section) => {
        const value = (section as HTMLElement).style.translate.split(/\s+/).at(-1) ?? '0';
        return Number.parseFloat(value);
      }),
    ).toBeGreaterThan(0);

    const translations = await page.locator('.page-container > section').evaluateAll((sections) =>
      Object.fromEntries(sections.map((section) => [section.id, (section as HTMLElement).style.translate])),
    );

    expect(translations['projects-section']).toBe('');
    expect(Number.parseFloat(translations['experience-section'].split(/\s+/).at(-1) ?? '0')).toBeGreaterThan(0);
    expect(Number.parseFloat(translations['writing-section'].split(/\s+/).at(-1) ?? '0')).toBeGreaterThan(0);
  });

  test('keeps reveal timing ahead of local interactions', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      for (const id of ['writing-section', 'moods-section']) {
        document.getElementById(id)?.classList.remove('is-revealed', 'is-settled');
      }
      document.documentElement.classList.add('reveal-ready');
    });

    const timing = await page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        const style = element ? getComputedStyle(element) : null;
        return {
          duration: style?.transitionDuration.split(',')[0]?.trim() ?? '',
          delay: style?.transitionDelay.split(',')[0]?.trim() ?? '',
        };
      };
      return {
        portal: read('#writing-section .writing-portal'),
        writingEnter: read('#writing-section .section-enter'),
        moodEnter: read('#moods-section .section-enter'),
      };
    });

    expect(timing.portal).toEqual({ duration: '0.5s', delay: '0.5s' });
    // The exit links sit in the section head and arrive just after the label,
    // on the same clock in every section.
    expect(timing.writingEnter).toEqual({ duration: '0.4s', delay: '0.36s' });
    expect(timing.moodEnter).toEqual({ duration: '0.4s', delay: '0.36s' });
  });

  test('disables parallax when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('#writing-section').scrollIntoViewIfNeeded();

    await expect.poll(() =>
      page.locator('#experience-section').evaluate((section) => (section as HTMLElement).style.translate),
    ).toBe('');
  });
});
