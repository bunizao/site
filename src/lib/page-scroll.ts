/**
 * Who scrolls the page.
 *
 * Most zones scroll the document root. Blog and Mood contain their scroll in an
 * inner element instead, and that is not a style choice — it is the only fix for
 * a measured iOS constraint (iPhone 16 Pro Max / iOS 26.1):
 *
 *   - When Safari collapses its toolbar, `window.innerHeight` grows past
 *     `documentElement.clientHeight` and ordinary document content paints ~60px
 *     ABOVE client y=0, into the status-bar band beside the Dynamic Island.
 *   - CSS cannot measure that band: `env(safe-area-inset-top)` and
 *     `env(safe-area-max-inset-top)` both read 0, with or without
 *     `viewport-fit=cover`.
 *   - CSS cannot cover it either. Fixed layers, sticky layers, and a sticky
 *     layer's absolutely positioned children are all clipped to the layout
 *     viewport top; only the scrolling contents layer paints up there.
 *   - Safari collapses the toolbar only when the ROOT scroller moves.
 *
 * So the band is closed at the source: the root does not scroll in that zone, the
 * toolbar never collapses, and nothing ever paints above y=0.
 *
 * The consequence for callers: nothing may assume `window.scrollY`. Read
 * `el.scrollTop`, listen on `events`, and hand `timeline` to a scroll-driven
 * animation. `scroll(nearest)` is not a substitute — it resolves to nothing from
 * a `position: fixed` element even when a scroll container is its DOM ancestor
 * (verified in both Chromium and WebKit), which is why a contained scroller has
 * to publish a named timeline.
 */

export interface PageScroll {
  /** The scrolling element. `documentElement` when the root scrolls. */
  el: HTMLElement;
  /** Where its scroll events land. `window` when the root scrolls. */
  events: EventTarget;
  /** An `animation-timeline` value that advances with it. */
  timeline: string;
}

/**
 * Marks a contained scroller. PageScroller sets it and page-scroller.css publishes
 * the matching `scroll-timeline-name` plus the `timeline-scope` that lets a fixed
 * layer outside the scroller read that name.
 */
export const PAGE_SCROLLER_ATTR = 'data-page-scroller';

/** Must match the name page-scroller.css puts on the contained scroller. */
const CONTAINED_TIMELINE = '--page-scroll';

export function pageScroll(doc: Document = document): PageScroll {
  const contained = doc.querySelector<HTMLElement>(`[${PAGE_SCROLLER_ATTR}]`);
  return contained
    ? { el: contained, events: contained, timeline: CONTAINED_TIMELINE }
    : { el: doc.documentElement, events: window, timeline: 'scroll(root block)' };
}
