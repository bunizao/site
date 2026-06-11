import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
const swipeAxisLockPx = 8;
const swipeAxisBias = 1.14;
const swipeFlickVelocity = 0.34;
const swipeProjectionMs = 190;
const swipeDistanceRatio = 0.16;

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
        // Neighbours sit quietly behind the focused card; the centred one is full.
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

function StoryGallery({
  index,
  setIndex,
  onClose,
}: {
  index: number;
  setIndex: (n: number) => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const vw = useViewportWidth();
  const compact = vw < 640;
  const count = projects.length;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<GalleryScrubberHandle>(null);
  const touchGestureActiveRef = useRef(false);
  const latestProgressRef = useRef(count > 1 ? index / (count - 1) : 0);
  const [cur, setCurState] = useState(index);
  const [entered, setEntered] = useState(false);
  // curRef mirrors `cur` so size-change re-centering and click handlers read the
  // live value without re-subscribing the scroll listener.
  const curRef = useRef(index);
  const setCur = useCallback(
    (n: number) => {
      const next = clamp(n, 0, count - 1);
      if (curRef.current === next) return;
      curRef.current = next;
      setCurState(next);
    },
    [count],
  );

  const cardW = compact
    ? Math.round(vw * 0.84)
    : Math.min(620, Math.round(vw * 0.52));
  const gap = compact ? 14 : 40;
  const stride = cardW + gap;
  const trackPx = Math.min(Math.round(vw * 0.72), 340);
  // Symmetric padding lets the first and last card snap to the exact centre, so
  // scrollLeft 0 == card 0 centred, and card i sits at i * stride.
  const sidePad = Math.max(0, Math.round((vw - cardW) / 2));

  const go = useCallback((n: number) => {
    const t = clamp(n, 0, count - 1);
    scrollerRef.current?.scrollTo({
      left: t * stride,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [count, reduce, stride]);

  // Native scroll drives the source of truth: read scrollLeft, derive the live
  // index + continuous progress (for the scrubber). rAF-throttled, passive.
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

        if (!touchGestureActiveRef.current) {
          setCur(Math.round(el.scrollLeft / stride));
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [setCur, stride]);

  // Mobile Safari is awful at nested horizontal gallery + vertical card body
  // arbitration. Axis-lock once, then do the minimum: horizontal swipes drive
  // scrollLeft directly; vertical swipes stay native so the story body scrolls.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    let active = false;
    let axis: "x" | "y" | null = null;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let raf = 0;
    let pendingLeft: number | null = null;

    const snap = () => {
      el.style.scrollSnapType = reduce ? "none" : "x mandatory";
    };
    const unsnap = () => {
      el.style.scrollSnapType = "none";
    };
    const flushScrollLeft = () => {
      raf = 0;
      if (pendingLeft == null) return;
      el.scrollLeft = pendingLeft;
      pendingLeft = null;
    };
    const setScrollLeft = (next: number) => {
      const max = Math.max(0, el.scrollWidth - el.clientWidth);
      pendingLeft = clamp(next, 0, max);
      if (!raf) raf = requestAnimationFrame(flushScrollLeft);
    };
    const finish = () => {
      if (!active) return;
      active = false;
      touchGestureActiveRef.current = false;

      if (raf) {
        cancelAnimationFrame(raf);
        flushScrollLeft();
      }

      if (axis === "x") {
        const moved = el.scrollLeft - startScrollLeft;
        const projected = el.scrollLeft + velocity * swipeProjectionMs;
        let target = Math.round(projected / stride);

        if (
          target === curRef.current &&
          (Math.abs(velocity) > swipeFlickVelocity ||
            Math.abs(moved) > stride * swipeDistanceRatio)
        ) {
          target += Math.sign(moved || velocity);
        }

        snap();
        go(target);
      } else {
        snap();
      }

      axis = null;
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      active = true;
      axis = null;
      startX = touch.clientX;
      startY = touch.clientY;
      startScrollLeft = el.scrollLeft;
      lastX = touch.clientX;
      lastT = performance.now();
      velocity = 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!active || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = startX - touch.clientX;
      const dy = startY - touch.clientY;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);

      if (axis == null) {
        if (ax < swipeAxisLockPx && ay < swipeAxisLockPx) return;
        axis = ax > ay * swipeAxisBias ? "x" : "y";
        if (axis === "x") {
          touchGestureActiveRef.current = true;
          unsnap();
        } else {
          snap();
          return;
        }
      }

      if (axis !== "x") return;

      event.preventDefault();
      const now = performance.now();
      velocity = (lastX - touch.clientX) / Math.max(1, now - lastT);
      lastX = touch.clientX;
      lastT = now;
      setScrollLeft(startScrollLeft + dx);
    };

    const passiveCapture: AddEventListenerOptions = { passive: true, capture: true };
    const activeCapture: AddEventListenerOptions = { passive: false, capture: true };
    el.addEventListener("touchstart", onTouchStart, passiveCapture);
    el.addEventListener("touchmove", onTouchMove, activeCapture);
    el.addEventListener("touchend", finish, passiveCapture);
    el.addEventListener("touchcancel", finish, passiveCapture);

    return () => {
      el.removeEventListener("touchstart", onTouchStart, passiveCapture);
      el.removeEventListener("touchmove", onTouchMove, activeCapture);
      el.removeEventListener("touchend", finish, passiveCapture);
      el.removeEventListener("touchcancel", finish, passiveCapture);
      if (raf) cancelAnimationFrame(raf);
      touchGestureActiveRef.current = false;
    };
  }, [go, reduce, stride]);

  // Jump to the opened card before paint (no animated slide-in from card 0), and
  // keep the current card centred when the viewport / card width changes.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollLeft = curRef.current * stride;
  }, [stride]);

  // Entrance zoom: scale the whole track up from the tapped card's footprint.
  // CSS transform/opacity transition — compositor-driven, no JS per frame.
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
    // iOS-proof scroll lock: Safari ignores `overflow: hidden` for touch
    // scrolling, so the page leaks behind the modal. Pin the body with
    // position: fixed and restore the scroll offset on close.
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      Object.assign(body.style, prev);
      window.scrollTo(0, scrollY);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  useEffect(() => setIndex(cur), [cur, setIndex]);

  if (typeof document === "undefined") return null;

  // Scrubber joystick: ratio 0..1 → scrollLeft. While dragging, set scrollLeft
  // directly for 1:1 tracking; on release, snap to the nearest card.
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
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <style>{".gallery-scroller::-webkit-scrollbar{display:none}"}</style>

      {/* Solid scrim, no backdrop-filter: a viewport-sized blur is the single
          most expensive thing to sustain on mobile Safari (heat + dropped
          frames). A flat dark wash reads the same and costs nothing per frame. */}
      <div
        className="absolute inset-0 bg-stone-900/85 dark:bg-black/88"
        onClick={onClose}
      />

      {/* Native horizontal snap scroller — owns the swipe gesture (so it can't
          chain to the page) and runs on the compositor. A tap on the empty
          padding (target === the scroller itself) closes. */}
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
          // Keep the cards fully opaque (the dialog's own opacity fade handles
          // the appear). Only a subtle scale settle here — fading the scroller
          // separately made the card translucent against the dark scrim: a mess.
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
        {projects.map((p, i) => (
          <div
            key={p.id}
            className={cn("shrink-0 snap-center", i !== cur && "cursor-pointer")}
            style={{ width: cardW, transform: "translateZ(0)" }}
            onClick={() => i !== curRef.current && go(i)}
          >
            <StoryCard project={p} active={i === cur} dim={i !== cur} />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-stone-900/35 text-white/85 backdrop-blur-md transition-colors hover:bg-stone-900/55 hover:text-white sm:right-6 sm:top-6"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Arrows on desktop only — on mobile the scrubber below is the control. */}
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

// A draggable segment pill: drag anywhere along the rail to scrub. Scroll
// progress updates the pill imperatively, so a card swipe does not re-render the
// whole gallery on every frame.
type GalleryScrubberHandle = {
  setProgress: (progress: number) => void;
};

type GalleryScrubberProps = {
  count: number;
  cur: number;
  initialProgress: number;
  trackPx: number;
  onScrub: (ratio: number, commit: boolean) => void;
};

const GalleryScrubber = forwardRef<GalleryScrubberHandle, GalleryScrubberProps>(function GalleryScrubber({
  count,
  cur,
  initialProgress,
  trackPx,
  onScrub,
}, forwardedRef) {
  const railRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(initialProgress);
  const lastRatio = useRef(initialProgress);
  const [dragging, setDragging] = useState(false);
  const pillPx = trackPx / count;
  const travelPx = trackPx - pillPx;

  const applyProgress = useCallback((next: number) => {
    const progress = clamp(next, 0, 1);
    progressRef.current = progress;
    const x = progress * travelPx;
    if (pillRef.current) {
      pillRef.current.style.transform = `translate3d(${x}px,0,0)`;
    }
  }, [travelPx]);

  useImperativeHandle(forwardedRef, () => ({ setProgress: applyProgress }), [applyProgress]);

  useLayoutEffect(() => {
    applyProgress(progressRef.current);
  }, [applyProgress]);

  const at = useCallback((clientX: number) => {
    const el = railRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ratio = clamp((clientX - r.left) / r.width, 0, 1);
    lastRatio.current = ratio;
    applyProgress(ratio);
    onScrub(ratio, false);
  }, [applyProgress, onScrub]);

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
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            commitKeyboardStep(cur + 1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            commitKeyboardStep(cur - 1);
          }
        }}
        onPointerDown={(e) => {
          setDragging(true);
          railRef.current?.setPointerCapture(e.pointerId);
          at(e.clientX);
        }}
        onPointerMove={(e) => dragging && at(e.clientX)}
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
          />
        )}
      </AnimatePresence>
    </div>
  );
}
