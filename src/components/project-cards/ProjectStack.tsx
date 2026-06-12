import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type PanInfo,
  type TargetAndTransition,
  type Transition,
} from "framer-motion";
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  projects,
  renderHero,
  StarBadge,
  type ShowcaseProject,
} from "@/components/project-cards/ProjectShowcaseCard";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// A space-frugal alternative to the flex-wrap grid: collapse every project
// into a single card's footprint and let the user flip through the deck.
//   L0 — a peeking pile: back cards poke out below, so the deck reads as a deck
//   L1 — click any card to open a full-size horizontal gallery, slide between
//        every project (arrows / drag / keyboard / dots), same enlarged size
// ---------------------------------------------------------------------------

const visibleDepth = 3; // four projects → depths 0..3, all peek
const autoAdvanceMs = 5500; // slow enough to read; hover pauses it entirely
const dragAdvanceThreshold = 70;
const mobileSwipeAxisLockPx = 8;
const mobileSwipeAxisBias = 1.08;
const mobileSwipeDistancePx = 54;
const mobileSwipeFlickVelocity = 0.34;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

// Shared chrome. Warm neutral, never pure black/white: a single cream surface
// that frames the dark hero like a matte in light mode, a soft near-black in
// dark. Uniform across the deck — the heroes carry the colour, the paper stays
// quiet. Layered ambient+key shadow instead of one harsh slab; hairline borders.
const surface =
  "border bg-[#fbfaf7] border-stone-900/[0.055] " +
  "shadow-[0_1px_1px_rgba(28,25,23,0.04),0_5px_10px_-4px_rgba(28,25,23,0.06),0_20px_44px_-18px_rgba(28,25,23,0.20)] " +
  "dark:bg-[#141518] dark:border-white/[0.05] " +
  "dark:shadow-[0_1px_2px_rgba(0,0,0,0.5),0_14px_30px_-12px_rgba(0,0,0,0.6),0_44px_90px_-34px_rgba(0,0,0,0.55)]";

// The hero sits as a framed tile inside the surface — the cream/near-black mat
// mediates the dark image into the card, no blunt two-tone seam.
const heroFrame =
  "pointer-events-none relative w-full select-none overflow-hidden " +
  "ring-1 ring-inset ring-stone-900/[0.06] dark:ring-white/[0.07]";

// ---------------------------------------------------------------------------
// L0 — collapsed card in the pile
// ---------------------------------------------------------------------------

function CardFace({
  project,
  active,
  onOpen,
}: {
  project: ShowcaseProject;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-[22px] p-2 text-left text-stone-900 dark:text-stone-100",
        surface,
      )}
    >
      {/* Hero is inert: it must not steal drags or let the image be selected. */}
      <div className={cn("aspect-[16/10] rounded-[15px]", heroFrame)}>
        {renderHero(project.hero, active)}
      </div>

      <div className="px-3.5 pb-3 pt-4">
        <p className="font-code text-[10px] uppercase tracking-[0.16em] text-stone-400 dark:text-white/35">
          {project.type}
        </p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <h3 className="font-display text-[22px] font-extrabold leading-none tracking-[-0.01em]">
            {project.name}
          </h3>
          {project.stars != null && <StarBadge stars={project.stars} />}
        </div>

        <p className="mt-2.5 font-sans text-[13.5px] leading-relaxed text-stone-500 dark:text-white/55">
          {project.blurb}
        </p>

        <div className="mt-4 flex items-center justify-end">
          <button
            type="button"
            // Only the front card is interactive; back cards are inert until promoted.
            onClick={
              active
                ? (e) => {
                    e.stopPropagation();
                    onOpen();
                  }
                : undefined
            }
            tabIndex={active ? 0 : -1}
            className="inline-flex items-center gap-1 font-code text-[11px] font-semibold uppercase tracking-wide text-stone-400 outline-none transition-colors hover:text-stone-700 focus-visible:text-stone-700 dark:text-white/45 dark:hover:text-white/85 dark:focus-visible:text-white/85"
          >
            Tell me more
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// L1 — full-size story card, one per project, laid out in the gallery
// ---------------------------------------------------------------------------

function StoryCard({
  project,
  active,
  dim = false,
}: {
  project: ShowcaseProject;
  active: boolean;
  dim?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex max-h-[86vh] w-full flex-col rounded-[26px] p-2.5 text-stone-900 transition-opacity duration-300 dark:text-stone-100",
        dim ? "opacity-45" : "opacity-100",
        surface,
      )}
    >
      <div className={cn("aspect-[16/9] shrink-0 rounded-[18px]", heroFrame)}>
        {renderHero(project.hero, active)}
      </div>

      <div
        data-project-story-body
        className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pb-3 pt-5 sm:px-5 sm:pb-4"
      >
        <p className="mb-2 font-code text-[11px] uppercase tracking-[0.16em] text-stone-400 dark:text-white/40">
          {project.type}
        </p>
        <div className="flex items-center justify-between gap-3">
          <h3 className="min-w-0 font-display text-[26px] font-extrabold leading-none tracking-[-0.01em] sm:text-[36px]">
            {project.name}
          </h3>
          {project.stars != null && <StarBadge stars={project.stars} />}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-stone-900/10 bg-stone-900/[0.035] px-3 py-1 font-code text-[11px] text-stone-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/65"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-5 space-y-4">
          {project.story.map((paragraph, i) => (
            <p
              key={i}
              className="font-sans text-[15px] leading-relaxed text-stone-600 dark:text-white/75"
            >
              {paragraph}
            </p>
          ))}
        </div>

        <a
          href={project.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-7 inline-flex items-center gap-1.5 border-b border-stone-900/25 pb-0.5 font-code text-[13px] font-semibold uppercase tracking-wide text-stone-700 transition-colors hover:border-stone-900 hover:text-stone-900 dark:border-white/25 dark:text-white/80 dark:hover:border-white dark:hover:text-white"
        >
          View on GitHub
          <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

function useViewportWidth() {
  // Init to a stable constant so server and client render identically — reading
  // window.innerWidth here instead would mismatch on hydration, and React 19
  // refuses to patch the resulting attributes ("won't be patched up"), freezing
  // mobile at the desktop geometry. The real width is read in the mount effect,
  // whose setVw flips state (1280 → actual) and triggers the patching re-render.
  const [vw, setVw] = useState(1280);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return vw;
}

function useLockedBodyScroll() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = {
      rootOverflow: root.style.overflow,
      rootOverscroll: root.style.overscrollBehavior,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
    };

    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      root.style.overflow = previous.rootOverflow;
      root.style.overscrollBehavior = previous.rootOverscroll;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.left = previous.bodyLeft;
      body.style.right = previous.bodyRight;
      body.style.width = previous.bodyWidth;
      body.style.overflow = previous.bodyOverflow;
      body.style.overscrollBehavior = previous.bodyOverscroll;
      window.scrollTo(0, scrollY);
    };
  }, []);
}

function StoryGallery({
  index,
  setIndex,
  onClose,
  vw,
  compact,
}: {
  index: number;
  setIndex: (n: number) => void;
  onClose: () => void;
  vw: number;
  compact: boolean;
}) {
  return compact ? (
    <MobileStoryGallery
      index={index}
      setIndex={setIndex}
      onClose={onClose}
      vw={vw}
    />
  ) : (
    <DesktopStoryGallery
      index={index}
      setIndex={setIndex}
      onClose={onClose}
      vw={vw}
    />
  );
}

function DesktopStoryGallery({
  index,
  setIndex,
  onClose,
  vw,
}: {
  index: number;
  setIndex: (n: number) => void;
  onClose: () => void;
  vw: number;
}) {
  const reduce = useReducedMotion();
  const count = projects.length;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<GalleryScrubberHandle>(null);
  const latestProgressRef = useRef(count > 1 ? index / (count - 1) : 0);
  const [cur, setCurState] = useState(index);
  const [entered, setEntered] = useState(false);
  const curRef = useRef(index);
  useLockedBodyScroll();

  const cardW = Math.min(620, Math.round(vw * 0.52));
  const gap = 40;
  const stride = cardW + gap;
  const trackPx = Math.min(Math.round(vw * 0.72), 340);
  const sidePad = Math.max(0, Math.round((vw - cardW) / 2));

  const setCur = useCallback(
    (n: number) => {
      const next = clamp(n, 0, count - 1);
      if (curRef.current === next) return;
      curRef.current = next;
      setCurState(next);
    },
    [count],
  );

  const go = useCallback(
    (n: number) => {
      const target = clamp(n, 0, count - 1);
      scrollerRef.current?.scrollTo({
        left: target * stride,
        behavior: reduce ? "auto" : "smooth",
      });
    },
    [count, reduce, stride],
  );

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const max = el.scrollWidth - el.clientWidth;
        const nextProgress = max > 0 ? clamp(el.scrollLeft / max, 0, 1) : 0;
        latestProgressRef.current = nextProgress;
        scrubberRef.current?.setProgress(nextProgress);
        setCur(Math.round(el.scrollLeft / stride));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [setCur, stride]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollLeft = curRef.current * stride;
  }, [stride]);

  useLayoutEffect(() => {
    if (reduce) return setEntered(true);
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, [reduce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(curRef.current + 1);
      else if (e.key === "ArrowLeft") go(curRef.current - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  useEffect(() => setIndex(cur), [cur, setIndex]);

  if (typeof document === "undefined") return null;

  const onScrub = (ratio: number, commit: boolean) => {
    const el = scrollerRef.current;
    if (!el) return;
    if (commit) {
      go(Math.round(ratio * (count - 1)));
    } else {
      el.scrollLeft = ratio * (el.scrollWidth - el.clientWidth);
    }
  };

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Project gallery"
      className="fixed inset-0 z-[100] overflow-hidden"
      style={{ overscrollBehavior: "none" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.18, ease: "easeOut" }}
    >
      <style>{".gallery-scroller::-webkit-scrollbar{display:none}"}</style>

      <div
        className="absolute inset-0 bg-[#11100e] dark:bg-black"
        onClick={onClose}
      />

      <div
        ref={scrollerRef}
        data-project-gallery-scroller
        className="gallery-scroller absolute inset-0 flex items-center overflow-x-auto overflow-y-hidden"
        style={{
          gap,
          paddingInline: sidePad,
          scrollPaddingInline: sidePad,
          scrollSnapType: reduce ? "none" : "x mandatory",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y pinch-zoom",
          scrollbarWidth: "none",
          transform: entered ? "scale(1)" : "scale(0.96)",
          transformOrigin: "center center",
          transition: reduce
            ? undefined
            : "transform 0.3s cubic-bezier(0.2,0.7,0,1)",
        }}
        onClick={(e) => {
          if (e.target === scrollerRef.current) onClose();
        }}
      >
        {projects.map((project, i) => (
          <div
            key={project.id}
            className={cn("shrink-0 snap-center", i !== cur && "cursor-pointer")}
            style={{ width: cardW, transform: "translateZ(0)" }}
            onClick={() => i !== curRef.current && go(i)}
          >
            <StoryCard project={project} active={i === cur} dim={i !== cur} />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/[0.08] text-white/85 transition-colors hover:bg-white/[0.14] hover:text-white sm:right-6 sm:top-6"
      >
        <X className="h-4 w-4" />
      </button>

      <GalleryArrow side="left" disabled={cur === 0} onClick={() => go(cur - 1)} />
      <GalleryArrow
        side="right"
        disabled={cur === count - 1}
        onClick={() => go(cur + 1)}
      />

      <GalleryScrubber
        ref={scrubberRef}
        count={count}
        cur={cur}
        initialProgress={latestProgressRef.current}
        trackPx={trackPx}
        onScrub={onScrub}
      />
    </motion.div>,
    document.body,
  );
}

function MobileStoryGallery({
  index,
  setIndex,
  onClose,
  vw,
}: {
  index: number;
  setIndex: (n: number) => void;
  onClose: () => void;
  vw: number;
}) {
  const reduce = useReducedMotion();
  const count = projects.length;
  const [cur, setCurState] = useState(index);
  const [direction, setDirection] = useState(1);
  const curRef = useRef(index);
  const cardRef = useRef<HTMLDivElement>(null);
  const dragSurfaceRef = useRef<HTMLDivElement>(null);
  const resetTimerRef = useRef<number | undefined>(undefined);
  const gestureRef = useRef({
    active: false,
    axis: null as "x" | "y" | null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastT: 0,
    velocity: 0,
    raf: 0,
    pendingX: 0,
    appliedX: 0,
    pointerId: null as number | null,
  });
  const cardW = Math.round(vw * 0.88);
  const trackPx = Math.min(Math.round(vw * 0.72), 340);
  useLockedBodyScroll();

  const setCur = useCallback(
    (n: number) => {
      const next = clamp(n, 0, count - 1);
      if (next === curRef.current) return;
      setDirection(next > curRef.current ? 1 : -1);
      curRef.current = next;
      setCurState(next);
      setIndex(next);
    },
    [count, setIndex],
  );

  const resetDragOffset = useCallback(
    (animated: boolean) => {
      const el = dragSurfaceRef.current;
      if (!el) return;

      window.clearTimeout(resetTimerRef.current);
      el.style.transition =
        animated && !reduce
          ? "transform 180ms cubic-bezier(0.2,0.7,0,1)"
          : "none";
      el.style.transform = "translate3d(0,0,0)";

      if (animated && !reduce) {
        resetTimerRef.current = window.setTimeout(() => {
          if (dragSurfaceRef.current) dragSurfaceRef.current.style.transition = "";
        }, 190);
      }
    },
    [reduce],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setCur(curRef.current + 1);
      else if (e.key === "ArrowLeft") setCur(curRef.current - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, setCur]);

  useEffect(() => {
    resetDragOffset(false);
  }, [cur, resetDragOffset]);

  const applyGestureX = useCallback(() => {
    const gesture = gestureRef.current;
    gesture.raf = 0;
    gesture.appliedX = gesture.pendingX;
    const surface = dragSurfaceRef.current;
    if (!surface) return;
    surface.style.transition = "none";
    surface.style.transform = `translate3d(${gesture.pendingX}px,0,0)`;
  }, []);

  const setGestureX = useCallback(
    (next: number) => {
      const gesture = gestureRef.current;
      const atStart = curRef.current === 0 && next > 0;
      const atEnd = curRef.current === count - 1 && next < 0;
      gesture.pendingX = atStart || atEnd ? next * 0.35 : next;
      if (!gesture.raf) gesture.raf = requestAnimationFrame(applyGestureX);
    },
    [applyGestureX, count],
  );

  const beginGesture = useCallback((clientX: number, clientY: number) => {
    const gesture = gestureRef.current;
    gesture.active = true;
    gesture.axis = null;
    gesture.startX = clientX;
    gesture.startY = clientY;
    gesture.lastX = clientX;
    gesture.lastT = performance.now();
    gesture.velocity = 0;
    gesture.pendingX = 0;
    gesture.appliedX = 0;
  }, []);

  const moveGesture = useCallback(
    (
      clientX: number,
      clientY: number,
      preventDefault: () => void,
    ) => {
      const gesture = gestureRef.current;
      if (!gesture.active) return;

      const dx = clientX - gesture.startX;
      const dy = clientY - gesture.startY;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);

      if (gesture.axis == null) {
        if (ax < mobileSwipeAxisLockPx && ay < mobileSwipeAxisLockPx) return;
        gesture.axis = ax > ay * mobileSwipeAxisBias ? "x" : "y";
        if (gesture.axis === "y") return;
      }

      if (gesture.axis !== "x") return;

      preventDefault();
      const now = performance.now();
      gesture.velocity = (clientX - gesture.lastX) / Math.max(1, now - gesture.lastT);
      gesture.lastX = clientX;
      gesture.lastT = now;
      setGestureX(dx);
    },
    [setGestureX],
  );

  const finishGesture = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture.active) return;
    gesture.active = false;

    if (gesture.raf) {
      cancelAnimationFrame(gesture.raf);
      applyGestureX();
    }

    let changed = false;
    const current = curRef.current;
    if (gesture.axis === "x") {
      if (
        current < count - 1 &&
        (gesture.appliedX < -mobileSwipeDistancePx ||
          gesture.velocity < -mobileSwipeFlickVelocity)
      ) {
        setCur(current + 1);
        changed = true;
      } else if (
        current > 0 &&
        (gesture.appliedX > mobileSwipeDistancePx ||
          gesture.velocity > mobileSwipeFlickVelocity)
      ) {
        setCur(current - 1);
        changed = true;
      }
    }

    if (!changed) resetDragOffset(gesture.axis === "x");
    gesture.axis = null;
    gesture.pendingX = 0;
    gesture.appliedX = 0;
    gesture.pointerId = null;
  }, [applyGestureX, count, resetDragOffset, setCur]);

  const onPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary || event.button !== 0) return;
      gestureRef.current.pointerId = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      beginGesture(event.clientX, event.clientY);
    },
    [beginGesture],
  );

  const onPointerMoveCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (gestureRef.current.pointerId !== event.pointerId) return;
      moveGesture(event.clientX, event.clientY, () => event.preventDefault());
    },
    [moveGesture],
  );

  const onPointerEndCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (gestureRef.current.pointerId !== event.pointerId) return;
      finishGesture();
    },
    [finishGesture],
  );

  useEffect(
    () => () => {
      window.clearTimeout(resetTimerRef.current);
      const gesture = gestureRef.current;
      if (gesture.raf) cancelAnimationFrame(gesture.raf);
    },
    [],
  );

  useEffect(() => {
    if ("PointerEvent" in window) return;
    const el = cardRef.current;
    if (!el) return;

    const passiveCapture: AddEventListenerOptions = { passive: true, capture: true };
    const activeCapture: AddEventListenerOptions = { passive: false, capture: true };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      beginGesture(touch.clientX, touch.clientY);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      moveGesture(touch.clientX, touch.clientY, () => event.preventDefault());
    };

    el.addEventListener("touchstart", onTouchStart, passiveCapture);
    el.addEventListener("touchmove", onTouchMove, activeCapture);
    el.addEventListener("touchend", finishGesture, passiveCapture);
    el.addEventListener("touchcancel", finishGesture, passiveCapture);

    return () => {
      el.removeEventListener("touchstart", onTouchStart, passiveCapture);
      el.removeEventListener("touchmove", onTouchMove, activeCapture);
      el.removeEventListener("touchend", finishGesture, passiveCapture);
      el.removeEventListener("touchcancel", finishGesture, passiveCapture);
    };
  }, [beginGesture, finishGesture, moveGesture]);

  const activeProject = projects[cur] ?? projects[0];
  const cardVariants = {
    enter: (dir: number) => ({
      x: reduce ? 0 : dir * 42,
      opacity: reduce ? 1 : 0,
      scale: reduce ? 1 : 0.985,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (dir: number) => ({
      x: reduce ? 0 : dir * -42,
      opacity: reduce ? 1 : 0,
      scale: reduce ? 1 : 0.985,
    }),
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal forceMount>
        <Dialog.Overlay asChild forceMount>
          <div
            className="fixed inset-0 z-[100] bg-[#11100e] dark:bg-black"
            onClick={onClose}
          />
        </Dialog.Overlay>

        <Dialog.Content
          asChild
          forceMount
          aria-label="Project gallery"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <motion.div
            className="fixed inset-0 z-[101] flex items-center justify-center overflow-hidden px-4 py-14 sm:px-10 sm:py-10"
            style={{ overscrollBehavior: "none" }}
            initial={{ opacity: 0, scale: reduce ? 1 : 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.985 }}
            transition={{ duration: reduce ? 0 : 0.18, ease: [0.2, 0.7, 0, 1] }}
          >
            <Dialog.Title className="sr-only">Project gallery</Dialog.Title>

            <div
              ref={cardRef}
              data-project-gallery-card
              className="relative"
              onPointerDownCapture={onPointerDownCapture}
              onPointerMoveCapture={onPointerMoveCapture}
              onPointerUpCapture={onPointerEndCapture}
              onPointerCancelCapture={onPointerEndCapture}
              style={{
                width: cardW,
                maxWidth: "100%",
                touchAction: "pan-y pinch-zoom",
              }}
            >
              <AnimatePresence initial={false} custom={direction} mode="popLayout">
                <motion.div
                  key={activeProject.id}
                  custom={direction}
                  variants={cardVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    type: "spring",
                    stiffness: reduce ? 1000 : 420,
                    damping: reduce ? 100 : 36,
                    mass: 0.9,
                  }}
                  className="relative will-change-transform"
                  style={{
                    WebkitBackfaceVisibility: "hidden",
                    backfaceVisibility: "hidden",
                  }}
                >
                  <div
                    ref={dragSurfaceRef}
                    className="will-change-transform"
                    style={{
                      transform: "translate3d(0,0,0)",
                      WebkitBackfaceVisibility: "hidden",
                      backfaceVisibility: "hidden",
                    }}
                  >
                    <StoryCard project={activeProject} active />
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/[0.08] text-white/85 transition-colors hover:bg-white/[0.14] hover:text-white sm:right-6 sm:top-6"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>

            <GalleryArrow
              side="left"
              disabled={cur === 0}
              onClick={() => setCur(cur - 1)}
            />
            <GalleryArrow
              side="right"
              disabled={cur === count - 1}
              onClick={() => setCur(cur + 1)}
            />

            <GalleryScrubber
              count={count}
              cur={cur}
              trackPx={trackPx}
              syncWithIndex
              onScrub={(ratio, commit) => {
                if (commit) setCur(Math.round(ratio * (count - 1)));
              }}
            />
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type GalleryScrubberHandle = {
  setProgress: (progress: number) => void;
};

type GalleryScrubberProps = {
  count: number;
  cur: number;
  initialProgress?: number;
  trackPx: number;
  syncWithIndex?: boolean;
  onScrub: (ratio: number, commit: boolean) => void;
};

const GalleryScrubber = forwardRef<GalleryScrubberHandle, GalleryScrubberProps>(function GalleryScrubber({
  count,
  cur,
  trackPx,
  initialProgress,
  syncWithIndex = false,
  onScrub,
}, forwardedRef) {
  const railRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(initialProgress ?? (count > 1 ? cur / (count - 1) : 0));
  const lastRatio = useRef(progressRef.current);
  const [dragging, setDragging] = useState(false);
  const pillPx = trackPx / count;
  const travelPx = trackPx - pillPx;

  const applyProgress = useCallback(
    (next: number) => {
      const progress = clamp(next, 0, 1);
      progressRef.current = progress;
      const x = progress * travelPx;
      if (pillRef.current) {
        pillRef.current.style.transform = `translate3d(${x}px,0,0)`;
      }
    },
    [travelPx],
  );

  useImperativeHandle(forwardedRef, () => ({ setProgress: applyProgress }), [applyProgress]);

  useLayoutEffect(() => {
    applyProgress(progressRef.current);
  }, [applyProgress]);

  useLayoutEffect(() => {
    if (!syncWithIndex || dragging) return;
    applyProgress(count > 1 ? cur / (count - 1) : 0);
  }, [applyProgress, count, cur, dragging, syncWithIndex]);

  const at = useCallback(
    (clientX: number) => {
      const el = railRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const ratio = clamp((clientX - r.left) / r.width, 0, 1);
      lastRatio.current = ratio;
      applyProgress(ratio);
      onScrub(ratio, false);
    },
    [applyProgress, onScrub],
  );

  const commitKeyboardStep = (next: number) => {
    if (count <= 1) return;
    const ratio = clamp(next, 0, count - 1) / (count - 1);
    lastRatio.current = ratio;
    applyProgress(ratio);
    onScrub(ratio, true);
  };

  return (
    <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
      <div
        ref={railRef}
        role="slider"
        aria-label="Project"
        aria-valuemin={1}
        aria-valuemax={count}
        aria-valuenow={cur + 1}
        tabIndex={0}
        className="relative h-2.5 cursor-grab touch-none select-none rounded-full bg-white/15 active:cursor-grabbing"
        style={{ width: trackPx }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            commitKeyboardStep(cur + 1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            commitKeyboardStep(cur - 1);
          }
        }}
        onPointerDown={(event) => {
          setDragging(true);
          railRef.current?.setPointerCapture(event.pointerId);
          at(event.clientX);
        }}
        onPointerMove={(event) => dragging && at(event.clientX)}
        onPointerUp={() => {
          setDragging(false);
          onScrub(lastRatio.current, true);
        }}
        onPointerCancel={() => setDragging(false)}
      >
        <div
          ref={pillRef}
          className="absolute inset-y-0 left-0 rounded-full bg-white/90"
          style={{
            width: pillPx,
            transform: `translate3d(${progressRef.current * travelPx}px,0,0)`,
            transition: dragging
              ? "none"
              : "transform 120ms cubic-bezier(0.2,0.7,0,1)",
          }}
        />
      </div>
    </div>
  );
});

function GalleryArrow({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Previous" : "Next"}
      className={cn(
        "absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-stone-900/35 text-white backdrop-blur-md transition-all hover:bg-stone-900/55 sm:grid",
        side === "left" ? "left-6" : "right-6",
        disabled && "pointer-events-none opacity-0",
      )}
    >
      {side === "left" ? (
        <ChevronLeft className="h-5 w-5" />
      ) : (
        <ChevronRight className="h-5 w-5" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Stack poses
// ---------------------------------------------------------------------------

type Fan = { x: number; y: number; tilt: number };

function getStackPose(depth: number, fan: Fan): TargetAndTransition {
  const layer = Math.min(depth, visibleDepth);

  // Right-fanned reveal: the front card stays centred (x 0); each card behind
  // drifts right and tilts so a strip of its own content peeks along the edge.
  // No `filter` here: animating blur forces Safari to re-raster the 3D scene
  // every frame — opacity alone carries the depth cue.
  return {
    x: layer * fan.x,
    y: layer * fan.y,
    z: -layer * 36,
    scale: 1 - layer * 0.015,
    rotateX: 0,
    rotateZ: layer * fan.tilt,
    opacity: depth > visibleDepth ? 0 : 1 - layer * 0.03,
  };
}

function getEntrancePose(): TargetAndTransition {
  return {
    x: 0,
    y: 46,
    z: 0,
    scale: 0.84,
    rotateX: 0,
    rotateZ: 0,
    opacity: 0,
  };
}

// How long the front card takes to recede to the back of the fan.
const dealMs = 720;

// No fade, no arc — the front card just slides to the rear pose while staying
// fully opaque. The trick is z-order: the instant it leaves, it becomes the
// lowest card in the deck, so the three cards now in front of it cover its
// travel. You see it slip under the pile and reappear at the back of the fan,
// never floating across the top, never blinking out. A soft deceleration curve
// keeps the slide silky and bounce-free.
const dealTransition: Transition = {
  duration: 0.72,
  ease: [0.32, 0.72, 0, 1],
};

export default function ProjectStack({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const ids = useMemo(() => projects.map((p) => p.id), []);
  const [order, setOrder] = useState(ids);
  const [hasEntered, setHasEntered] = useState(false);
  const [paused, setPaused] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  // The card currently being dealt to the back, so we can give it the lift arc
  // and float it above the rest while it travels.
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const dealTimer = useRef<number | undefined>(undefined);
  const shouldReduce = mounted && reduce === true;

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), []);

  // Responsive geometry. On phones the fan must stay inside the viewport, so the
  // card shrinks and the fan tightens; `shift` recenters the fanned mass so the
  // deck reads centered instead of biased right (the cause of the "off-center"
  // overflow on small screens).
  const vw = useViewportWidth();
  const compact = vw < 640;
  const fanX = compact ? 12 : 22;
  const fan: Fan = {
    x: fanX,
    y: compact ? 4 : 5,
    tilt: compact ? 2.2 : 3.2,
  };
  const cardMax = compact ? Math.min(Math.round(vw * 0.74), 340) : 400;
  // Region height tracks the tallest card (+ the fan's downward peek) so the
  // deck has no dead space below it — the dots sit right under the cards and the
  // block reads balanced against the heading, not floating high.
  const regionH = compact ? 390 : 462;

  const advance = () => {
    if (order.length < 2) return;
    if (!shouldReduce) {
      setLeavingId(order[0]);
      window.clearTimeout(dealTimer.current);
      dealTimer.current = window.setTimeout(() => setLeavingId(null), dealMs);
    }
    setOrder((o) => (o.length < 2 ? o : [...o.slice(1), o[0]]));
  };
  const promote = (id: string) =>
    setOrder((o) => [id, ...o.filter((x) => x !== id)]);
  const openGallery = (id: string) =>
    setGalleryIndex(projects.findIndex((p) => p.id === id));

  // Reset on each pointer-down, set true once a drag actually moves — onTap then
  // reliably opens only on a real tap, never on the tail of a stack flip.
  const draggedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Entrance: fan the deck out once after mount.
  useEffect(() => {
    if (shouldReduce) return setHasEntered(true);
    const t = window.setTimeout(() => setHasEntered(true), 1000);
    return () => window.clearTimeout(t);
  }, [shouldReduce]);

  // Slow auto-advance, suspended while hovered or while the gallery is open.
  useEffect(() => {
    if (
      shouldReduce ||
      !hasEntered ||
      paused ||
      galleryIndex != null ||
      projects.length < 2
    )
      return;
    const t = window.setTimeout(advance, autoAdvanceMs);
    return () => window.clearTimeout(t);
  }, [shouldReduce, hasEntered, paused, galleryIndex, order]);

  useEffect(() => () => window.clearTimeout(dealTimer.current), []);

  const ordered = order
    .map((id) => byId.get(id))
    .filter((p): p is ShowcaseProject => Boolean(p));

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > dragAdvanceThreshold) advance();
  };

  return (
    <div
      data-project-stack={mounted ? "hydrated" : "ssr"}
      className={cn("relative mx-auto w-full", className)}
      style={{ maxWidth: cardMax + 40 }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div
        className="relative w-full"
        style={{ height: regionH, perspective: 1200 }}
        aria-roledescription="carousel"
        aria-label="Projects"
      >
        {ordered.map((project, depth) => {
          const active = depth === 0;
          // The card just dealt away. It keeps the lowest z-index (it is now the
          // rear card), so it slides to the back hidden behind the rest.
          const leaving = project.id === leavingId;
          return (
            <motion.article
              key={project.id}
              // !touch-pan-y overrides framer's auto `touch-action: none` for
              // both-axis drag: on touch, vertical still scrolls the page and only
              // horizontal drags; a mouse ignores touch-action and drags freely.
              className="absolute inset-x-0 top-0 mx-auto w-full select-none"
              style={{
                maxWidth: cardMax,
                // Horizontal flip only. Vertical touch starts still scroll the
                // page, which matters on mobile where this card fills the viewport.
                touchAction: "pan-y pinch-zoom",
                transformStyle: "preserve-3d",
                transformOrigin: "center center",
                // Promote the moving card to its own GPU layer and skip back-face
                // rasterisation — Safari then translates a cached texture instead
                // of repainting the card + its heavy shadow on every drag frame.
                willChange: active ? "transform" : "auto",
                WebkitBackfaceVisibility: "hidden",
                backfaceVisibility: "hidden",
                zIndex: projects.length - depth,
                pointerEvents: leaving
                  ? "none"
                  : depth <= visibleDepth
                    ? "auto"
                    : "none",
                cursor: active ? "grab" : "pointer",
              }}
              initial={getEntrancePose()}
              animate={getStackPose(depth, fan)}
              transition={
                leaving
                  ? dealTransition
                  : {
                      type: "spring",
                      stiffness: hasEntered ? 150 : 96,
                      damping: hasEntered ? 24 : 24,
                      mass: 0.9,
                      // During a cycle the deck ripples forward: front card
                      // leads, those behind follow a beat later.
                      delay: !hasEntered
                        ? shouldReduce
                          ? 0
                          : depth * 0.08
                        : leavingId
                          ? depth * 0.05
                          : 0,
                    }
              }
              // Desktop keeps the playful free-card feel. Touch screens keep the
              // gesture bounded so the deck never hijacks page scroll.
              drag={active && !shouldReduce ? (compact ? "x" : true) : false}
              dragDirectionLock={compact}
              dragSnapToOrigin
              dragElastic={0.5}
              whileHover={active && !shouldReduce && !compact ? { y: -6 } : undefined}
              whileDrag={{ cursor: "grabbing" }}
              onPointerDown={() => {
                draggedRef.current = false;
              }}
              onDragStart={(e) => e.preventDefault()}
              onDrag={() => {
                draggedRef.current = true;
              }}
              onDragEnd={onDragEnd}
              // onTap opens L1, but only when this gesture wasn't a drag — a flick
              // flips the stack and never falls through to opening.
              onTap={() => {
                if (draggedRef.current) return;
                if (active) openGallery(project.id);
                else promote(project.id);
              }}
              aria-hidden={!active}
            >
              <CardFace
                project={project}
                active={active}
                onOpen={() => openGallery(project.id)}
              />
            </motion.article>
          );
        })}
      </div>

      {/* Position dots: which project is on top, jump straight to any. */}
      <div className="mt-5 flex items-center justify-center gap-2">
        {projects.map((p) => {
          const isTop = order[0] === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => promote(p.id)}
              aria-label={`Show ${p.name}`}
              aria-current={isTop}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                // Dots sit on the page background, not the card — track the theme.
                isTop
                  ? "w-6 bg-[hsl(var(--foreground)/0.85)]"
                  : "w-1.5 bg-[hsl(var(--foreground)/0.22)] hover:bg-[hsl(var(--foreground)/0.45)]",
              )}
            />
          );
        })}
      </div>

      <AnimatePresence>
        {galleryIndex != null && (
          <StoryGallery
            index={galleryIndex}
            setIndex={(n) => setGalleryIndex(n)}
            onClose={() => setGalleryIndex(null)}
            vw={vw}
            compact={compact}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
