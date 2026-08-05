// Visual-viewport overscroll sync. Bundled (HTTP-cached) rather than inlined per
// response. Tracks the iOS Safari dynamic-toolbar offset and exposes it as the
// `--visual-viewport-top` custom property, while neutralizing the bottom
// overscroll bounce so the fixed chrome does not drift.
export {};

const viewport = window.visualViewport;
if (viewport) {
  const root = document.documentElement;
  let frame = 0;
  let currentTop = -1;
  let bottomOverscrollLocked = false;
  const bottomOverscrollReleaseDistance = 96;

  const getScrollBottomDistance = () => {
    const maxScrollY = Math.max(0, root.scrollHeight - window.innerHeight);
    return Math.max(0, maxScrollY - window.scrollY);
  };

  const isBottomOverscrollOffset = (offsetTop: number) => {
    if (offsetTop <= 0) {
      bottomOverscrollLocked = false;
      return false;
    }

    const bottomDistance = getScrollBottomDistance();
    if (bottomDistance <= 1) {
      bottomOverscrollLocked = true;
      return true;
    }

    if (bottomOverscrollLocked && bottomDistance < bottomOverscrollReleaseDistance) {
      return true;
    }

    bottomOverscrollLocked = false;
    return false;
  };

  const syncVisualViewportTop = () => {
    frame = 0;
    const rawOffsetTop = Math.max(0, viewport.offsetTop || 0);
    const offsetTop = isBottomOverscrollOffset(rawOffsetTop) ? 0 : Math.round(rawOffsetTop);
    if (offsetTop === currentTop) return;
    currentTop = offsetTop;
    root.style.setProperty('--visual-viewport-top', offsetTop + 'px');
  };

  const requestSync = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(syncVisualViewportTop);
  };

  syncVisualViewportTop();
  viewport.addEventListener('resize', requestSync, { passive: true });
  viewport.addEventListener('scroll', requestSync, { passive: true });
  // Every listener is rAF-coalesced, the window scroll one included. It used to
  // cancel the pending frame and sync synchronously, which put a scrollHeight
  // read (forced layout) and a :root style write inside the scroll handler —
  // once per event, on the element that inherits to the whole document. Fixed
  // bars consume this token in `top`, so that recalc landed mid-scroll and the
  // home navbar juddered. rAF still runs before paint, so nothing drifts.
  window.addEventListener('scroll', requestSync, { passive: true });
  window.addEventListener('orientationchange', requestSync, { passive: true });
}
