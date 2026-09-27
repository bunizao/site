import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '../..');

function readText(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('home hero cards', () => {
  test('warms only the hovered link\'s own card, not every fetch card', () => {
    const heroCards = readText('src/features/home/ui/HeroCards.astro');

    // The old blanket warm() that fired all three fetches on any bio-link
    // hover must be gone.
    expect(heroCards).not.toMatch(/const warm = \(\): void => \{\s*void loadMoods\(\);\s*void loadGitHub\(\);\s*void loadInstagram\(\);/);

    expect(heroCards).toContain('const warm = (id: string | undefined): void => {');
    expect(heroCards).toContain("if (id === 'moods') void loadMoods();");
    expect(heroCards).toContain("else if (id === 'github') void loadGitHub();");
    expect(heroCards).toContain("else if (id === 'instagram') void loadInstagram();");

    // Every call site — pointer hover, keyboard focus, and touch tap — passes
    // the hovered/focused/tapped link's own card id, so hover cards still
    // work by tap.
    const warmCallSites = heroCards.match(/warm\(link\.dataset\.card\)/g) ?? [];
    expect(warmCallSites.length).toBe(3);
    expect(heroCards).not.toMatch(/[^.]warm\(\)/);
  });

  test('defers the Monash portrait and GitHub avatar until their card opens', () => {
    const heroCards = readText('src/features/home/ui/HeroCards.astro');

    // No eager src/srcset in the server-rendered markup.
    expect(heroCards).not.toContain('src="/badge/portrait-256.webp"');
    expect(heroCards).not.toContain('src="/avatar.webp"');
    expect(heroCards).toContain('class="mo-portrait"\n            data-mo-portrait');
    expect(heroCards).toContain('class="hc-avatar" data-gh-avatar');

    // Revealed once, from open(), keyed by the card's own id — the same tap
    // path that opens a card on touch also reveals its image.
    expect(heroCards).toContain('const revealCardImage = (card: HTMLElement, id: string | undefined): void => {');
    expect(heroCards).toContain("'[data-mo-portrait]',");
    expect(heroCards).toContain("revealImage(card, '[data-gh-avatar]', '/avatar.webp');");
    expect(heroCards).toContain('revealCardImage(card, link.dataset.card);');
  });

  test('pauses the hero ambient CSS once it scrolls offscreen', () => {
    const hero = readText('src/features/home/ui/Hero.astro');

    // animation-play-state only, resumable with no state of its own.
    expect(hero).toContain('.hero-section.is-offscreen :global(.marquee-track),');
    expect(hero).toContain('.hero-section.is-offscreen :global(.typewriter-caret),');
    expect(hero).toContain('.hero-section.is-offscreen .status-dot {');
    expect(hero).toContain('animation-play-state: paused;');
    expect(hero).not.toContain('content-visibility');

    // One IntersectionObserver on the hero section itself.
    expect(hero).toContain("document.querySelector<HTMLElement>('[data-hero]')");
    expect(hero).toContain('new IntersectionObserver(([entry]) => {');
    expect(hero).toContain("heroSection.classList.toggle('is-offscreen', !entry.isIntersecting);");
  });
});
