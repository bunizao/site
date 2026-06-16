/**
 * Reusable hydration for Telegram Bot API rich text entities that need
 * interaction: click-to-reveal spoilers and expand/collapse blockquotes.
 *
 * Styling lives in feed-rich-text.css (loaded on every mood surface), so the
 * privacy default (blurred spoiler, clamped quote) holds even without JS. This
 * only adds the reveal/expand affordances. Idempotent — safe to call on the
 * same root repeatedly as content streams in.
 */

function hydrateSpoilers(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.tg-spoiler:not([data-spoiler-ready])').forEach((spoiler) => {
    spoiler.dataset.spoilerReady = 'true';
    spoiler.setAttribute('role', 'button');
    spoiler.setAttribute('tabindex', '0');
    spoiler.setAttribute('aria-label', 'Spoiler, activate to reveal');

    const reveal = () => {
      spoiler.classList.add('is-revealed');
      spoiler.removeAttribute('role');
      spoiler.removeAttribute('tabindex');
      spoiler.removeAttribute('aria-label');
    };

    spoiler.addEventListener('click', reveal);
    spoiler.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        reveal();
      }
    });
  });
}

function hydrateExpandableQuotes(root: ParentNode): void {
  root
    .querySelectorAll<HTMLElement>('.tg-blockquote-expandable:not([data-expandable-ready])')
    .forEach((quote) => {
      quote.dataset.expandableReady = 'true';

      // Apply the clamp, then keep the affordance only if it actually overflows.
      // Without JS the quote stays fully visible, so this degrades safely.
      quote.classList.add('is-collapsible');
      if (quote.scrollHeight <= quote.clientHeight + 1) {
        quote.classList.remove('is-collapsible');
        return;
      }

      quote.setAttribute('role', 'button');
      quote.setAttribute('tabindex', '0');
      quote.setAttribute('aria-expanded', 'false');

      const toggle = () => {
        const expanded = quote.classList.toggle('is-expanded');
        quote.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      };

      quote.addEventListener('click', toggle);
      quote.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      });
    });
}

export function hydrateMoodRichText(root: ParentNode = document): void {
  hydrateSpoilers(root);
  hydrateExpandableQuotes(root);
}
