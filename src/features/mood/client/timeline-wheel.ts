import type gsap from 'gsap';
import { slotText, type SlotOptions, type SlotTextController } from 'slot-text';
import 'slot-text/style.css';
import {
  getScrollYForDateProgress,
  getTimelineDateState,
} from '@/features/mood/client/timeline-date-tracker';
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

  const isDesktop = (): boolean => root.hasAttribute('data-timeline-wheel-compact') || window.innerWidth >= 1024;
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
  // True while the wheel itself is driving the scroll (drag, coast, snap,
  // keyboard step or shuffle) rather than merely reporting it.
  let controlActive = false;
  let hintPulseTimer = 0;
  let dirAnchorY = 0;
  let scrollDir: 'up' | 'down' = 'down';

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

  const handleMouseEnter = (): void => {
    isHoveringWheel = true;
    renderReadout();
  };
  const handleMouseLeave = (): void => {
    isHoveringWheel = false;
    renderReadout();
  };
  wheel.addEventListener('mouseenter', handleMouseEnter);
  wheel.addEventListener('mouseleave', handleMouseLeave);

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

  const parseDateKey = (dateKey: string): Date | null => {
    const [year, month, day] = dateKey.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const formatDate = (dateKey: string): string => {
    const date = parseDateKey(dateKey);
    if (!date) return '';
    const now = new Date();

    if (date.toDateString() === now.toDateString()) return 'Today';

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
  };

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
    showDate(formatDate(dateKey));

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

    currentRotation = targetRotation;
    applyDialTransform();
  };

  const scheduleScrollPositionSync = (animate = true): void => {
    if (scrollSyncRaf !== 0) return;
    scrollSyncRaf = requestAnimationFrame(() => {
      scrollSyncRaf = 0;
      if (!scrollSyncActive || dateGroups.length === 0 || !isDesktop()) return;
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

  const PX_PER_DATE = 26; // drag distance that advances the dial by one date
  const DRAG_THRESHOLD = 4; // px of travel before a press stops being a click
  const MOMENTUM_FRICTION = 0.955; // per-frame decay of a flick
  const MOMENTUM_CUTOFF = 0.015; // dates/frame at which coasting gives up
  // dates/frame. With the friction above this caps a hard throw at roughly
  // eleven days of travel — far enough to feel like fast travel, near enough
  // that you can still see where you landed.
  const MAX_FLICK_SPEED = 0.5;
  const SNAP_MS = 260;
  const VELOCITY_WINDOW_MS = 90;
  const FRAME_MS = 16.7;

  const feedback = createWheelFeedback();

  let dragPointerId: number | null = null;
  let dragStartY = 0;
  let dragStartProgress = 0;
  let dragProgress = 0;
  let dragMoved = false;
  let dragVelocity = 0; // dates per frame
  let dragSamples: { at: number; progress: number }[] = [];
  let momentumRaf = 0;
  let progressTweenRaf = 0;
  let lastTickedDate = 0;
  let suppressClick = false;

  const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max);

  const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
  const easeOutQuart = (t: number): number => 1 - (1 - t) ** 4;

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

  // Drag speed in dates per frame, measured across a time window rather than
  // between two adjacent events. A 120Hz trackpad delivers moves less than a
  // millisecond apart, and dividing by that gap turns an ordinary drag into a
  // flick across the whole year.
  const dragSpeed = (): number => {
    if (dragSamples.length < 2) return 0;
    const first = dragSamples[0];
    const last = dragSamples[dragSamples.length - 1];
    const elapsed = last.at - first.at;
    if (elapsed < 8) return 0;
    return ((last.progress - first.progress) / elapsed) * FRAME_MS;
  };

  const setEngaged = (active: boolean): void => {
    if (controlActive === active) return;
    controlActive = active;
    wheel.classList.toggle('is-engaged', active);
    // The readout must show the date while scrubbing, never the back-to-top cue.
    renderReadout();
  };

  const stopMomentum = (): void => {
    if (momentumRaf !== 0) cancelAnimationFrame(momentumRaf);
    momentumRaf = 0;
  };

  const stopProgressTween = (): void => {
    if (progressTweenRaf !== 0) cancelAnimationFrame(progressTweenRaf);
    progressTweenRaf = 0;
  };

  const abortWheelControl = (): void => {
    stopMomentum();
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

  // Detents: the dial always comes to rest on a date, with that date's header
  // level with the readout at the viewport's midline.
  const snapToNearestDate = (): void => {
    stopMomentum();
    const target = clampProgress(Math.round(dragProgress));
    if (Math.abs(target - dragProgress) < 0.01) {
      feedback.settle();
      setEngaged(false);
      return;
    }
    animateProgressTo(target, prefersReducedMotion ? 0 : SNAP_MS, easeOutCubic);
  };

  const stepMomentum = (): void => {
    momentumRaf = 0;
    dragVelocity *= MOMENTUM_FRICTION;

    if (Math.abs(dragVelocity) < MOMENTUM_CUTOFF) {
      snapToNearestDate();
      return;
    }

    const next = clampProgress(dragProgress + dragVelocity);
    const moved = scrollToProgress(next);
    dragProgress = next;
    tickAcross(next, clamp(Math.abs(dragVelocity) * 2, 0, 1));

    if (!moved) {
      snapToNearestDate();
      return;
    }

    momentumRaf = requestAnimationFrame(stepMomentum);
  };

  const beginWheelControl = (): void => {
    stopMomentum();
    stopProgressTween();
    dragProgress = readProgress();
    lastTickedDate = Math.floor(dragProgress);
    dragSamples = [];
  };

  const handlePointerDown = (event: PointerEvent): void => {
    if (!isDesktop() || dateGroups.length === 0) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    beginWheelControl();
    // Cleared here, not only when a click arrives: a drag that ends without one
    // (released off-window, cancelled by the browser) must not swallow the next
    // real click on the wheel.
    suppressClick = false;
    dragPointerId = event.pointerId;
    dragStartY = event.clientY;
    dragStartProgress = dragProgress;
    dragMoved = false;
    dragVelocity = 0;
    recordDragSample(dragProgress);
    topButton?.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (dragPointerId !== event.pointerId) return;

    const travel = event.clientY - dragStartY;
    if (!dragMoved) {
      if (Math.abs(travel) < DRAG_THRESHOLD) return;
      dragMoved = true;
      setEngaged(true);
    }

    event.preventDefault();

    const next = clampProgress(dragStartProgress + travel / PX_PER_DATE);
    dragProgress = next;
    recordDragSample(next);
    scrollToProgress(next);
    tickAcross(next, clamp(Math.abs(dragSpeed()) * 4, 0, 1));
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (dragPointerId !== event.pointerId) return;
    dragPointerId = null;
    if (topButton?.hasPointerCapture(event.pointerId)) {
      topButton.releasePointerCapture(event.pointerId);
    }

    // A press that never moved is a click, and click still means back to top.
    if (!dragMoved) return;
    suppressClick = true;

    const velocity = clamp(dragSpeed(), -MAX_FLICK_SPEED, MAX_FLICK_SPEED);
    if (!prefersReducedMotion && Math.abs(velocity) > MOMENTUM_CUTOFF) {
      dragVelocity = velocity;
      momentumRaf = requestAnimationFrame(stepMomentum);
      return;
    }

    snapToNearestDate();
  };

  const handlePointerCancel = (event: PointerEvent): void => {
    if (dragPointerId !== event.pointerId) return;
    dragPointerId = null;
    if (dragMoved) snapToNearestDate();
  };

  // Arrow keys step whole dates, so the wheel is usable without a pointer.
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (dateGroups.length === 0) return;
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;

    event.preventDefault();
    beginWheelControl();
    const target = clampProgress(
      step > 0 ? Math.floor(dragProgress) + 1 : Math.ceil(dragProgress) - 1
    );
    setEngaged(true);
    animateProgressTo(target, prefersReducedMotion ? 0 : 220, easeOutCubic);
  };

  // Spin to a random loaded date — the feed's own gacha. Only the pages already
  // in the DOM are in the draw; the wheel deliberately does not fetch to widen
  // it, because a random jump that stalls on the network is not a fun surprise.
  const shuffleButton = wheel.querySelector('[data-timeline-shuffle]') as HTMLButtonElement | null;

  const highlightLanding = (dateIndex: number): void => {
    const item = dateGroups[dateIndex]?.querySelector('.mood-item');
    if (!(item instanceof HTMLElement)) return;
    item.classList.remove('mood-item--anchored');
    requestAnimationFrame(() => {
      item.classList.add('mood-item--anchored');
      window.setTimeout(() => item.classList.remove('mood-item--anchored'), 1800);
    });
  };

  const handleShuffle = (): void => {
    const total = dateGroups.length;
    if (total < 2) return;

    beginWheelControl();
    const current = Math.round(dragProgress);
    let target = current;
    while (target === current) target = Math.floor(Math.random() * total);

    setEngaged(true);
    const distance = Math.abs(target - dragProgress);
    // Long throws take longer, but not proportionally — a spin across a year
    // should still land inside a couple of seconds.
    const duration = prefersReducedMotion ? 0 : clamp(600 + distance * 70, 600, 1900);
    animateProgressTo(target, duration, easeOutQuart, () => highlightLanding(target));
  };

  topButton?.addEventListener('pointerdown', handlePointerDown);
  topButton?.addEventListener('pointermove', handlePointerMove);
  topButton?.addEventListener('pointerup', handlePointerUp);
  topButton?.addEventListener('pointercancel', handlePointerCancel);
  topButton?.addEventListener('keydown', handleKeyDown);
  shuffleButton?.addEventListener('click', handleShuffle);

  const setLoadingSpin = (active: boolean): void => {
    if (!isDesktop()) {
      isLoadingSpin = false;
      destroyLoadingAnimation();
      if (animationId !== 0) {
        cancelAnimationFrame(animationId);
        animationId = 0;
      }
      return;
    }

    if (isLoadingSpin === active) return;
    isLoadingSpin = active;

    if (isLoadingSpin) {
      void createLoadingAnimation();
      return;
    }

    destroyLoadingAnimation();
    if (dateGroups.length > 0) {
      applyScrollPosition(scroll.el.scrollTop, true);
    }
  };

  const syncLoadingSpinState = (): void => {
    const shouldSpin = wheel.classList.contains('is-loading')
      || feedEl.classList.contains('is-hidden')
      || list.getAttribute('aria-busy') === 'true';
    setLoadingSpin(shouldSpin);
  };

  const handlePageScroll = (): void => {
    if (!scrollSyncActive || dateGroups.length === 0 || !isDesktop()) return;
    // Track direction with a small dead zone, then reveal "↑ TOP" only while the
    // reader is scrolling back up past the first screen — the moment a jump to
    // the top is most likely wanted. Scrolling down (or nearing the top) hides it.
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

    wheel.classList.add('is-scrolling');
    clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      wheel.classList.remove('is-scrolling');
    }, 150);
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

    if (isDesktop()) {
      wheel.classList.add('is-visible');
    } else {
      wheel.classList.remove('is-visible');
    }
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
      applyScrollPosition(scroll.el.scrollTop, false);
    });
  };

  const handleResize = (): void => {
    const isLoading = wheel.classList.contains('is-loading');
    if (isDesktop() && (dateGroups.length > 0 || isLoading)) {
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

  if (isDesktop() && feedStartsHidden) {
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
    shuffleButton?.removeEventListener('click', handleShuffle);
    abortWheelControl();
    feedback.destroy();
    wheel.removeEventListener('mouseenter', handleMouseEnter);
    wheel.removeEventListener('mouseleave', handleMouseLeave);
    window.removeEventListener('resize', handleWindowResize);
    clearTimeout(resizeTimer);
    destroyScrollSync();
    destroyLoadingAnimation();
    loadingStateObserver.disconnect();
    contentObserver?.disconnect();
    feedClassObserver?.disconnect();
    roll?.destroy();

    if (animationId !== 0) cancelAnimationFrame(animationId);
    if (anchorRefreshRaf !== 0) cancelAnimationFrame(anchorRefreshRaf);
    if (wheelSyncRaf !== 0) cancelAnimationFrame(wheelSyncRaf);
  };
}
