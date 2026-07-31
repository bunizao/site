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
        writingEnter: read('#writing-section .writing-enter'),
        moodEnter: read('#moods-section .mood-enter'),
      };
    });

    expect(timing.portal).toEqual({ duration: '0.5s', delay: '0.5s' });
    expect(timing.writingEnter).toEqual({ duration: '0.4s', delay: '1.22s' });
    expect(timing.moodEnter).toEqual({ duration: '0.4s', delay: '1s' });
  });

  test('reinitializes parallax across page lifecycles', async ({ page }) => {
    await page.goto('/');

    const expectDrift = async (top: number) => {
      await page.evaluate((nextTop) => {
        window.scrollTo({ top: nextTop, behavior: 'instant' });
        window.dispatchEvent(new Event('scroll'));
      }, top);
      await expect.poll(() => page.evaluate(() => {
        const sections = Array.from(
          document.querySelectorAll<HTMLElement>('#parallax-container section:not(#projects-section)'),
        );
        const section = document.querySelector<HTMLElement>('#experience-section');
        if (!section) return Number.POSITIVE_INFINITY;
        const index = sections.indexOf(section);
        const value = section.style.translate.split(/\s+/).at(-1) ?? '0';
        const actual = Number.parseFloat(value);
        const speed = 0.5 + (index % 3) * 0.2;
        return Math.abs(actual - window.scrollY * speed * 0.02);
      })).toBeLessThan(0.1);
    };

    await expectDrift(900);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('astro:before-swap')));
    await expect.poll(() =>
      page.locator('#experience-section').evaluate((section) => (section as HTMLElement).style.translate),
    ).toBe('');

    await page.evaluate(() => document.dispatchEvent(new CustomEvent('astro:page-load')));
    await expectDrift(1100);

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('astro:before-swap'));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await expectDrift(700);

    await page.reload();
    await expectDrift(1000);
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
