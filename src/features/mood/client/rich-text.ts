/**
 * Reusable hydration for Telegram Bot API rich text entities that need
 * interaction: click-to-reveal spoilers and expand/collapse blockquotes.
 *
 * Styling lives in feed-rich-text.css. The spoiler blur holds even without JS;
 * quotes clamp from first paint only under html.js so a no-JS reader never sees
 * trapped content. This only adds the reveal/expand affordances. Idempotent —
 * safe to call on the same root repeatedly as content streams in.
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

      // The stylesheet already clamps the quote under html.js, so this measures
      // the clamped box. A quote that fits gets .is-static, which lifts a clamp
      // that was not clipping anything — no layout shift either way.
      if (quote.scrollHeight <= quote.clientHeight + 1) {
        quote.classList.add('is-static');
        return;
      }
      quote.classList.add('is-collapsible');

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
