import type gsap from 'gsap';
import { slotText, type SlotOptions, type SlotTextController } from 'slot-text';
import 'slot-text/style.css';
import {
  getScrollYForDateProgress,
  getTimelineDateState,
} from '@/features/mood/client/timeline-date-tracker';
import { formatMoodDateLabel } from '@/features/mood/client/date-label';
import { createWheelFeedback } from '@/features/mood/client/wheel-feedback';
import { getMoodFeedTopHref } from '@/features/mood/shared/feed-anchor';
import { pageScroll } from '@/lib/page-scroll';

type GsapModule = typeof gsap;

interface TimelineWheelDependencies {
  feed: HTMLElement;
  list: HTMLElement;
}

export function mountTimelineWheel(
  root: HTMLElement,
  { feed: feedEl, list }: TimelineWheelDependencies
): () => void {
  const wheel = root;
  const scroll = pageScroll();
  const dial = wheel.querySelector('[data-timeline-dial]') as HTMLElement | null;
  const label = wheel.querySelector('[data-timeline-label]') as HTMLElement | null;

  if (!dial || !label) return () => {};

  // Below 1024px the wheel waits off the right edge and a swipe from that edge
  // brings it in. The preview fixture forces the desktop layout at any width.
  const isPhoneLayout = (): boolean => !root.hasAttribute('data-timeline-wheel-compact') && window.innerWidth < 1024;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The wheel doubles as a back-to-top control: clicking it returns to the
  // feed top, and the existing scroll sync winds the dial back as you go.
  const topButton = wheel.querySelector('[data-timeline-top]') as HTMLButtonElement | null;
  const handleTopClick = (): void => {
    // A drag releases with a click event; only a press that never moved counts.
    if (suppressClick) {
      suppressClick = false;
      return;
    }

    const topHref = getMoodFeedTopHref(new URL(window.location.href));
    if (topHref) {
      window.location.assign(topHref);
      return;
    }

    scroll.el.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    followScrollToTop();
    armClose();
  };
  topButton?.addEventListener('click', handleTopClick);

  // The readout is a slot-text display: the active date rolls in as you scroll
  // down, and rolls to "↑ TOP" to expose the back-to-top role — on hover, and
  // whenever the reader scrolls back up past the first screen (the moment they
  // are likely heading for the top), then rolls back to the date on the way down.
  const TOP_TEXT = '↑ TOP';
  const REVEAL_AT = (): number => scroll.el.clientHeight || window.innerHeight;
  const DIR_DELTA = 6; // px of travel before a direction flip counts (anti-jitter)
  const rollBase: SlotOptions = prefersReducedMotion
    ? { stagger: 0, duration: 0, bounce: 0 }
    : {};
  // Date → date: keep shared characters static so only what changed rolls
  // (within a month, just the day digit ticks over).
  const dateRoll: SlotOptions = { direction: 'down', skipUnchanged: true, ...rollBase };
  // Transitions to/from "↑ TOP" are fully misaligned, so roll the whole line
  // uniformly instead of freezing stray matching glyphs.
  const topRoll: SlotOptions = { direction: 'up', skipUnchanged: false, ...rollBase };
  const dateReturnRoll: SlotOptions = { direction: 'down', skipUnchanged: false, ...rollBase };

  let roll: SlotTextController | null = null;
  let currentDateText = '';
  let shownText = '';
  let isHoveringWheel = false;
  let topRevealed = false;
  // True while the wheel itself is driving the scroll (drag, coast, snap or
  // keyboard step) rather than merely reporting it.
  let controlActive = false;
  let hintPulseTimer = 0;
  let dirAnchorY = 0;
  let scrollDir: 'up' | 'down' = 'down';
  let lastScrollAt = 0;

  const wantsTop = (): boolean => !controlActive && (topRevealed || isHoveringWheel);

  // Render whatever the readout should currently show, picking the right roll
  // for the transition and skipping no-op re-rolls.
  const renderReadout = (): void => {
    roll ??= slotText(label, '', dateRoll);
    const target = wantsTop() ? TOP_TEXT : currentDateText;
    if (shownText === target) return;
    const opts = target === TOP_TEXT ? topRoll : shownText === TOP_TEXT ? dateReturnRoll : dateRoll;
    roll.set(target, opts);
    shownText = target;
  };

  const showDate = (text: string): void => {
    currentDateText = text;
    renderReadout();
  };

  // A brief glow pulse on the wheel when the cue surfaces — a little sensory
  // weight so the moment registers instead of arriving silently.
  const pulseWheelHint = (): void => {
    if (prefersReducedMotion) return;
    wheel.classList.add('is-hinting');
    clearTimeout(hintPulseTimer);
    hintPulseTimer = window.setTimeout(() => wheel.classList.remove('is-hinting'), 900);
  };

  const setTopRevealed = (next: boolean): void => {
    if (next === topRevealed) return;
    topRevealed = next;
    renderReadout();
    if (next && !isHoveringWheel) pulseWheelHint();
  };

  // Only a mouse hovers. A touch also raises enter/leave (and on iOS the leave
  // does not come until the next tap elsewhere), which would roll the readout
  // to "↑ TOP" the moment a scrub ends and hide the date just landed on.
  // The class carries the hover styling too: no hover pseudo-class in the
  // stylesheet, so iOS never mistakes a first touch for a hover and waits for
  // a second one before it will take a drag.
  const handlePointerEnter = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    isHoveringWheel = true;
    wheel.classList.add('is-hovering');
    renderReadout();
  };
  const handlePointerLeave = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    isHoveringWheel = false;
    wheel.classList.remove('is-hovering');
    renderReadout();
  };
  wheel.addEventListener('pointerenter', handlePointerEnter);
  wheel.addEventListener('pointerleave', handlePointerLeave);

  let dateGroups: HTMLElement[] = [];
  let notches: HTMLElement[] = [];
  let currentRotation = 0;
  let targetRotation = 0;
  let animationId = 0;
  let velocity = 0;
  let scrollTimer = 0;
  let activeIndex = -1;
  let scrollSyncActive = false;
  let scrollSyncRaf = 0;
  let anchorRefreshRaf = 0;
  let cachedFeedBottomY = 0;
  let dateAnchors: number[] = [];
  let dateItemCount = 0;
  let wheelSyncRaf = 0;
  let listResizeObserver: ResizeObserver | null = null;
  let isLoadingSpin = false;
  let loadingShimmerTl: GSAPTimeline | null = null;
  let loadingPendulumTl: GSAPTimeline | null = null;
  let loadingDelayedCall: GSAPTween | null = null;
  let loadingTickActive = false;
  let loadedGsap: GsapModule | null = null;
  let gsapPromise: Promise<GsapModule> | null = null;
  let resizeTimer = 0;
  let contentObserver: MutationObserver | null = null;
  let feedClassObserver: MutationObserver | null = null;

  const NOTCHES_PER_DATE = 6;
  const ANGLE_PER_NOTCH = 4;
  const SKELETON_GROUPS = 5;

  const createSkeletonNotches = (): void => {
    dial.innerHTML = '';
    notches = [];
    for (let i = 0; i < SKELETON_GROUPS; i++) {
      const majorAngle = i * NOTCHES_PER_DATE * ANGLE_PER_NOTCH;
      const majorNotch = document.createElement('div');
      majorNotch.className = 'timeline-notch is-major is-skeleton';
      majorNotch.style.setProperty('--notch-idx', String(i));
      majorNotch.style.transform = `rotate(${majorAngle}deg) translateX(calc(var(--wheel-size) / 2 - 36px))`;
      dial.appendChild(majorNotch);

      for (let j = 1; j < NOTCHES_PER_DATE; j++) {
        const minorAngle = majorAngle + j * ANGLE_PER_NOTCH;
        const minorNotch = document.createElement('div');
        minorNotch.className = 'timeline-notch is-skeleton';
        minorNotch.style.setProperty('--notch-idx', String(i * NOTCHES_PER_DATE + j));
        minorNotch.style.transform = `rotate(${minorAngle}deg) translateX(calc(var(--wheel-size) / 2 - 20px))`;
        dial.appendChild(minorNotch);
      }
    }
  };

  const applyDialTransform = (): void => {
    dial.style.transform = `translate3d(0, -50%, 0) rotate(${-currentRotation}deg)`;
  };

  const loadGsap = async (): Promise<GsapModule> => {
    if (loadedGsap) return loadedGsap;
    gsapPromise ??= import('gsap').then(({ default: gsap }) => {
      loadedGsap = gsap;
      return gsap;
    });
    return gsapPromise;
  };

  const destroyLoadingAnimation = (): void => {
    loadingTickActive = false;

    if (loadingShimmerTl) {
      loadingShimmerTl.kill();
      loadingShimmerTl = null;
    }

    if (loadingPendulumTl) {
      loadingPendulumTl.kill();
      loadingPendulumTl = null;
    }

    if (loadingDelayedCall) {
      loadingDelayedCall.kill();
      loadingDelayedCall = null;
    }

    const gsap = loadedGsap;
    if (!gsap) return;

    const skeletonNotches = dial.querySelectorAll('.timeline-notch.is-skeleton');
    skeletonNotches.forEach((element) => gsap.killTweensOf(element));

    const glowEl = wheel.querySelector('.timeline-wheel-glow');
    if (glowEl) {
      gsap.killTweensOf(glowEl);
      (glowEl as HTMLElement).style.opacity = '';
    }

    const sweepEl = wheel.querySelector('[data-timeline-sweep]');
    if (sweepEl) {
      gsap.killTweensOf(sweepEl);
      (sweepEl as HTMLElement).style.opacity = '';
    }
  };

  const createLoadingAnimation = async (): Promise<void> => {
    if (prefersReducedMotion) return;
    destroyLoadingAnimation();
    loadingTickActive = true;

    const gsap = await loadGsap();
    if (!loadingTickActive || !isLoadingSpin) return;

    const glowEl = wheel.querySelector('.timeline-wheel-glow') as HTMLElement | null;
    const skeletonNotches = Array.from(
      dial.querySelectorAll('.timeline-notch.is-skeleton')
    );
    const hasSkeleton = skeletonNotches.length > 0;

    if (hasSkeleton) {
      gsap.fromTo(skeletonNotches,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.5,
          stagger: 0.02,
          ease: 'power2.out',
        }
      );
    }

    const SWEEP_ARC = ANGLE_PER_NOTCH * 7;
    const FORWARD_DUR = 2.2;
    const RETURN_DUR = 1.4;
    const HOLD_DUR = 0.35;

    const buildPendulumCycle = (): void => {
      if (!loadingTickActive || !isLoadingSpin) return;

      const startRot = currentRotation;
      const proxy = { r: startRot };

      loadingPendulumTl = gsap.timeline({
        onComplete: buildPendulumCycle,
      });

      loadingPendulumTl.to(proxy, {
        r: startRot + SWEEP_ARC,
        duration: FORWARD_DUR,
        ease: 'sine.inOut',
        onUpdate: () => {
          currentRotation = proxy.r;
          targetRotation = currentRotation;
          applyDialTransform();
        },
      });

      loadingPendulumTl.to({}, { duration: HOLD_DUR });

      loadingPendulumTl.to(proxy, {
        r: startRot,
        duration: RETURN_DUR,
        ease: 'power2.inOut',
        onUpdate: () => {
          currentRotation = proxy.r;
          targetRotation = currentRotation;
          applyDialTransform();
        },
      });

      loadingPendulumTl.to({}, { duration: HOLD_DUR });
    };

    loadingDelayedCall = gsap.delayedCall(hasSkeleton ? 0.55 : 0, buildPendulumCycle);

    if (glowEl) {
      gsap.fromTo(glowEl,
        { opacity: 0.06 },
        {
          opacity: 0.5,
          duration: FORWARD_DUR * 0.5,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: hasSkeleton ? 0.55 : 0,
        }
      );
    }

    if (hasSkeleton) {
      loadingShimmerTl = gsap.timeline({ repeat: -1, delay: 0.8 });
      loadingShimmerTl.to(skeletonNotches, {
        opacity: (_index: number, element: Element) =>
          element.classList.contains('is-major') ? 1 : 0.6,
        duration: 1.0,
        stagger: { each: 0.03 },
        ease: 'sine.inOut',
      });
      loadingShimmerTl.to(skeletonNotches, {
        opacity: 0.15,
        duration: 1.2,
        stagger: { each: 0.03 },
        ease: 'sine.inOut',
      });
    }

    const sweepEl = wheel.querySelector('[data-timeline-sweep]') as HTMLElement | null;
    if (sweepEl) {
      gsap.fromTo(sweepEl,
        { opacity: 0 },
        {
          opacity: 0.8,
          duration: 1.5,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: hasSkeleton ? 0.3 : 0,
        }
      );
    }
  };

  // How busy a day was, as 0-1. Log-scaled because the tail is long: a day with
  // 30 posts should not flatten every ordinary day to nothing. The scale is
  // fixed rather than normalised against the loaded maximum, so notches keep the
  // weight they were drawn with when more pages arrive.
  const DENSITY_SATURATION = 12;

  const groupWeight = (group: HTMLElement | undefined): number => {
    const count = group?.querySelectorAll('.mood-item').length ?? 0;
    if (count === 0) return 0;
    return Math.min(Math.log2(1 + count) / Math.log2(1 + DENSITY_SATURATION), 1);
  };

  const applyGroupWeight = (dateIdx: number): void => {
    const weight = groupWeight(dateGroups[dateIdx]);
    dial
      .querySelectorAll<HTMLElement>(`[data-date-index="${dateIdx}"]`)
      .forEach((notch) => notch.style.setProperty('--notch-weight', weight.toFixed(3)));
  };

  const createNotches = (startFrom = 0): void => {
    if (startFrom === 0) {
      dial.innerHTML = '';
      notches = [];
      activeIndex = -1;
    }

    const totalDates = dateGroups.length;
    if (totalDates === 0) return;

    for (let dateIdx = startFrom; dateIdx < totalDates; dateIdx++) {
      const majorAngle = dateIdx * NOTCHES_PER_DATE * ANGLE_PER_NOTCH;
      const weight = groupWeight(dateGroups[dateIdx]).toFixed(3);
      const majorNotch = document.createElement('div');
      majorNotch.className = 'timeline-notch is-major';
      majorNotch.dataset.dateIndex = String(dateIdx);
      majorNotch.style.setProperty('--notch-weight', weight);
      majorNotch.style.transform = `rotate(${majorAngle}deg) translateX(calc(var(--wheel-size) / 2 - 36px))`;
      const pip = document.createElement('div');
      pip.className = 'timeline-notch-pip';
      majorNotch.appendChild(pip);
      dial.appendChild(majorNotch);
      notches.push(majorNotch);

      for (let i = 1; i < NOTCHES_PER_DATE; i++) {
        const minorAngle = majorAngle + i * ANGLE_PER_NOTCH;
        const minorNotch = document.createElement('div');
        minorNotch.className = 'timeline-notch';
        minorNotch.dataset.dateIndex = String(dateIdx);
        minorNotch.style.setProperty('--notch-weight', weight);
        minorNotch.style.transform = `rotate(${minorAngle}deg) translateX(calc(var(--wheel-size) / 2 - 20px))`;
        dial.appendChild(minorNotch);
      }
    }
  };

  const updateActiveNotch = (index: number): void => {
    if (index === activeIndex && notches.length > 0) return;

    if (index < 0 || index >= dateGroups.length) {
      showDate('');
      activeIndex = -1;
      return;
    }

    notches.forEach((notch) => {
      notch.classList.remove('is-active', 'is-neighbor', 'is-near');
    });

    if (notches[index]) {
      notches[index].classList.add('is-active');
    }
    if (notches[index - 1]) notches[index - 1].classList.add('is-neighbor');
    if (notches[index + 1]) notches[index + 1].classList.add('is-neighbor');
    if (notches[index - 2]) notches[index - 2].classList.add('is-near');
    if (notches[index + 2]) notches[index + 2].classList.add('is-near');

    const dateKey = dateGroups[index]?.dataset.date || '';
    showDate(formatMoodDateLabel(dateKey));

    activeIndex = index;
  };

  const animateRotation = (): void => {
    if (isLoadingSpin) {
      animationId = 0;
      return;
    }

    if (prefersReducedMotion) {
      currentRotation = targetRotation;
      velocity = 0;
    } else {
      const force = (targetRotation - currentRotation) * 0.08;
      velocity = (velocity + force) * 0.78;
      currentRotation += velocity;

      if (Math.abs(velocity) < 0.01 && Math.abs(targetRotation - currentRotation) < 0.05) {
        currentRotation = targetRotation;
        velocity = 0;
      }
    }

    applyDialTransform();

    if (velocity !== 0 || Math.abs(targetRotation - currentRotation) > 0.05) {
      animationId = requestAnimationFrame(animateRotation);
    } else {
      animationId = 0;
    }
  };

  const startAnimation = (): void => {
    if (animationId !== 0) return;
    animationId = requestAnimationFrame(animateRotation);
  };

  const rebuildDateAnchors = (): void => {
    dateAnchors = dateGroups.map((group) => {
      const header = group.querySelector('.mood-date-header') as HTMLElement | null;
      const anchor = header ?? group;
      const rect = anchor.getBoundingClientRect();
      const y = scroll.el.scrollTop + rect.top;
      return Number.isFinite(y) ? y : scroll.el.scrollTop;
    });
    cachedFeedBottomY = scroll.el.scrollTop + feedEl.getBoundingClientRect().bottom;
  };

  const applyScrollPosition = (scrollY: number, animate = true): void => {
    const totalDates = dateGroups.length;
    if (totalDates === 0) return;

    if (dateAnchors.length !== totalDates) return;

    const dateState = getTimelineDateState({
      anchors: dateAnchors,
      feedBottomY: cachedFeedBottomY,
      scrollY,
      viewportHeight: scroll.el.clientHeight || window.innerHeight,
    });
    const rotationIndex = Math.max(dateState.progressIndex, 0);

    targetRotation = rotationIndex * NOTCHES_PER_DATE * ANGLE_PER_NOTCH;
    updateActiveNotch(dateState.activeIndex);

    if (animate && !prefersReducedMotion) {
      startAnimation();
      return;
    }

    // Land it and kill any spring still running, or the stale velocity would
    // carry the dial past the position it was just set to.
    currentRotation = targetRotation;
    velocity = 0;
    applyDialTransform();
  };

  const scheduleScrollPositionSync = (animate = true): void => {
    if (scrollSyncRaf !== 0) return;
    scrollSyncRaf = requestAnimationFrame(() => {
      scrollSyncRaf = 0;
      if (!scrollSyncActive || dateGroups.length === 0) return;
      // While the wheel is driving, the hand owns the dial and the scroll
      // events are echoes of its own writes. Reading them back would only let
      // a late or dropped one (iOS during momentum) yank the dial off the
      // finger. The dial is reconciled once when control ends.
      if (controlActive) return;
      applyScrollPosition(scroll.el.scrollTop, animate);
    });
  };

  const scheduleAnchorRefresh = (): void => {
    if (anchorRefreshRaf !== 0) return;
    anchorRefreshRaf = requestAnimationFrame(() => {
      anchorRefreshRaf = 0;
      if (dateGroups.length === 0) return;
      rebuildDateAnchors();
      scheduleScrollPositionSync(false);
    });
  };

  // ── Jog wheel: the dial as an input ──────────────────────────────────────
  // Dragging the wheel drives the scroll position, and the ordinary scroll sync
  // above winds the dial to match. scrollTop stays the single source of truth,
  // so there is never a second animation competing for the same dial.
  //
  // Travel is measured in DATES, not pixels: one drag step covers the same
  // ground whether a day holds one line of text or twenty photos. Pixel-based
  // scrubbing on a mood feed is unusable for exactly that reason.
  //
  // The graduations follow the hand. Pull the dial down and the notches under
  // the pointer come down with it, which winds the feed back towards today;
  // push it up to go deeper. Same as dragging the feed itself.

  const PX_PER_DATE = 26; // drag distance that turns the dial by one date
  const DRAG_THRESHOLD = 4; // px of travel before a press stops being a click
  const VELOCITY_WINDOW_MS = 90;

  // ── Release: one continuous deceleration onto a date ──────────────────
  // The scroll view model. A throw loses speed exponentially; where it would
  // come to rest is projected at the moment the finger lifts, rounded to the
  // nearest date, and the same curve is aimed to land exactly there. One
  // motion from lift to detent. Coasting to a stop and then easing to the
  // nearest date is two motions with a dead moment between them, and that is
  // what reads as stiff. Everything is in wall time: a 120Hz screen gets more
  // frames of the same movement, not a faster one.
  const DECAY = 0.0045; // per ms; a throw keeps 1/e of its speed every ~220ms
  const MAX_THROW = 12; // dates one release may travel, so a flick never loses you
  const SETTLE_EPSILON = 0.002; // dates

  const feedback = createWheelFeedback();

  let dragPointerId: number | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartProgress = 0;
  let dragProgress = 0;
  let dragMoved = false;
  let dragSamples: { at: number; progress: number }[] = [];
  // Pointer events arrive faster than frames (120Hz touch, 60Hz rendering on
  // Safari); the latest travel is kept and written once per frame.
  let pendingTravel: number | null = null;
  let dragWriteRaf = 0;
  let releaseRaf = 0;
  let topFollowRaf = 0;
  let progressTweenRaf = 0;
  let lastTickedDate = 0;
  let suppressClick = false;

  const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max);

  const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

  const viewportHeight = (): number => scroll.el.clientHeight || window.innerHeight;

  const clampProgress = (value: number): number =>
    clamp(value, 0, Math.max(dateGroups.length - 1, 0) + 1);

  const readProgress = (): number => {
    if (dateAnchors.length !== dateGroups.length) return 0;
    return Math.max(
      getTimelineDateState({
        anchors: dateAnchors,
        feedBottomY: cachedFeedBottomY,
        scrollY: scroll.el.scrollTop,
        viewportHeight: viewportHeight(),
      }).progressIndex,
      0
    );
  };

  // Move the feed to a fractional date index. Returns false once the scroller is
  // pinned at either end, which is what stops momentum grinding against a wall.
  const scrollToProgress = (progress: number): boolean => {
    if (dateAnchors.length !== dateGroups.length) return false;
    const desired = getScrollYForDateProgress({
      anchors: dateAnchors,
      feedBottomY: cachedFeedBottomY,
      progressIndex: progress,
      viewportHeight: viewportHeight(),
    });
    const limit = Math.max(scroll.el.scrollHeight - scroll.el.clientHeight, 0);
    const next = clamp(desired, 0, limit);
    const moved = Math.abs(next - scroll.el.scrollTop) > 0.5;
    scroll.el.scrollTop = next;

    // Turn the dial now, in the same frame as the hand moved. The scroll event
    // that follows lands a frame later and only confirms this position.
    targetRotation = progress * NOTCHES_PER_DATE * ANGLE_PER_NOTCH;
    currentRotation = targetRotation;
    velocity = 0;
    applyDialTransform();
    updateActiveNotch(Math.min(Math.floor(progress), dateGroups.length - 1));
    return moved;
  };

  // One click per date boundary crossed, at a volume that tracks dial speed.
  const tickAcross = (progress: number, strength: number): void => {
    const index = Math.floor(progress);
    if (index === lastTickedDate) return;
    lastTickedDate = index;
    feedback.tick(strength);
  };

  const recordDragSample = (progress: number): void => {
    const at = performance.now();
    dragSamples.push({ at, progress });
    while (dragSamples.length > 2 && at - dragSamples[0].at > VELOCITY_WINDOW_MS) {
      dragSamples.shift();
    }
  };

  // Drag speed in dates per millisecond, measured across a time window rather
  // than between two adjacent events. A 120Hz trackpad delivers moves less
  // than a millisecond apart, and dividing by that gap turns an ordinary drag
  // into a flick across the whole year.
  //
  // A still finger sends no events at all (touch reports nothing while it is
  // not moving), so the newest sample can be from the fast part of a drag that
  // then stopped dead. Measure staleness against now: a pointer that has not
  // moved for STILL_MS has stopped, whatever its last sample says.
  const STILL_MS = 64;
  const dragSpeed = (): number => {
    if (dragSamples.length < 2) return 0;
    const first = dragSamples[0];
    const last = dragSamples[dragSamples.length - 1];
    if (performance.now() - last.at > STILL_MS) return 0;
    const elapsed = last.at - first.at;
    if (elapsed < 8) return 0;
    return (last.progress - first.progress) / elapsed;
  };

  // Apply the newest pointer position. Called from the frame, and directly on
  // release so the last movement is never lost to a cancelled frame.
  const flushDrag = (): void => {
    if (dragWriteRaf !== 0) cancelAnimationFrame(dragWriteRaf);
    dragWriteRaf = 0;
    if (pendingTravel === null) return;
    const travel = pendingTravel;
    pendingTravel = null;

    const next = clampProgress(dragStartProgress - travel / PX_PER_DATE);
    dragProgress = next;
    recordDragSample(next);
    scrollToProgress(next);
    // Against a brisk drag of 0.03 dates/ms.
    tickAcross(next, clamp(Math.abs(dragSpeed()) / 0.03, 0, 1));
  };

  const stopTopFollow = (): void => {
    if (topFollowRaf !== 0) cancelAnimationFrame(topFollowRaf);
    topFollowRaf = 0;
  };

  // iOS reports a programmatic smooth scroll sparsely, sometimes only once it
  // has landed and sometimes not at all, which left the dial and readout deep
  // in the feed after a tap had taken the scroller to the top. Read the
  // scroller each frame until it reaches the top or stops moving instead.
  const followScrollToTop = (): void => {
    stopTopFollow();
    let last = -1;
    let still = 0;
    const step = (): void => {
      topFollowRaf = 0;
      if (controlActive || dateGroups.length === 0) return;
      const y = scroll.el.scrollTop;
      still = y === last ? still + 1 : 0;
      last = y;
      applyScrollPosition(y, true);
      if (y <= 0 || still >= 8) {
        setTopRevealed(false);
        return;
      }
      topFollowRaf = requestAnimationFrame(step);
    };
    topFollowRaf = requestAnimationFrame(step);
  };

  const setEngaged = (active: boolean): void => {
    if (controlActive === active) return;
    controlActive = active;
    wheel.classList.toggle('is-engaged', active);
    // The readout must show the date while scrubbing, never the back-to-top cue.
    renderReadout();
    // Back to reporting: land the dial on wherever the scroller actually is.
    if (!active && dateGroups.length > 0) applyScrollPosition(scroll.el.scrollTop, false);
    if (!active) armClose();
  };

  const stopRelease = (): void => {
    if (releaseRaf !== 0) cancelAnimationFrame(releaseRaf);
    releaseRaf = 0;
  };

  const stopProgressTween = (): void => {
    if (progressTweenRaf !== 0) cancelAnimationFrame(progressTweenRaf);
    progressTweenRaf = 0;
  };

  const abortWheelControl = (): void => {
    pendingTravel = null;
    if (dragWriteRaf !== 0) cancelAnimationFrame(dragWriteRaf);
    dragWriteRaf = 0;
    stopRelease();
    stopProgressTween();
    setEngaged(false);
  };

  const animateProgressTo = (
    target: number,
    duration: number,
    ease: (t: number) => number,
    onDone?: () => void
  ): void => {
    stopProgressTween();
    const from = dragProgress;
    const distance = Math.abs(target - from);
    const startedAt = performance.now();

    const step = (): void => {
      const elapsed = performance.now() - startedAt;
      const t = duration > 0 ? Math.min(elapsed / duration, 1) : 1;
      const progress = from + (target - from) * ease(t);
      dragProgress = progress;
      scrollToProgress(progress);
      tickAcross(progress, clamp(distance / 10, 0.2, 1));

      if (t < 1) {
        progressTweenRaf = requestAnimationFrame(step);
        return;
      }

      progressTweenRaf = 0;
      feedback.settle();
      setEngaged(false);
      onDone?.();
    };

    progressTweenRaf = requestAnimationFrame(step);
  };

  // Let go at `velocity` (dates/ms; zero for a hand that simply lifted). The
  // dial always comes to rest on a date, with that date's header level with
  // the readout at the viewport's midline.
  const release = (velocity: number): void => {
    stopRelease();
    stopProgressTween();

    const from = dragProgress;
    const projected = clamp(velocity / DECAY, -MAX_THROW, MAX_THROW);
    const target = clampProgress(Math.round(from + projected));
    const distance = target - from;

    const finish = (): void => {
      releaseRaf = 0;
      dragProgress = target;
      scrollToProgress(target);
      feedback.settle();
      setEngaged(false);
    };

    if (Math.abs(distance) < SETTLE_EPSILON || prefersReducedMotion) {
      finish();
      return;
    }

    const startedAt = performance.now();
    // Frames that fail to move the scroller: it is pinned at an end, or the
    // curve is into its sub-pixel tail. Either way there is nothing to show.
    let stalled = 0;

    const step = (): void => {
      const elapsed = performance.now() - startedAt;
      const remaining = distance * Math.exp(-DECAY * elapsed);
      if (Math.abs(remaining) < SETTLE_EPSILON) {
        finish();
        return;
      }

      const progress = target - remaining;
      dragProgress = progress;
      const moved = scrollToProgress(progress);
      // Instantaneous speed, against a brisk throw, sets the click volume.
      tickAcross(progress, clamp((Math.abs(remaining) * DECAY) / 0.03, 0.2, 1));

      stalled = moved ? 0 : stalled + 1;
      if (stalled >= 4) {
        finish();
        return;
      }

      releaseRaf = requestAnimationFrame(step);
    };

    releaseRaf = requestAnimationFrame(step);
  };

  const beginWheelControl = (): void => {
    stopRelease();
    stopProgressTween();
    stopTopFollow();
    // iOS drops programmatic scrollTop while the scroller is still coasting
    // under its own momentum, so a wheel grabbed mid-coast would write into
    // the void. Toggling overflow is the one way to halt that coast.
    if (performance.now() - lastScrollAt < 160) {
      const el = scroll.el;
      const previous = el.style.overflow;
      el.style.overflow = 'hidden';
      void el.offsetHeight;
      el.style.overflow = previous;
    }
    dragProgress = readProgress();
    lastTickedDate = Math.floor(dragProgress);
    dragSamples = [];
  };

  // The drag core, shared by the pointer handlers on the dial and the touch
  // handover from the phone's edge swipe.
  let dragThreshold = DRAG_THRESHOLD;

  const dragBegin = (clientX: number, clientY: number, threshold = DRAG_THRESHOLD): void => {
    beginWheelControl();
    // Cleared here, not only when a click arrives: a drag that ends without one
    // (released off-window, cancelled by the browser) must not swallow the next
    // real click on the wheel.
    suppressClick = false;
    dragStartX = clientX;
    dragStartY = clientY;
    dragStartProgress = dragProgress;
    dragMoved = false;
    dragThreshold = threshold;
    recordDragSample(dragProgress);
    armClose();
  };

  // True when the movement was taken by the dial.
  const dragMove = (clientX: number, clientY: number): boolean => {
    const travel = clientY - dragStartY;
    if (!dragMoved && phoneOpen) {
      // A swipe back towards the edge puts the wheel away.
      const across = clientX - dragStartX;
      if (across > 24 && Math.abs(travel) < 12) {
        dragPointerId = null;
        resetEdge();
        abortWheelControl();
        setPhoneOpen(false);
        return false;
      }
    }
    if (!dragMoved) {
      if (Math.abs(travel) < dragThreshold) return false;
      dragMoved = true;
      setEngaged(true);
    }
    pendingTravel = travel;
    if (dragWriteRaf === 0) dragWriteRaf = requestAnimationFrame(flushDrag);
    return true;
  };

  const dragEnd = (cancelled: boolean): void => {
    feedback.prime();
    flushDrag();
    armClose();
    // A press that never moved is a click, and click still means back to top.
    if (!dragMoved) return;
    suppressClick = true;
    release(cancelled ? 0 : dragSpeed());
  };

  const handlePointerDown = (event: PointerEvent): void => {
    if (dateGroups.length === 0) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // Mouse and pen presses count as activation; a touch start does not, and
    // is covered by the page-wide gesture-end listeners.
    feedback.prime();
    dragPointerId = event.pointerId;
    dragBegin(event.clientX, event.clientY);
    topButton?.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (dragPointerId !== event.pointerId) return;
    if (dragMove(event.clientX, event.clientY)) event.preventDefault();
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (dragPointerId !== event.pointerId) return;
    dragPointerId = null;
    if (topButton?.hasPointerCapture(event.pointerId)) {
      topButton.releasePointerCapture(event.pointerId);
    }
    dragEnd(false);
  };

  const handlePointerCancel = (event: PointerEvent): void => {
    if (dragPointerId !== event.pointerId) return;
    dragPointerId = null;
    dragEnd(true);
  };

  // Arrow keys step whole dates, so the wheel is usable without a pointer.
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (dateGroups.length === 0) return;
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;

    event.preventDefault();
    feedback.prime();
    beginWheelControl();
    const target = clampProgress(
      step > 0 ? Math.floor(dragProgress) + 1 : Math.ceil(dragProgress) - 1
    );
    setEngaged(true);
    animateProgressTo(target, prefersReducedMotion ? 0 : 220, easeOutCubic);
  };

  // Taking hold of the feed itself ends whatever the wheel was still doing.
  // A coast or snap keeps writing scrollTop for a while after release, and on
  // touch that fights the finger that has just landed on the list.
  // ── Phone: the wheel waits off the right edge ─────────────────────────
  // A swipe in from the edge follows the finger over the width of the arc,
  // then that same finger scrubs the dial without lifting. Letting go early
  // commits by velocity first and position second, the way a sheet does. It
  // slides back out after a pause, on a swipe back towards the edge, or on a
  // touch to the feed.
  //
  // Raw touch events on the feed's scroller, not pointer events on a strip:
  // iOS decides scroll-or-not on the first touchmove, and only a preventDefault
  // there claims the axis. Listening on the scroller means a vertical start in
  // the zone is simply left alone and scrolls the feed as it always did.
  const EDGE_ZONE_PX = 22;
  // Matches the closed --reveal in TimelineWheel.astro: the arc plus a margin.
  const CLOSED_MARGIN_PX = 8;
  const IDLE_CLOSE_MS = 2500;
  const AXIS_SLOP_PX = 6;
  // Vertical px a start may wander before a not-yet-horizontal touch is left
  // to the feed. A thumb coming in from the edge pivots, so this is generous.
  const VERTICAL_GIVE_PX = 12;
  // px/ms towards open or closed that decides a release on its own.
  const COMMIT_VELOCITY = 0.35;
  // Vertical px before the handed-over finger starts scrubbing, so the tail
  // of the swipe itself does not move the feed.
  const HANDOVER_THRESHOLD = 14;
  let phoneOpen = false;
  let closeTimer = 0;
  let edgeTouchId: number | null = null;
  let edgeStartX = 0;
  let edgeStartY = 0;
  let edgeStartScrollTop = 0;
  let edgeClaimed = false;
  let edgeHandedOver = false;
  let edgeSamples: { x: number; at: number }[] = [];

  function armClose(): void {
    clearTimeout(closeTimer);
    if (!phoneOpen) return;
    closeTimer = window.setTimeout(() => {
      if (dragPointerId !== null || edgeTouchId !== null || controlActive) {
        armClose();
        return;
      }
      setPhoneOpen(false);
    }, IDLE_CLOSE_MS);
  }

  function setPhoneOpen(open: boolean): void {
    phoneOpen = open;
    wheel.classList.toggle('is-open', open);
    clearTimeout(closeTimer);
    if (open) armClose();
  }

  function resetEdge(): void {
    edgeTouchId = null;
    edgeClaimed = false;
    edgeHandedOver = false;
    edgeSamples = [];
    wheel.classList.remove('is-sliding');
    wheel.style.removeProperty('--reveal');
  }

  const closedReveal = (): number => wheel.offsetWidth + CLOSED_MARGIN_PX;

  const findTouch = (touches: TouchList, id: number): Touch | null => {
    for (let i = 0; i < touches.length; i += 1) {
      if (touches[i].identifier === id) return touches[i];
    }
    return null;
  };

  // Over the last 100ms; zero when the finger was still before it lifted.
  const edgeVelocity = (): number => {
    const now = performance.now();
    const recent = edgeSamples.filter((sample) => now - sample.at <= 100);
    if (recent.length < 2) return 0;
    const first = recent[0];
    const last = recent[recent.length - 1];
    return last.at > first.at ? (last.x - first.x) / (last.at - first.at) : 0;
  };

  const handleEdgeTouchStart = (event: TouchEvent): void => {
    if (!isPhoneLayout() || dateGroups.length === 0 || edgeTouchId !== null || phoneOpen) return;
    const touch = event.changedTouches[0];
    if (window.innerWidth - touch.clientX > EDGE_ZONE_PX) return;
    if (wheel.contains(event.target as Node)) return;
    edgeTouchId = touch.identifier;
    edgeStartX = touch.clientX;
    edgeStartY = touch.clientY;
    edgeStartScrollTop = scroll.el.scrollTop;
    edgeClaimed = false;
    edgeHandedOver = false;
    edgeSamples = [{ x: touch.clientX, at: performance.now() }];
  };

  const handleEdgeTouchMove = (event: TouchEvent): void => {
    if (edgeTouchId === null) return;
    const touch = findTouch(event.changedTouches, edgeTouchId);
    if (!touch) return;

    if (edgeHandedOver) {
      if (dragMove(touch.clientX, touch.clientY)) event.preventDefault();
      return;
    }

    const dx = touch.clientX - edgeStartX;
    const dy = touch.clientY - edgeStartY;
    if (!edgeClaimed) {
      // Biased towards the swipe, the way a screen-edge pan is: anything
      // within about 60 degrees of horizontal and moving in claims it. Only a
      // clearly vertical start, or a scroll the browser already began, is
      // left to the feed.
      const inward = dx <= -AXIS_SLOP_PX && Math.abs(dx) >= Math.abs(dy) * 0.5;
      const vertical = Math.abs(dy) >= VERTICAL_GIVE_PX && !inward;
      if (vertical || scroll.el.scrollTop !== edgeStartScrollTop) {
        edgeTouchId = null;
        return;
      }
      if (!inward) return;
      edgeClaimed = true;
      stopRelease();
      wheel.classList.add('is-sliding');
    }
    event.preventDefault();

    edgeSamples.push({ x: touch.clientX, at: performance.now() });
    if (edgeSamples.length > 8) edgeSamples.shift();

    const closed = closedReveal();
    const reveal = clamp(closed + dx, 0, closed);
    wheel.style.setProperty('--reveal', `${reveal.toFixed(1)}px`);
    if (reveal > 0) return;

    // Fully in: hand the finger to the dial without lifting.
    edgeHandedOver = true;
    wheel.classList.remove('is-sliding');
    wheel.style.removeProperty('--reveal');
    setPhoneOpen(true);
    dragBegin(touch.clientX, touch.clientY, HANDOVER_THRESHOLD);
  };

  const handleEdgeTouchEnd = (event: TouchEvent): void => {
    if (edgeTouchId === null) return;
    const touch = findTouch(event.changedTouches, edgeTouchId);
    if (!touch) return;
    const cancelled = event.type === 'touchcancel';

    if (edgeHandedOver) {
      resetEdge();
      dragEnd(cancelled);
      return;
    }
    if (!edgeClaimed) {
      resetEdge();
      return;
    }

    const velocity = edgeVelocity();
    const closed = closedReveal();
    const reveal = clamp(closed + (touch.clientX - edgeStartX), 0, closed);
    resetEdge();
    if (cancelled) return;
    // A flick decides by its direction, a slow release by how far in it got.
    const open = velocity < -COMMIT_VELOCITY
      ? true
      : velocity > COMMIT_VELOCITY
        ? false
        : reveal < closed * 0.6;
    setPhoneOpen(open);
    if (open) feedback.settle();
  };

  const handleFeedGrab = (event: Event): void => {
    const target = event.target as Node;
    if (wheel.contains(target)) return;
    if (phoneOpen) setPhoneOpen(false);
    if (!controlActive || dragPointerId !== null) return;
    abortWheelControl();
  };

  scroll.el.addEventListener('touchstart', handleEdgeTouchStart, { passive: true, capture: true });
  scroll.el.addEventListener('touchmove', handleEdgeTouchMove, { passive: false, capture: true });
  scroll.el.addEventListener('touchend', handleEdgeTouchEnd, { capture: true });
  scroll.el.addEventListener('touchcancel', handleEdgeTouchEnd, { capture: true });
  topButton?.addEventListener('pointerdown', handlePointerDown);
  topButton?.addEventListener('pointermove', handlePointerMove);
  topButton?.addEventListener('pointerup', handlePointerUp);
  topButton?.addEventListener('pointercancel', handlePointerCancel);
  topButton?.addEventListener('keydown', handleKeyDown);
  scroll.el.addEventListener('pointerdown', handleFeedGrab, { passive: true });
  // iOS grants audio activation on touch end, click and keys, never on touch
  // start, so a drag that begins on a fresh page cannot unlock its own sound.
  // Any gesture that ends anywhere on the page primes the engine instead, so
  // the wheel is ready by the time a finger reaches it after any tap or key.
  const primeFeedback = (): void => feedback.prime();
  window.addEventListener('pointerup', primeFeedback, { passive: true, capture: true });
  window.addEventListener('touchend', primeFeedback, { passive: true, capture: true });
  window.addEventListener('keydown', primeFeedback, { passive: true, capture: true });
  scroll.el.addEventListener('wheel', handleFeedGrab, { passive: true });

  const setLoadingSpin = (active: boolean): void => {
    if (isLoadingSpin === active) return;
    isLoadingSpin = active;

    if (isLoadingSpin) {
      void createLoadingAnimation();
      return;
    }

    destroyLoadingAnimation();
    if (dateGroups.length > 0 && !controlActive) {
      applyScrollPosition(scroll.el.scrollTop, true);
    }
  };

  const syncLoadingSpinState = (): void => {
    // The pendulum is for an empty dial waiting on its first page. Pagination
    // marks the list busy as well, and taking the dial for that meant it
    // stopped following the scroll, swung, and jumped when the page landed —
    // every time the reader reached the end of what was loaded, and for the
    // whole of a slow fetch.
    const shouldSpin = wheel.classList.contains('is-loading')
      || feedEl.classList.contains('is-hidden')
      || (list.getAttribute('aria-busy') === 'true' && dateGroups.length === 0);
    setLoadingSpin(shouldSpin);
  };

  const handlePageScroll = (): void => {
    if (!scrollSyncActive || dateGroups.length === 0) return;
    // Track direction with a small dead zone, then reveal "↑ TOP" only while the
    // reader is scrolling back up past the first screen — the moment a jump to
    // the top is most likely wanted. Scrolling down (or nearing the top) hides it.
    lastScrollAt = performance.now();
    const y = scroll.el.scrollTop;
    const dy = y - dirAnchorY;
    if (Math.abs(dy) >= DIR_DELTA) {
      scrollDir = dy < 0 ? 'up' : 'down';
      dirAnchorY = y;
    }
    // Scrubbing upward is not "heading for the top" — it is aiming at a date.
    if (controlActive) {
      dirAnchorY = y;
      setTopRevealed(false);
    } else {
      setTopRevealed(scrollDir === 'up' && y > REVEAL_AT());
    }

    // Engaged already lights the wheel, and every class flip here restyles a
    // few hundred transitioning notches. Not on the drag path.
    if (!controlActive) {
      wheel.classList.add('is-scrolling');
      clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        wheel.classList.remove('is-scrolling');
      }, 150);
    }
    scheduleScrollPositionSync(true);
  };

  const destroyScrollSync = (): void => {
    if (scrollSyncActive) {
      scroll.events.removeEventListener('scroll', handlePageScroll);
      scrollSyncActive = false;
    }
    if (scrollSyncRaf !== 0) {
      cancelAnimationFrame(scrollSyncRaf);
      scrollSyncRaf = 0;
    }
    clearTimeout(scrollTimer);
    clearTimeout(hintPulseTimer);
    wheel.classList.remove('is-scrolling', 'is-hinting');

    if (listResizeObserver) {
      listResizeObserver.disconnect();
      listResizeObserver = null;
    }
  };

  const setupScrollSync = (): void => {
    destroyScrollSync();
    scrollSyncActive = true;
    dirAnchorY = scroll.el.scrollTop;
    scrollDir = 'down';
    scroll.events.addEventListener('scroll', handlePageScroll, { passive: true });
    listResizeObserver = new ResizeObserver(scheduleAnchorRefresh);
    listResizeObserver.observe(list);
    scheduleScrollPositionSync(false);
  };

  const rebuildWheel = (): void => {
    dateGroups = Array.from(list.querySelectorAll('.mood-date-group')) as HTMLElement[];
    dateItemCount = list.querySelectorAll('.mood-item').length;

    if (dateGroups.length === 0) {
      destroyScrollSync();
      cancelAnimationFrame(animationId);
      animationId = 0;
      wheel.classList.remove('is-visible');
      return;
    }

    createNotches();
    rebuildDateAnchors();
    setupScrollSync();
    applyScrollPosition(scroll.el.scrollTop, false);

    wheel.classList.add('is-visible');
  };

  const scheduleWheelSync = (): void => {
    if (wheelSyncRaf !== 0) return;
    wheelSyncRaf = requestAnimationFrame(() => {
      wheelSyncRaf = 0;
      const latestGroups = Array.from(list.querySelectorAll('.mood-date-group')) as HTMLElement[];
      const latestGroupCount = latestGroups.length;
      const latestItemCount = list.querySelectorAll('.mood-item').length;

      const groupChanged = latestGroupCount !== dateGroups.length;
      const itemsChanged = latestItemCount !== dateItemCount;
      if (!groupChanged && !itemsChanged) return;

      const prevCount = dateGroups.length;
      dateGroups = latestGroups;
      dateItemCount = latestItemCount;

      if (groupChanged) {
        createNotches(prevCount);
      }

      if (itemsChanged && prevCount > 0) {
        // Infinite scroll appends into the trailing group as well as adding new
        // ones, so the last existing date's weight can still be moving.
        applyGroupWeight(Math.min(prevCount - 1, dateGroups.length - 1));
      }

      rebuildDateAnchors();
      if (!scrollSyncActive) {
        setupScrollSync();
      }
      if (!controlActive) applyScrollPosition(scroll.el.scrollTop, false);
    });
  };

  const handleResize = (): void => {
    if (!isPhoneLayout()) setPhoneOpen(false);
    const isLoading = wheel.classList.contains('is-loading');
    if (dateGroups.length > 0 || isLoading) {
      wheel.classList.add('is-visible');
      if (dateGroups.length > 0) {
        rebuildDateAnchors();
        applyScrollPosition(scroll.el.scrollTop, false);
      }
      syncLoadingSpinState();
    } else {
      isLoadingSpin = false;
      destroyLoadingAnimation();
      abortWheelControl();
      if (animationId !== 0) {
        cancelAnimationFrame(animationId);
        animationId = 0;
      }
      wheel.classList.remove('is-visible');
    }
  };

  const handleWindowResize = (): void => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(handleResize, 100);
  };
  window.addEventListener('resize', handleWindowResize);

  const loadingStateObserver = new MutationObserver(() => {
    syncLoadingSpinState();
  });
  loadingStateObserver.observe(feedEl, { attributes: true, attributeFilter: ['class'] });
  loadingStateObserver.observe(list, { attributes: true, attributeFilter: ['aria-busy'] });

  const feedStartsHidden = feedEl.classList.contains('is-hidden');

  if (feedStartsHidden) {
    createSkeletonNotches();
    wheel.classList.add('is-visible', 'is-loading');
    syncLoadingSpinState();
  }

  const onFeedReady = (): void => {
    wheel.classList.remove('is-loading');
    destroyLoadingAnimation();
    rebuildWheel();
    syncLoadingSpinState();

    contentObserver = new MutationObserver(() => {
      scheduleWheelSync();
    });
    contentObserver.observe(list, { childList: true, subtree: true });
  };

  if (!feedStartsHidden) {
    onFeedReady();
  } else {
    const observer = new MutationObserver(() => {
      if (!feedEl.classList.contains('is-hidden')) {
        observer.disconnect();
        feedClassObserver = null;
        onFeedReady();
      }
    });
    feedClassObserver = observer;
    feedClassObserver.observe(feedEl, { attributes: true, attributeFilter: ['class'] });
  }

  return () => {
    topButton?.removeEventListener('click', handleTopClick);
    topButton?.removeEventListener('pointerdown', handlePointerDown);
    topButton?.removeEventListener('pointermove', handlePointerMove);
    topButton?.removeEventListener('pointerup', handlePointerUp);
    topButton?.removeEventListener('pointercancel', handlePointerCancel);
    topButton?.removeEventListener('keydown', handleKeyDown);
    scroll.el.removeEventListener('pointerdown', handleFeedGrab);
    scroll.el.removeEventListener('wheel', handleFeedGrab);
    abortWheelControl();
    window.removeEventListener('pointerup', primeFeedback, { capture: true });
    window.removeEventListener('touchend', primeFeedback, { capture: true });
    window.removeEventListener('keydown', primeFeedback, { capture: true });
    feedback.destroy();
    wheel.removeEventListener('pointerenter', handlePointerEnter);
    wheel.removeEventListener('pointerleave', handlePointerLeave);
    window.removeEventListener('resize', handleWindowResize);
    scroll.el.removeEventListener('touchstart', handleEdgeTouchStart, { capture: true });
    scroll.el.removeEventListener('touchmove', handleEdgeTouchMove, { capture: true });
    scroll.el.removeEventListener('touchend', handleEdgeTouchEnd, { capture: true });
    scroll.el.removeEventListener('touchcancel', handleEdgeTouchEnd, { capture: true });
    clearTimeout(closeTimer);
    clearTimeout(resizeTimer);
    destroyScrollSync();
    destroyLoadingAnimation();
    loadingStateObserver.disconnect();
    contentObserver?.disconnect();
    feedClassObserver?.disconnect();
    roll?.destroy();

    if (animationId !== 0) cancelAnimationFrame(animationId);
    if (anchorRefreshRaf !== 0) cancelAnimationFrame(anchorRefreshRaf);
    stopTopFollow();
    if (wheelSyncRaf !== 0) cancelAnimationFrame(wheelSyncRaf);
  };
}
