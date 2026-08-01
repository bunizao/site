/**
 * Broker for cross-document view-transition names.
 *
 * A shared-element morph asserts that two elements are the same object. That is
 * only true for the element the user actually activated, and only if it was on
 * screen when they did. Baking `view-transition-name` into markup makes the
 * claim unconditionally — so the homepage's Writing teaser, ~1900px below the
 * fold, used to fly the full height of the viewport into the article headline
 * on a navigation started from the command palette, while the rest of the
 * destination sat already settled.
 *
 * Markup declares a candidate with `data-vt-name`; this module promotes exactly
 * one of them per navigation. Anything it declines falls back to the root
 * dissolve, which is the honest motion for "these are different pages".
 *
 * Persistent chrome is deliberately NOT routed through here: `.blog-mark` in
 * BlogLayout keeps a static name because it is the same element in the same
 * place on every page of the blog zone, so its morph is a no-op that holds the
 * mark still through the fade.
 */

/** Handoff from the outgoing document to the incoming one. */
const HANDOFF_KEY = 'vt-morph';
const ATTR = 'data-vt-name';

/**
 * What the reader touched. The named element is usually *inside* the link (a
 * row's `<h2>`, the doorway's mark), so resolving the source means walking up
 * to the activated link and then back down — `closest()` alone finds nothing.
 */
const ACTIVATION = `a[href], [${ATTR}]`;

/** Not in `lib.dom` yet; only the one field this module reads is needed. */
interface TransitionalPageEvent extends Event {
  viewTransition?: unknown;
}

/** Names are earned by visibility: an element the user cannot see cannot morph. */
const isOnScreen = (el: Element): boolean => {
  const box = el.getBoundingClientRect();
  return (
    box.bottom > 0 &&
    box.top < window.innerHeight &&
    box.right > 0 &&
    box.left < window.innerWidth
  );
};

const findCandidate = (name: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[${ATTR}="${CSS.escape(name)}"]`);

/** Read-and-clear: a stale handoff must never morph a later navigation. */
const takeHandoff = (): string | null => {
  try {
    const name = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY);
    return name;
  } catch {
    return null;
  }
};

export const initViewTransitionNames = (): void => {
  let armed: string | null = null;

  // Capture phase, so the intent is recorded before anything can navigate away.
  document.addEventListener(
    'click',
    (event) => {
      armed = null;
      const target = event.target instanceof Element ? event.target : null;
      const activated = target?.closest<HTMLElement>(ACTIVATION) ?? null;
      if (!activated) return;
      const source = activated.matches(`[${ATTR}]`)
        ? activated
        : activated.querySelector<HTMLElement>(`[${ATTR}]`);
      if (source && isOnScreen(source)) armed = source.getAttribute(ATTR);
    },
    true,
  );

  // Outgoing document. `pageswap` runs before the old snapshot is taken, so a
  // name set here is the one the capture sees. A traversal (back/forward) never
  // arms anything, which is correct — nothing was clicked, nothing should fly.
  window.addEventListener('pageswap', (event) => {
    const name = armed;
    armed = null;
    if (!(event as TransitionalPageEvent).viewTransition || !name) return;
    const source = findCandidate(name);
    if (!source || !isOnScreen(source)) return;
    source.style.viewTransitionName = name;
    try {
      sessionStorage.setItem(HANDOFF_KEY, name);
    } catch {
      // Private mode: no handoff, so the incoming side stays unnamed and the
      // pair degrades to the root dissolve. Nothing to recover.
    }
  });

  // Incoming document, before its first render — the counterpart's one chance
  // to claim the name.
  window.addEventListener('pagereveal', (event) => {
    const name = takeHandoff();
    if (!(event as TransitionalPageEvent).viewTransition || !name) return;
    const target = findCandidate(name);
    if (target) target.style.viewTransitionName = name;
  });
};
