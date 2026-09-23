/**
 * Broker for cross-document view-transition names.
 *
 * A shared-element morph asserts that two elements are the same object. That is
 * only true for the element the user actually activated, only if it was on
 * screen when they did, and only if this navigation is the one they aimed at.
 * Baking `view-transition-name` into markup makes the claim unconditionally —
 * so the homepage's Writing teaser, ~1900px below the fold, used to fly the full
 * height of the viewport into the article headline on a navigation started from
 * the command palette, while the rest of the destination sat already settled.
 *
 * Markup declares a candidate with `data-vt-name`; this module promotes exactly
 * one of them per navigation. Anything it declines falls back to the root
 * dissolve, which is the honest motion for "these are different pages".
 *
 * Persistent chrome is deliberately NOT routed through here: `.blog-mark` in
 * BlogLayout keeps a static name because it is the same element in the same
 * place on every page of the blog zone, so its morph is a no-op that holds the
 * mark still through the fade.
 *
 * Only the outgoing half lives here. The incoming half is inline in
 * layouts/client/ViewTransitionReveal.astro because `pagereveal` fires before a
 * deferred module can run; the two halves meet at the `vt-morph` handoff below.
 */

/** Handoff from the outgoing document to the incoming one. */
const HANDOFF_KEY = 'vt-morph';
const ATTR = 'data-vt-name';

/** Not in `lib.dom` yet; only the fields this module reads are declared. */
interface TransitionalPageEvent extends Event {
  viewTransition?: { finished: Promise<unknown> };
  /** `pageswap` only: where this navigation is actually going. */
  activation?: { entry?: { url?: string } };
}

interface Intent {
  name: string;
  /** The destination the reader aimed at, so an unrelated navigation can't inherit it. */
  url: string;
}

/**
 * Identity of a destination, as the incoming half will recompute it from its own
 * `location`. Trailing slash is dropped because a link may point at `/blog/x` and
 * land on `/blog/x/`; origin is absent because sessionStorage is origin-scoped.
 */
const revealKey = (url: string): string => {
  const target = new URL(url, location.href);
  return target.pathname.replace(/\/$/, '') + target.search;
};

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

/**
 * Lenient on the trailing slash: a link may point at `/blog/x` and land on
 * `/blog/x/`. Being strict there would silently drop the one morph that is
 * always correct — list row into headline.
 */
const isSameDocument = (a: string, b: string): boolean => {
  try {
    const left = new URL(a, location.href);
    const right = new URL(b, location.href);
    return (
      left.origin === right.origin &&
      left.pathname.replace(/\/$/, '') === right.pathname.replace(/\/$/, '') &&
      left.search === right.search
    );
  } catch {
    return false;
  }
};

const findCandidate = (name: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[${ATTR}="${CSS.escape(name)}"]`);

export const initViewTransitionNames = (): void => {
  let armed: Intent | null = null;

  // Capture phase, so the intent is recorded before anything can navigate away.
  // The named element is usually *inside* the link (a row's `<h2>`, the
  // doorway's mark), so resolving the source means walking up to the link and
  // then back down — `closest()` on the attribute alone finds nothing.
  document.addEventListener(
    'click',
    (event) => {
      armed = null;
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest<HTMLAnchorElement>('a[href]') ?? null;
      if (!link) return;
      const source: HTMLElement | null = link.matches(`[${ATTR}]`)
        ? link
        : link.querySelector<HTMLElement>(`[${ATTR}]`);
      if (!source) return;
      const name = source.getAttribute(ATTR);
      if (!name || !isOnScreen(source)) return;
      armed = { name, url: link.href };
    },
    true,
  );

  // Outgoing document. `pageswap` runs before the old snapshot is taken, so a
  // name set here is the one the capture sees. A traversal (back/forward) never
  // arms anything, which is correct — nothing was clicked, nothing should fly.
  window.addEventListener('pageswap', (event) => {
    const intent = armed;
    armed = null;
    const swap = event as TransitionalPageEvent;
    if (!swap.viewTransition || !intent) return;
    // A click that opened a new tab leaves the intent behind. Without this the
    // next navigation started some other way — the command palette, a redirect —
    // would inherit it and morph an element the reader never chose for this move.
    const destination = swap.activation?.entry?.url;
    if (destination && !isSameDocument(destination, intent.url)) return;
    const source = findCandidate(intent.name);
    if (!source || !isOnScreen(source)) return;
    source.style.viewTransitionName = intent.name;
    const handoff = JSON.stringify({
      name: intent.name,
      key: revealKey(destination ?? intent.url),
    });
    try {
      sessionStorage.setItem(HANDOFF_KEY, handoff);
    } catch {
      // Private mode: no handoff, so the incoming side stays unnamed and the
      // pair degrades to the root dissolve. Nothing to recover.
    }
    // `finished` also settles when this navigation is stopped. In that case
    // the old document survives, so undo both pieces of transition state.
    const clearFinishedTransition = () => {
      if (source.style.viewTransitionName === intent.name) {
        source.style.removeProperty('view-transition-name');
      }
      try {
        if (sessionStorage.getItem(HANDOFF_KEY) === handoff) {
          sessionStorage.removeItem(HANDOFF_KEY);
        }
      } catch {
        // Storage became unavailable after the handoff was written.
      }
    };
    void swap.viewTransition.finished.then(clearFinishedTransition, clearFinishedTransition);
  });
};
