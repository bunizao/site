import type gsap from 'gsap';
import { slotText, type SlotOptions, type SlotTextController } from 'slot-text';
import 'slot-text/style.css';
import { getTimelineDateState } from '@/features/mood/client/timeline-date-tracker';

type GsapModule = typeof gsap;

export function initMoodTimelineWheel(): void {
  const wheel = document.querySelector('[data-timeline-wheel]') as HTMLElement | null;
  const dial = document.querySelector('[data-timeline-dial]') as HTMLElement | null;
  const label = document.querySelector('[data-timeline-label]') as HTMLElement | null;
  const feedEl = document.querySelector('[data-mood-feed]') as HTMLElement | null;
  const list = document.querySelector('[data-mood-list]') as HTMLElement | null;

  if (!wheel || !dial || !label || !feedEl || !list) return;

  const isDesktop = (): boolean => window.innerWidth >= 1024;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The wheel doubles as a back-to-top control: clicking it returns to the
  // feed top, and the existing scroll sync winds the dial back as you go.
  const topButton = wheel.querySelector('[data-timeline-top]') as HTMLButtonElement | null;
  topButton?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  });

  // The readout is a slot-text display: the active date rolls in as you scroll,
  // and rolls to "↑ TOP" to expose the back-to-top role — on hover, and as a
  // brief self-reveal each time scrolling settles deep in the feed (taught at
  // the exact moment the jump becomes useful, then rolled back to the date).
  const TOP_TEXT = '↑ TOP';
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
  let isHoveringWheel = false;
  let hintSettleTimer = 0;
  let hintPulseTimer = 0;
  // The auto "↑ TOP" cue fires at most once per descent: armed near the top,
  // spent when it shows, re-armed only after the reader scrolls back up. This
  // keeps it from churning on every pause — the rarity is the point.
  let topHintArmed = true;

  const showDate = (text: string): void => {
    currentDateText = text;
    roll ??= slotText(label, '', dateRoll);
    // Hold "↑ TOP" while the pointer rests on the wheel; the date catches up on leave.
    if (isHoveringWheel) return;
    roll.set(text, dateRoll);
  };

  // A brief glow pulse on the wheel when the cue fires — the rare moment earns
  // a little sensory weight instead of arriving silently.
  const pulseWheelHint = (): void => {
    if (prefersReducedMotion) return;
    wheel.classList.add('is-hinting');
    clearTimeout(hintPulseTimer);
    hintPulseTimer = window.setTimeout(() => wheel.classList.remove('is-hinting'), 900);
  };

  const flashTopHint = (): void => {
    if (isHoveringWheel || !isDesktop() || !roll || !topHintArmed) return;
    if (window.scrollY < window.innerHeight * 1.2) return;
    topHintArmed = false;
    roll.flash(TOP_TEXT, { revertAfter: 1600, enter: topRoll, exit: dateReturnRoll });
    pulseWheelHint();
  };

  wheel.addEventListener('mouseenter', () => {
    isHoveringWheel = true;
    roll?.set(TOP_TEXT, topRoll);
  });
  wheel.addEventListener('mouseleave', () => {
    isHoveringWheel = false;
    roll?.set(currentDateText, dateReturnRoll);
  });

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
      const majorNotch = document.createElement('div');
      majorNotch.className = 'timeline-notch is-major';
      majorNotch.dataset.dateIndex = String(dateIdx);
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
      const y = window.scrollY + rect.top;
      return Number.isFinite(y) ? y : window.scrollY;
    });
    cachedFeedBottomY = window.scrollY + feedEl.getBoundingClientRect().bottom;
  };

  const applyScrollPosition = (scrollY: number, animate = true): void => {
    const totalDates = dateGroups.length;
    if (totalDates === 0) return;

    if (dateAnchors.length !== totalDates) return;

    const dateState = getTimelineDateState({
      anchors: dateAnchors,
      feedBottomY: cachedFeedBottomY,
      scrollY,
      viewportHeight: window.innerHeight,
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
      applyScrollPosition(window.scrollY, animate);
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
      applyScrollPosition(window.scrollY, true);
    }
  };

  const syncLoadingSpinState = (): void => {
    const shouldSpin = wheel.classList.contains('is-loading')
      || feedEl.classList.contains('is-hidden')
      || list.getAttribute('aria-busy') === 'true';
    setLoadingSpin(shouldSpin);
  };

  const handleWindowScroll = (): void => {
    if (!scrollSyncActive || dateGroups.length === 0 || !isDesktop()) return;
    // Re-arm the cue once the reader returns near the top (hysteresis against the
    // 1.2-viewport fire line so a single descent never double-fires).
    if (window.scrollY < window.innerHeight * 0.5) topHintArmed = true;
    wheel.classList.add('is-scrolling');
    clearTimeout(scrollTimer);
    clearTimeout(hintSettleTimer);
    scrollTimer = window.setTimeout(() => {
      wheel.classList.remove('is-scrolling');
    }, 150);
    // The live date rolls in while scrolling; the "↑ TOP" cue only flashes once
    // motion settles, so it never fights the date readout.
    hintSettleTimer = window.setTimeout(flashTopHint, 450);
    scheduleScrollPositionSync(true);
  };

  const destroyScrollSync = (): void => {
    if (scrollSyncActive) {
      window.removeEventListener('scroll', handleWindowScroll);
      scrollSyncActive = false;
    }
    if (scrollSyncRaf !== 0) {
      cancelAnimationFrame(scrollSyncRaf);
      scrollSyncRaf = 0;
    }
    clearTimeout(scrollTimer);
    clearTimeout(hintSettleTimer);
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
    window.addEventListener('scroll', handleWindowScroll, { passive: true });
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
    applyScrollPosition(window.scrollY, false);

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

      rebuildDateAnchors();
      if (!scrollSyncActive) {
        setupScrollSync();
      }
      applyScrollPosition(window.scrollY, false);
    });
  };

  const handleResize = (): void => {
    const isLoading = wheel.classList.contains('is-loading');
    if (isDesktop() && (dateGroups.length > 0 || isLoading)) {
      wheel.classList.add('is-visible');
      if (dateGroups.length > 0) {
        rebuildDateAnchors();
        applyScrollPosition(window.scrollY, false);
      }
      syncLoadingSpinState();
    } else {
      isLoadingSpin = false;
      destroyLoadingAnimation();
      if (animationId !== 0) {
        cancelAnimationFrame(animationId);
        animationId = 0;
      }
      wheel.classList.remove('is-visible');
    }
  };

  window.addEventListener('resize', () => {
    clearTimeout((window as any)._wheelResizeTimer);
    (window as any)._wheelResizeTimer = setTimeout(handleResize, 100);
  });

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

    const contentObserver = new MutationObserver(() => {
      scheduleWheelSync();
    });
    contentObserver.observe(list, { childList: true, subtree: true });
  };

  if (!feedStartsHidden) {
    onFeedReady();
  } else {
    const feedClassObserver = new MutationObserver(() => {
      if (!feedEl.classList.contains('is-hidden')) {
        feedClassObserver.disconnect();
        onFeedReady();
      }
    });
    feedClassObserver.observe(feedEl, { attributes: true, attributeFilter: ['class'] });
  }
}
