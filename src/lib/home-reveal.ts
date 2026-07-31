/**
 * Single owner for the homepage reveal chain.
 *
 * One IntersectionObserver, zero layout reads, zero scroll listeners. A section
 * opts in with `data-reveal`; its children stagger with `data-reveal-item` plus
 * a `--reveal-i` index. The observer only toggles a class — every pixel of
 * motion lives in home-reveal.css.
 *
 * Why not GSAP/ScrollTrigger, which this replaced: ScrollTrigger caches scroll
 * positions and re-reads layout, so any mid-scroll height change (content
 * visibility, async mood content, island hydration) left its trigger points
 * stale. Worse, GSAP tweens run on the main thread's rAF ticker — when the
 * thread stalled the tween froze at opacity 0 and the section stayed blank.
 * A CSS transition of opacity/transform runs on the compositor and finishes
 * regardless of what the main thread is doing.
 */

const REVEALED_CLASS = 'is-revealed';
const SETTLED_CLASS = 'is-settled';

/** Longest entrance a group can play: lead + last item's stagger + duration. */
const SETTLE_AFTER_MS = 1400;

/**
 * The stylesheet hides `[data-reveal]` only under `html.reveal-ready`, which an
 * inline script in index.astro sets before first paint (so the hidden state is
 * never painted visible first and then snapped away).
 *
 * That inline script also starts a failsafe: if this module has not claimed the
 * page shortly after, it drops `reveal-ready` and everything becomes visible.
 * So a chunk that 404s or fails to parse costs a delayed reveal, never a
 * permanently blank section — which is the failure this whole rewrite exists to
 * remove. Claiming the page is the first thing done below, before any work that
 * could throw.
 */
const ARM_CLASS = 'reveal-ready';

/** Reveal fires once per element and never reverses. */
export const initHomeReveal = (): void => {
  const root = document.documentElement;
  root.dataset.revealActive = 'true';

  const groups = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (groups.length === 0) {
    root.classList.remove(ARM_CLASS);
    return;
  }

  // Dropping the stagger once the entrance is done keeps it from delaying every
  // later transition on the same element (hover dimming, most visibly).
  const reveal = (group: Element, settleDelay: number) => {
    group.classList.add(REVEALED_CLASS);
    window.setTimeout(() => group.classList.add(SETTLED_CLASS), settleDelay);
  };

  const revealAll = () => {
    groups.forEach((group) => reveal(group, 0));
  };

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    revealAll();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        reveal(entry.target, SETTLE_AFTER_MS);
        observer.unobserve(entry.target);
      }
    },
    // Slightly inside the fold, so a section commits to its reveal only once
    // it is genuinely on screen rather than clipping the bottom edge.
    { rootMargin: '0px 0px -12% 0px' },
  );

  groups.forEach((group) => observer.observe(group));
};
