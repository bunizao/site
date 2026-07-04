import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
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
//        every project (native scroll-snap; arrows / drag / wheel / keyboard)
// ---------------------------------------------------------------------------

const visibleDepth = 3; // four projects → depths 0..3, all peek
const autoAdvanceMs = 5500; // slow enough to read; hover pauses it entirely
const dragAdvanceThreshold = 70;

// Mobile L0 swipe tuning. The axis lock is biased hard toward horizontal so a
// thumb-arced flick still flips the card instead of leaking to page scroll:
// `x` wins unless the vertical component beats the horizontal by this factor.
const swipeAxisLockPx = 6; // movement before an axis is committed
const swipeAxisBias = 1.5; // x wins while ax * bias > ay (≈ up to 56° off-axis)
const swipeCommitPx = 52; // travel that flips the deck
const swipeFlickVelocity = 0.3; // px/ms flick that flips regardless of distance
const tapSlopPx = 8; // movement under this with no lock counts as a tap

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

// Project accent (from site.ts) feeds --hero-accent on the frame; globals.css
// resolves it to the light/dark triplet. Heroes that don't use an accent skip it.
function accentProps(project: ShowcaseProject) {
  if (!project.accent) return {};
  return {
    "data-hero-accent": "",
    style: {
      "--ha-l": project.accent.light,
      "--ha-d": project.accent.dark,
    } as CSSProperties,
  };
}

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
      <div className={cn("aspect-[16/10] rounded-[15px]", heroFrame)} {...accentProps(project)}>
        {renderHero(project.hero, active)}
      </div>

      <div className="px-3.5 pb-3 pt-4">
        <p className="font-code text-[10px] uppercase tracking-[0.16em] text-stone-400 dark:text-white/35">
          {project.type}
        </p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="font-display text-[22px] font-extrabold leading-none tracking-[-0.01em]">
            {project.name}
          </div>
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
}: {
  project: ShowcaseProject;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full select-none flex-col rounded-[26px] p-2.5 text-stone-900 dark:text-stone-100",
        surface,
      )}
    >
      <div className={cn("aspect-[16/9] shrink-0 rounded-[18px]", heroFrame)} {...accentProps(project)}>
        {renderHero(project.hero, active)}
      </div>

      <div
        data-project-story-body
        className="min-h-0 flex-1 select-none overflow-y-auto overscroll-contain px-4 pb-3 pt-5 sm:px-5 sm:pb-4"
        // pan-y scrolls this body; pan-x stays free so a horizontal swipe that
        // starts on the text still pans the outer gallery scroller.
        style={{ touchAction: "pan-x pan-y" }}
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
      rootScrollBehavior: root.style.scrollBehavior,
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
      // The page styles html with `scroll-behavior: smooth`; restoring the
      // scroll offset through that would visibly glide from the top of the
      // page back down ("close → jump to top → scroll back"). Force an
      // instant restore, then put the inline value back.
      root.style.scrollBehavior = "auto";
      window.scrollTo(0, scrollY);
      root.style.scrollBehavior = previous.rootScrollBehavior;
    };
  }, []);
}

type GalleryOrigin = { x: number; y: number; width: number; height: number };

// ---------------------------------------------------------------------------
// L1 gallery — one native scroll-snap track for every input. Touch pans it on
// the compositor, trackpads pan it natively, the mouse gets drag-to-scroll and
// wheel paging, the scrubber drives scrollLeft. Card scale/opacity are written
// straight from scrollLeft each frame, so the in-between motion always tracks
// the finger — no discrete card swaps, no layout, transform/opacity only.
// ---------------------------------------------------------------------------

function StoryGallery({
  index,
  setIndex,
  onClose,
  vw,
  compact,
  origin,
}: {
  index: number;
  setIndex: (n: number) => void;
  onClose: () => void;
  vw: number;
  compact: boolean;
  origin: GalleryOrigin | null;
}) {
  const reduce = useReducedMotion();
  const count = projects.length;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrubberRef = useRef<GalleryScrubberHandle>(null);
  const latestProgressRef = useRef(count > 1 ? index / (count - 1) : 0);
  const snapTimer = useRef<number | undefined>(undefined);
  // The grow-in scales an ancestor of the cards. Anything promoted to its own
  // GPU layer underneath (snap container, per-card `scale()`/`will-change`)
  // gets re-composited with subpixel rounding every frame → the card shivers.
  // So through the zoom the cards stay un-promoted and flat; `entered` flips
  // on the entrance's onAnimationComplete and only then do we layer them for
  // scroll-linked posing and turn on scroll-snap.
  const enteredRef = useRef(false);
  const [entered, setEntered] = useState(false);
  const [cur, setCurState] = useState(index);
  const curRef = useRef(index);
  useLockedBodyScroll();

  const cardW = compact
    ? Math.round(vw * 0.86)
    : Math.min(620, Math.round(vw * 0.52));
  const gap = compact ? 16 : 40;
  const stride = cardW + gap;
  const trackPx = Math.min(Math.round(vw * 0.58), 240);
  const sidePad = Math.max(0, Math.round((vw - cardW) / 2));
  // Uniform height for every card: content differences no longer make outer
  // cards taller than inner ones, and svh keeps the card on screen even when
  // the Safari URL bar eats the viewport. Long stories scroll inside.
  const cardH = compact ? "min(76svh, 600px)" : "min(82svh, 700px)";

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

  // Scroll-linked card pose, written directly to the DOM (no React re-render
  // per frame). The active card sits at scale 1, neighbours recede — the
  // "dynamic enlarge" reads continuously while the finger drags the track.
  const applyPose = useCallback(
    (scrollLeft: number) => {
      const t = stride > 0 ? scrollLeft / stride : 0;
      // The depth pose is written from the very first frame — through the
      // grow-in too — so neighbours open already receded instead of flashing
      // from full-size to small the instant `entered` flips. The catch is
      // promotion: a child on its OWN GPU layer (translateZ/will-change) under
      // the scaling wrapper is re-composited every frame → shiver. So during
      // the zoom the pose is a plain static transform that bakes into the
      // wrapper's single layer; only once entered do we add translateZ to
      // promote the cards for smooth scroll-linked motion.
      const promoted = enteredRef.current;
      cardRefs.current.forEach((node, i) => {
        if (!node) return;
        const d = Math.min(1, Math.abs(t - i));
        const scale = reduce ? 1 : 1 - 0.075 * d;
        node.style.transform = promoted
          ? `translateZ(0) scale(${scale})`
          : `scale(${scale})`;
        node.style.opacity = reduce ? "1" : String(1 - 0.55 * d);
      });
    },
    [reduce, stride],
  );

  // Snap is owned imperatively (never via the style prop) so gestures can
  // suspend it while they drive scrollLeft by hand, then restore it after the
  // settle animation instead of letting mandatory snap yank mid-gesture.
  const suspendSnap = useCallback(() => {
    window.clearTimeout(snapTimer.current);
    const el = scrollerRef.current;
    if (el) el.style.scrollSnapType = "none";
  }, []);

  const resumeSnapSoon = useCallback(() => {
    window.clearTimeout(snapTimer.current);
    snapTimer.current = window.setTimeout(() => {
      const el = scrollerRef.current;
      if (el) el.style.scrollSnapType = reduce ? "none" : "x mandatory";
    }, 500);
  }, [reduce]);

  useEffect(() => () => window.clearTimeout(snapTimer.current), []);

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
        applyPose(el.scrollLeft);
        setCur(Math.round(el.scrollLeft / stride));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [applyPose, setCur, stride]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // Held as a plain block until the grow-in finishes (see onAnimationComplete)
    // so scaling its ancestor doesn't reproject scrolled content and shimmer.
    // Reduced motion has no scale animation, so it can scroll immediately.
    const settled = reduce || enteredRef.current;
    el.style.overflowX = settled ? "auto" : "hidden";
    el.scrollLeft = curRef.current * stride;
    el.style.scrollSnapType =
      !reduce && enteredRef.current ? "x mandatory" : "none";
    applyPose(el.scrollLeft);
  }, [applyPose, reduce, stride]);

  // Reduced motion skips the grow-in entirely, so promote/pose right away.
  useEffect(() => {
    if (!reduce) return;
    enteredRef.current = true;
    setEntered(true);
  }, [reduce]);

  // Re-pose when the zoom settles: cards go from flat/un-promoted to layered
  // with their depth scale.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) applyPose(el.scrollLeft);
  }, [entered, applyPose]);

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

  // Desktop wheel / trackpad. Vertical over a card's story text scrolls the
  // text natively until it hits an edge; everything else (horizontal pans,
  // or vertical once the text is exhausted) drives the gallery horizontally —
  // so two-finger left/right AND up/down both move through cards. We translate
  // the dominant delta into scrollLeft ourselves rather than trusting native
  // horizontal scroll (macOS hijacks two-finger-horizontal for history-nav),
  // suspend snap while moving, then smooth-settle onto the nearest card.
  useEffect(() => {
    if (compact) return;
    const el = scrollerRef.current;
    if (!el) return;
    let settle = 0;
    const onWheel = (e: WheelEvent) => {
      // Two axes, two jobs, and they never cross. Vertical intent scrolls the
      // story text natively (the body owns the overflow) and is ignored here,
      // so up/down never pages the gallery — that accidental card-switch was
      // the jank. Only horizontal intent moves between cards; we drive
      // scrollLeft ourselves because macOS otherwise hijacks two-finger
      // horizontal for history back/forward navigation.
      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) return;
      const delta = e.deltaX;
      if (!delta) return;
      e.preventDefault();
      el.style.scrollSnapType = "none";
      el.scrollLeft += delta;
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        const target = clamp(Math.round(el.scrollLeft / stride), 0, count - 1);
        el.scrollTo({
          left: target * stride,
          behavior: reduce ? "auto" : "smooth",
        });
        window.setTimeout(() => {
          if (!reduce) el.style.scrollSnapType = "x mandatory";
        }, 260);
      }, 90);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(settle);
    };
  }, [compact, count, reduce, stride]);

  // Mouse drag-to-scroll. Touch never enters this path — the native scroller
  // already owns touch pans on the compositor.
  const dragRef = useRef({
    id: null as number | null,
    startX: 0,
    startScroll: 0,
    lastX: 0,
    lastT: 0,
    velocity: 0,
    moved: false,
  });

  const onScrollerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("a, button")) return;
    const el = scrollerRef.current;
    if (!el) return;
    const d = dragRef.current;
    d.id = e.pointerId;
    d.startX = e.clientX;
    d.lastX = e.clientX;
    d.lastT = performance.now();
    d.velocity = 0;
    d.startScroll = el.scrollLeft;
    d.moved = false;
    // Capture is deferred until the pointer actually moves — capturing on
    // pointerdown would retarget the click off the card, so a plain click to
    // switch cards would never reach the card's onClick.
  };

  const onScrollerPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (d.id !== e.pointerId) return;
    const el = scrollerRef.current;
    if (!el) return;
    const dx = e.clientX - d.startX;
    if (!d.moved) {
      if (Math.abs(dx) <= 5) return; // not a drag yet — leave the click intact
      d.moved = true;
      el.setPointerCapture(e.pointerId);
      suspendSnap();
    }
    const now = performance.now();
    d.velocity = (e.clientX - d.lastX) / Math.max(1, now - d.lastT);
    d.lastX = e.clientX;
    d.lastT = now;
    el.scrollLeft = d.startScroll - dx;
  };

  const onScrollerPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (d.id !== e.pointerId) return;
    d.id = null;
    const el = scrollerRef.current;
    if (!el) return;
    if (!d.moved) return; // a click, not a drag — let the card onClick switch
    let target = Math.round(el.scrollLeft / stride);
    if (Math.abs(d.velocity) > 0.4) {
      const from = Math.round(d.startScroll / stride);
      if (target === from) target = from + (d.velocity < 0 ? 1 : -1);
    }
    go(target);
    resumeSnapSoon();
  };

  if (typeof document === "undefined") return null;

  const onScrub = (ratio: number, commit: boolean) => {
    const el = scrollerRef.current;
    if (!el) return;
    if (commit) {
      go(Math.round(ratio * (count - 1)));
      resumeSnapSoon();
    } else {
      suspendSnap();
      el.scrollLeft = ratio * (el.scrollWidth - el.clientWidth);
    }
  };

  // Shared-element entrance: the gallery grows out of the L0 card that was
  // tapped, and collapses back into it on close. Transform-only, so WebKit
  // composites a cached layer — no per-frame paint.
  const originPose =
    reduce || typeof window === "undefined"
      ? { x: 0, y: 0, scale: 1 }
      : origin
        ? {
            x: origin.x + origin.width / 2 - window.innerWidth / 2,
            y: origin.y + origin.height / 2 - window.innerHeight / 2,
            scale: Math.max(0.2, origin.width / cardW),
          }
        : { x: 0, y: 24, scale: 0.95 };

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
      transition={{ duration: reduce ? 0 : 0.22, ease: "easeOut" }}
    >
      <style>{".gallery-scroller::-webkit-scrollbar{display:none}"}</style>

      {/* Frosted-glass scrim, themed: milk glass over light pages, smoked
          glass over dark. Mobile gets a lighter blur radius — backdrop-filter
          cost scales with radius and this layer covers the whole viewport. */}
      <div
        className={cn(
          "absolute inset-0 bg-[#f6f4f0]/85 dark:bg-[#0b0b0c]/80",
          compact ? "backdrop-blur-md" : "backdrop-blur-xl",
        )}
        onClick={onClose}
      />

      <motion.div
        className="absolute inset-0"
        // Promote to its own layer so the whole card subtree (heavy shadows
        // included) rasterises once and just composites during the grow-in —
        // otherwise Safari repaints the shadows every frame and drops them.
        style={{
          willChange: "transform",
          WebkitBackfaceVisibility: "hidden",
          backfaceVisibility: "hidden",
        }}
        initial={originPose}
        animate={{ x: 0, y: 0, scale: 1 }}
        exit={{
          ...originPose,
          transition: reduce
            ? { duration: 0 }
            : { duration: 0.3, ease: [0.4, 0, 1, 1] },
        }}
        // A tween, not a spring: a spring's tail overshoot reads as a shiver at
        // the end of the zoom. Ease-out lands clean.
        transition={
          reduce ? { duration: 0 } : { duration: 0.42, ease: [0.32, 0.72, 0, 1] }
        }
        onAnimationComplete={() => {
          enteredRef.current = true;
          setEntered(true);
          const el = scrollerRef.current;
          if (!el) return;
          // Becoming a scroll container only now: while the wrapper was being
          // scaled, an `overflow:auto` descendant made WebKit reproject its
          // scrolled content every frame → the card shimmered. Held it as a
          // plain (overflow:hidden) block through the grow-in.
          el.style.overflowX = "auto";
          if (!reduce) el.style.scrollSnapType = "x mandatory";
          applyPose(el.scrollLeft);
        }}
      >
        <div
          ref={scrollerRef}
          data-project-gallery-scroller
          className="gallery-scroller absolute inset-0 flex items-center overflow-y-hidden"
          style={{
            gap,
            paddingInline: sidePad,
            scrollPaddingInline: sidePad,
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-x",
            scrollbarWidth: "none",
          }}
          onPointerDown={onScrollerPointerDown}
          onPointerMove={onScrollerPointerMove}
          onPointerUp={onScrollerPointerEnd}
          onPointerCancel={onScrollerPointerEnd}
          onClickCapture={(e) => {
            if (dragRef.current.moved) {
              e.preventDefault();
              e.stopPropagation();
              dragRef.current.moved = false;
            }
          }}
          onClick={(e) => {
            if (e.target === scrollerRef.current) onClose();
          }}
        >
          {projects.map((project, i) => (
            // Outer box is the snap target: fixed size, never transformed, so
            // its snap point stays put. If the scale/opacity lived here, scaling
            // a snap child under `mandatory` would shift its own snap point and
            // the browser would re-snap → scroll → re-pose → re-snap forever
            // (the opacity-never-settles tremble). The pose goes on the inner.
            <div
              key={project.id}
              className={cn(
                "shrink-0 snap-center",
                i !== cur && "cursor-pointer",
              )}
              style={{ width: cardW, height: cardH }}
              onClick={() => i !== curRef.current && go(i)}
            >
              <div
                data-gallery-card
                ref={(node) => {
                  cardRefs.current[i] = node;
                }}
                className="h-full w-full"
                style={{
                  transformOrigin: "center center",
                  // Promotion is added only once the zoom settles (applyPose
                  // then writes translateZ + scale). Promoting during the
                  // grow-in is what makes the card shiver under the ancestor.
                  willChange: entered ? "transform, opacity" : "auto",
                }}
              >
                <StoryCard project={project} active={i === cur} />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1 } }}
        transition={{
          duration: reduce ? 0 : 0.2,
          delay: reduce ? 0 : 0.12,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="pointer-events-auto absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-stone-900/10 bg-white/70 text-stone-700 transition-colors hover:bg-white/90 hover:text-stone-900 dark:border-white/15 dark:bg-white/[0.08] dark:text-white/85 dark:hover:bg-white/[0.14] dark:hover:text-white sm:right-6 sm:top-6"
        >
          <X className="h-4 w-4" />
        </button>

        <GalleryArrow
          side="left"
          disabled={cur === 0}
          onClick={() => go(cur - 1)}
        />
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
      </motion.div>
    </motion.div>,
    document.body,
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
  onScrub: (ratio: number, commit: boolean) => void;
};

const GalleryScrubber = forwardRef<GalleryScrubberHandle, GalleryScrubberProps>(
  function GalleryScrubber(
    { count, cur, trackPx, initialProgress, onScrub },
    forwardedRef,
  ) {
    const railRef = useRef<HTMLDivElement>(null);
    const pillRef = useRef<HTMLDivElement>(null);
    const progressRef = useRef(
      initialProgress ?? (count > 1 ? cur / (count - 1) : 0),
    );
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

    useImperativeHandle(forwardedRef, () => ({ setProgress: applyProgress }), [
      applyProgress,
    ]);

    useLayoutEffect(() => {
      applyProgress(progressRef.current);
    }, [applyProgress]);

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
      <div
        className="pointer-events-auto absolute left-1/2 z-10 -translate-x-1/2"
        style={{ bottom: "max(20px, env(safe-area-inset-bottom))" }}
      >
        {/* Tall, transparent hit area holds a hairline rail at rest. The rail
            and thumb thicken on hover/drag so it reads as a quiet line until
            you reach for it, then becomes a grabbable scrubber. */}
        <div
          ref={railRef}
          role="slider"
          aria-label="Project"
          aria-valuemin={1}
          aria-valuemax={count}
          aria-valuenow={cur + 1}
          tabIndex={0}
          className="group flex h-6 cursor-grab touch-none select-none items-center outline-none active:cursor-grabbing"
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
            className={cn(
              "relative w-full overflow-hidden rounded-full bg-stone-900/[0.06] transition-[height] duration-200 ease-out dark:bg-white/10",
              dragging ? "h-1.5" : "h-1 group-hover:h-1.5",
            )}
          >
            <div
              ref={pillRef}
              className={cn(
                "absolute inset-y-0 left-0 rounded-full",
                dragging
                  ? "bg-stone-700/85 dark:bg-white/85"
                  : "bg-stone-500/55 group-hover:bg-stone-600/75 dark:bg-white/45 dark:group-hover:bg-white/70",
              )}
              style={{
                width: pillPx,
                transform: `translate3d(${progressRef.current * travelPx}px,0,0)`,
                transition: dragging
                  ? "background-color 200ms ease-out"
                  : "transform 120ms cubic-bezier(0.2,0.7,0,1), background-color 200ms ease-out",
              }}
            />
          </div>
        </div>
      </div>
    );
  },
);

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
        "pointer-events-auto absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border backdrop-blur-md transition-all sm:grid",
        "border-stone-900/10 bg-white/70 text-stone-700 hover:bg-white/90 hover:text-stone-900",
        "dark:border-white/15 dark:bg-stone-900/35 dark:text-white dark:hover:bg-stone-900/55",
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
  const [galleryOrigin, setGalleryOrigin] = useState<GalleryOrigin | null>(
    null,
  );
  // The card currently being dealt to the back, so we can give it the lift arc
  // and float it above the rest while it travels.
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const dealTimer = useRef<number | undefined>(undefined);
  // One stable ref on the carousel region (it never reorders). The active card
  // and its drag layer are queried from it per-gesture — a shared ref across
  // the four reordering articles would null out when React detaches the old
  // active node after attaching the new one, killing the gesture after one flip.
  const regionRef = useRef<HTMLDivElement | null>(null);
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
  const openGallery = (id: string) => {
    // Snapshot the front card's viewport rect before the body locks — the
    // gallery uses it as the shared-element origin to grow out of the deck.
    const node = regionRef.current?.querySelector(
      'article[aria-hidden="false"]',
    );
    if (node) {
      const r = node.getBoundingClientRect();
      setGalleryOrigin({ x: r.x, y: r.y, width: r.width, height: r.height });
    } else {
      setGalleryOrigin(null);
    }
    setGalleryIndex(projects.findIndex((p) => p.id === id));
  };

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

  // Keep the latest closures reachable from the (re-attached-per-order) touch
  // listeners without re-running the effect on every unrelated render.
  const actionsRef = useRef({ advance, openGallery, activeId: order[0] });
  actionsRef.current = { advance, openGallery, activeId: order[0] };

  // Mobile L0 gesture. framer's drag + `touch-action: pan-y` lets the browser
  // claim vertical on any drift — that is the accidental scroll. Here we own
  // the touch sequence: lock an axis with a strong horizontal bias, and the
  // instant we commit to horizontal call preventDefault, which tells WebKit to
  // stop scrolling for the rest of this touch (pointer events can't do that).
  // A clearly-vertical start is left untouched, so the page still scrolls.
  useEffect(() => {
    if (!compact || shouldReduce) return;
    const region = regionRef.current;
    if (!region) return;

    const g = {
      began: false, // this touch started on the active card
      active: false, // still tracking (cleared once we lock to vertical)
      axis: null as "x" | "y" | null,
      startX: 0,
      startY: 0,
      dx: 0,
      lastX: 0,
      lastT: 0,
      v: 0,
      moved: false,
      raf: 0,
      layer: null as HTMLElement | null,
    };

    const write = () => {
      g.raf = 0;
      if (g.layer) {
        g.layer.style.transition = "none";
        g.layer.style.transform = `translate3d(${g.dx}px,0,0)`;
      }
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const activeCard = region.querySelector('article[aria-hidden="false"]');
      if (
        !activeCard ||
        !(e.target instanceof Node) ||
        !activeCard.contains(e.target)
      )
        return; // touch began on a back card → leave it to framer's promote
      const layer = activeCard.querySelector("[data-l0-drag]");
      if (!(layer instanceof HTMLElement)) return;
      const t = e.touches[0];
      g.began = true;
      g.active = true;
      g.axis = null;
      g.startX = t.clientX;
      g.startY = t.clientY;
      g.dx = 0;
      g.lastX = t.clientX;
      g.lastT = performance.now();
      g.v = 0;
      g.moved = false;
      g.layer = layer;
    };

    const onMove = (e: TouchEvent) => {
      if (!g.active || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - g.startX;
      const dy = t.clientY - g.startY;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);

      if (g.axis == null) {
        if (ax < swipeAxisLockPx && ay < swipeAxisLockPx) return;
        g.axis = ax * swipeAxisBias > ay ? "x" : "y";
        // Vertical intent: bow out entirely and let the page scroll natively.
        if (g.axis === "y") {
          g.active = false;
          return;
        }
      }
      if (g.axis !== "x") return;

      // Claim the gesture: suppresses the page scroll for the rest of the touch.
      e.preventDefault();
      g.moved = true;
      const now = performance.now();
      g.v = (t.clientX - g.lastX) / Math.max(1, now - g.lastT);
      g.lastX = t.clientX;
      g.lastT = now;
      g.dx = dx;
      if (!g.raf) g.raf = requestAnimationFrame(write);
    };

    const onEnd = () => {
      if (g.raf) {
        cancelAnimationFrame(g.raf);
        g.raf = 0;
      }
      const wasX = g.axis === "x";
      const commit =
        wasX &&
        (Math.abs(g.dx) > swipeCommitPx || Math.abs(g.v) > swipeFlickVelocity);
      const tap = g.began && !g.moved && g.axis == null && Math.abs(g.dx) < tapSlopPx;

      if (g.layer) {
        if (commit) {
          // The deal animation slides the article away; the inner layer just
          // snaps back to 0 instantly behind it.
          g.layer.style.transition = "none";
          g.layer.style.transform = "translate3d(0,0,0)";
        } else if (wasX) {
          g.layer.style.transition = "transform 200ms cubic-bezier(0.2,0.7,0,1)";
          g.layer.style.transform = "translate3d(0,0,0)";
        }
      }

      g.began = false;
      g.active = false;
      g.axis = null;
      g.dx = 0;
      g.v = 0;
      g.layer = null;

      if (commit) actionsRef.current.advance();
      else if (tap) actionsRef.current.openGallery(actionsRef.current.activeId);
    };

    region.addEventListener("touchstart", onStart, { passive: true });
    region.addEventListener("touchmove", onMove, { passive: false });
    region.addEventListener("touchend", onEnd, { passive: true });
    region.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      region.removeEventListener("touchstart", onStart);
      region.removeEventListener("touchmove", onMove);
      region.removeEventListener("touchend", onEnd);
      region.removeEventListener("touchcancel", onEnd);
      if (g.raf) cancelAnimationFrame(g.raf);
    };
  }, [compact, shouldReduce]);

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
        ref={regionRef}
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
              // Desktop drives the deck with framer's free-card drag. Mobile is
              // owned by the custom touch effect above (framer drag off), so a
              // horizontal swipe never competes with the browser's pan-y.
              drag={active && !shouldReduce && !compact}
              dragSnapToOrigin
              dragElastic={0.5}
              whileHover={
                active && !shouldReduce && !compact ? { y: -6 } : undefined
              }
              whileDrag={{ cursor: "grabbing" }}
              onPointerDown={() => {
                draggedRef.current = false;
              }}
              onDragStart={(e) => e.preventDefault()}
              onDrag={() => {
                draggedRef.current = true;
              }}
              onDragEnd={onDragEnd}
              // Desktop tap/back-card promote. On mobile the active card's
              // tap+swipe is handled by the touch effect; only back cards
              // promote through framer here.
              onTap={() => {
                if (compact) {
                  if (!active) promote(project.id);
                  return;
                }
                if (draggedRef.current) return;
                if (active) openGallery(project.id);
                else promote(project.id);
              }}
              aria-hidden={!active}
              tabIndex={active ? 0 : -1}
            >
              <div
                data-l0-drag
                style={compact ? { willChange: "transform" } : undefined}
              >
                <CardFace
                  project={project}
                  active={active}
                  onOpen={() => openGallery(project.id)}
                />
              </div>
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
            origin={galleryOrigin}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
