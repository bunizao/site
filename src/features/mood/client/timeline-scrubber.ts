// The phone's timeline instrument. The jog wheel needs a wide viewport, so
// narrow ones get a date scrubber on the right edge, the way the Photos app
// does it: touch the rail and slide, the thumb sits under the finger, a
// bubble names the date, and letting go settles onto that date. The rail is
// the whole loaded feed, today at the top and the oldest loaded day at the
// bottom, so travel is measured in dates, not pixels, like the wheel.
import { formatMoodDateLabel } from '@/features/mood/client/date-label';
import {
  getScrollYForDateProgress,
  getTimelineDateState,
} from '@/features/mood/client/timeline-date-tracker';
import { createWheelFeedback } from '@/features/mood/client/wheel-feedback';
import { pageScroll } from '@/lib/page-scroll';

interface TimelineScrubberDependencies {
  feed: HTMLElement;
  list: HTMLElement;
}

// Finger travel before a press becomes a drag rather than a tap.
const DRAG_THRESHOLD = 4;
// How long the thumb stays after the feed stops moving.
const IDLE_HIDE_MS = 1100;
// The settle onto a date after release.
const SNAP_MS = 180;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export function mountTimelineScrubber(
  root: HTMLElement,
  { feed, list }: TimelineScrubberDependencies
): () => void {
  const rail = root.querySelector<HTMLElement>('[data-timeline-scrubber-rail]');
  const thumb = root.querySelector<HTMLElement>('[data-timeline-scrubber-thumb]');
  const bubble = root.querySelector<HTMLElement>('[data-timeline-scrubber-bubble]');
  if (!rail || !thumb || !bubble) return () => {};

  const scroll = pageScroll();
  const feedback = createWheelFeedback();
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let groups: HTMLElement[] = [];
  let anchors: number[] = [];
  let feedBottomY = 0;
  let activeIndex = -1;
  let shownLabel = '';

  let pointerId: number | null = null;
  let pressY = 0;
  let dragging = false;
  let pendingY: number | null = null;
  let writeRaf = 0;
  let syncRaf = 0;
  let rebuildRaf = 0;
  let snapRaf = 0;
  let hideTimer = 0;
  let lastScrollAt = 0;
  let lastTicked = -1;

  const viewportHeight = (): number => scroll.el.clientHeight || window.innerHeight;
  const lastIndex = (): number => groups.length - 1;
  const ready = (): boolean => groups.length > 0 && anchors.length === groups.length;

  const rebuildAnchors = (): void => {
    anchors = groups.map((group) => {
      const header = group.querySelector<HTMLElement>('.mood-date-header') ?? group;
      const y = scroll.el.scrollTop + header.getBoundingClientRect().top;
      return Number.isFinite(y) ? y : scroll.el.scrollTop;
    });
    feedBottomY = scroll.el.scrollTop + feed.getBoundingClientRect().bottom;
  };

  const readProgress = (): number => {
    if (!ready()) return 0;
    const state = getTimelineDateState({
      anchors,
      feedBottomY,
      scrollY: scroll.el.scrollTop,
      viewportHeight: viewportHeight(),
    });
    return Math.max(state.progressIndex, 0);
  };

  // Thumb travel is the rail minus the thumb, so a full-length thumb range
  // maps 0 to today and 1 to the oldest loaded day.
  const placeThumb = (progress: number): void => {
    const fraction = lastIndex() > 0 ? clamp(progress / lastIndex(), 0, 1) : 0;
    const travel = Math.max(rail.clientHeight - thumb.offsetHeight, 0);
    thumb.style.transform = `translateY(${(fraction * travel).toFixed(1)}px)`;
  };

  const setActive = (index: number): void => {
    const next = clamp(index, 0, lastIndex());
    if (next === activeIndex) return;
    activeIndex = next;
    const text = formatMoodDateLabel(groups[next]?.dataset.date ?? '');
    if (text === shownLabel) return;
    shownLabel = text;
    bubble.textContent = text;
  };

  const reveal = (): void => {
    root.classList.add('is-scrolling');
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => root.classList.remove('is-scrolling'), IDLE_HIDE_MS);
  };

  const syncToScroll = (): void => {
    if (!ready()) return;
    const progress = readProgress();
    placeThumb(progress);
    setActive(Math.floor(progress));
  };

  const scheduleSync = (): void => {
    if (syncRaf !== 0) return;
    syncRaf = requestAnimationFrame(() => {
      syncRaf = 0;
      if (!dragging) syncToScroll();
    });
  };

  const handleScroll = (): void => {
    lastScrollAt = performance.now();
    if (dragging) return;
    reveal();
    scheduleSync();
  };

  const progressAtY = (clientY: number): number => {
    const rect = rail.getBoundingClientRect();
    const half = thumb.offsetHeight / 2;
    const travel = Math.max(rect.height - thumb.offsetHeight, 1);
    return clamp((clientY - rect.top - half) / travel, 0, 1) * lastIndex();
  };

  const writeProgress = (progress: number): void => {
    const desired = getScrollYForDateProgress({
      anchors,
      feedBottomY,
      progressIndex: progress,
      viewportHeight: viewportHeight(),
    });
    const limit = Math.max(scroll.el.scrollHeight - scroll.el.clientHeight, 0);
    scroll.el.scrollTop = clamp(desired, 0, limit);
    placeThumb(progress);
    const index = Math.floor(progress);
    setActive(index);
    if (index !== lastTicked) {
      lastTicked = index;
      feedback.tick(0.6);
    }
  };

  // Pointer events outrun frames; the newest finger position is written once
  // per frame, and directly on release so the last movement is never lost.
  const flushDrag = (): void => {
    if (writeRaf !== 0) cancelAnimationFrame(writeRaf);
    writeRaf = 0;
    if (pendingY === null) return;
    const y = pendingY;
    pendingY = null;
    writeProgress(progressAtY(y));
  };

  const stopSnap = (): void => {
    if (snapRaf !== 0) cancelAnimationFrame(snapRaf);
    snapRaf = 0;
  };

  // iOS drops programmatic scrollTop while the scroller is still coasting
  // under its own momentum. Toggling overflow is the one way to halt it.
  const haltMomentum = (): void => {
    if (performance.now() - lastScrollAt >= 160) return;
    const previous = scroll.el.style.overflow;
    scroll.el.style.overflow = 'hidden';
    void scroll.el.offsetHeight;
    scroll.el.style.overflow = previous;
  };

  const snapTo = (target: number): void => {
    stopSnap();
    const from = readProgress();
    const distance = target - from;
    const finish = (): void => {
      snapRaf = 0;
      writeProgress(target);
      feedback.settle();
      syncToScroll();
    };
    if (prefersReducedMotion || Math.abs(distance) < 0.005) {
      finish();
      return;
    }
    const startedAt = performance.now();
    const step = (): void => {
      const t = clamp((performance.now() - startedAt) / SNAP_MS, 0, 1);
      const eased = 1 - (1 - t) ** 3;
      if (t >= 1) {
        finish();
        return;
      }
      writeProgress(from + distance * eased);
      snapRaf = requestAnimationFrame(step);
    };
    snapRaf = requestAnimationFrame(step);
  };

  const handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!ready()) return;
    feedback.prime();
    stopSnap();
    // Content may have grown since the last layout read.
    rebuildAnchors();
    pointerId = event.pointerId;
    pressY = event.clientY;
    dragging = false;
    rail.setPointerCapture(event.pointerId);
    reveal();
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    if (!dragging) {
      if (Math.abs(event.clientY - pressY) < DRAG_THRESHOLD) return;
      dragging = true;
      haltMomentum();
      lastTicked = Math.floor(readProgress());
      root.classList.add('is-engaged');
      clearTimeout(hideTimer);
    }
    event.preventDefault();
    pendingY = event.clientY;
    if (writeRaf === 0) writeRaf = requestAnimationFrame(flushDrag);
  };

  const endPress = (event: PointerEvent, cancelled: boolean): void => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    feedback.prime();
    if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);

    if (!dragging) {
      // A tap on the rail goes straight to that point of the feed, the way
      // the index down the side of Contacts does.
      if (!cancelled) {
        haltMomentum();
        writeProgress(Math.round(progressAtY(event.clientY)));
        feedback.settle();
        syncToScroll();
      }
      reveal();
      return;
    }

    dragging = false;
    flushDrag();
    root.classList.remove('is-engaged');
    snapTo(clamp(Math.round(readProgress()), 0, lastIndex()));
    reveal();
  };

  const handlePointerUp = (event: PointerEvent): void => endPress(event, false);
  const handlePointerCancel = (event: PointerEvent): void => endPress(event, true);

  // iOS grants audio activation on touch end, click and keys, never on touch
  // start, so any gesture that ends anywhere on the page primes the engine.
  const primeFeedback = (): void => feedback.prime();

  const rebuild = (): void => {
    groups = Array.from(list.querySelectorAll<HTMLElement>('.mood-date-group'));
    const visible = groups.length > 0 && !feed.classList.contains('is-hidden');
    root.classList.toggle('is-visible', visible);
    if (!visible) return;
    rebuildAnchors();
    if (!dragging) syncToScroll();
  };

  const scheduleRebuild = (): void => {
    if (rebuildRaf !== 0) return;
    rebuildRaf = requestAnimationFrame(() => {
      rebuildRaf = 0;
      rebuild();
    });
  };

  const contentObserver = new MutationObserver(scheduleRebuild);
  contentObserver.observe(list, { childList: true, subtree: true });
  const feedClassObserver = new MutationObserver(scheduleRebuild);
  feedClassObserver.observe(feed, { attributes: true, attributeFilter: ['class'] });
  const resizeObserver = new ResizeObserver(scheduleRebuild);
  resizeObserver.observe(list);

  scroll.events.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', scheduleRebuild);
  rail.addEventListener('pointerdown', handlePointerDown);
  rail.addEventListener('pointermove', handlePointerMove);
  rail.addEventListener('pointerup', handlePointerUp);
  rail.addEventListener('pointercancel', handlePointerCancel);
  window.addEventListener('pointerup', primeFeedback, { passive: true, capture: true });
  window.addEventListener('touchend', primeFeedback, { passive: true, capture: true });
  window.addEventListener('keydown', primeFeedback, { passive: true, capture: true });

  rebuild();

  return () => {
    contentObserver.disconnect();
    feedClassObserver.disconnect();
    resizeObserver.disconnect();
    scroll.events.removeEventListener('scroll', handleScroll);
    window.removeEventListener('resize', scheduleRebuild);
    rail.removeEventListener('pointerdown', handlePointerDown);
    rail.removeEventListener('pointermove', handlePointerMove);
    rail.removeEventListener('pointerup', handlePointerUp);
    rail.removeEventListener('pointercancel', handlePointerCancel);
    window.removeEventListener('pointerup', primeFeedback, { capture: true });
    window.removeEventListener('touchend', primeFeedback, { capture: true });
    window.removeEventListener('keydown', primeFeedback, { capture: true });
    for (const id of [writeRaf, syncRaf, rebuildRaf, snapRaf]) if (id !== 0) cancelAnimationFrame(id);
    clearTimeout(hideTimer);
    feedback.destroy();
  };
}
