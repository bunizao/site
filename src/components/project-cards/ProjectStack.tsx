import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type PanInfo,
  type TargetAndTransition,
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

const spring = { type: "spring", stiffness: 260, damping: 30 } as const;

// Shared chrome. Warm neutral, never pure black/white: a cream surface that
// frames the dark hero like a matte in light mode, a soft near-black in dark.
// Layered ambient+key shadow instead of one harsh slab; hairline borders.
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
}: {
  project: ShowcaseProject;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "flex max-h-[86vh] w-full flex-col rounded-[26px] p-2.5 text-stone-900 dark:text-stone-100",
        surface,
      )}
    >
      <div className={cn("aspect-[16/9] shrink-0 rounded-[18px]", heroFrame)}>
        {renderHero(project.hero, active)}
      </div>

      <div className="touch-pan-y overflow-y-auto overscroll-contain px-4 pb-3 pt-5 sm:px-5 sm:pb-4">
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
  const [vw, setVw] = useState(
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
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
  const count = projects.length;

  const go = (n: number) => setIndex(Math.max(0, Math.min(count - 1, n)));

  // Staged entrance: the tapped card zooms up first (the "it got bigger" beat),
  // then the neighbours fade in. `entered` gates the second beat.
  const [entered, setEntered] = useState(Boolean(reduce));
  useEffect(() => {
    if (reduce) return;
    const t = window.setTimeout(() => setEntered(true), 240);
    return () => window.clearTimeout(t);
  }, [reduce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, onClose]);

  if (typeof document === "undefined") return null;

  const cardW = Math.min(620, Math.round(vw * 0.86));
  const gap = vw < 640 ? 16 : 40;
  const stride = cardW + gap;
  // Track is flex-centered, so x=0 centers the midpoint card; shift to `index`.
  const centerOffset = stride * ((count - 1) / 2 - index);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const threshold = stride * 0.2;
    if (info.offset.x < -threshold || info.velocity.x < -500) go(index + 1);
    else if (info.offset.x > threshold || info.velocity.x > 500) go(index - 1);
  };

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Project gallery"
      className="fixed inset-0 z-[100] overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      // Backdrop snaps opaque quickly so the card zooms against a clean blur,
      // not the lingering stack behind it.
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div
        className="absolute inset-0 bg-stone-900/55 backdrop-blur-lg dark:bg-black/72"
        onClick={onClose}
      />

      {/* Card track — empty space falls through to the backdrop (click to close). */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <motion.div
          className="pointer-events-auto flex items-center"
          style={{ gap }}
          // Start already centered on the opened card so it zooms in place,
          // not slide-then-zoom; navigation still springs between indices.
          initial={{ x: centerOffset }}
          animate={{ x: centerOffset }}
          transition={reduce ? { duration: 0 } : spring}
          drag={reduce ? false : "x"}
          dragElastic={0.14}
          // Clamp to first/last centered so dragging never reveals empty space.
          dragConstraints={{
            left: -stride * ((count - 1) / 2),
            right: stride * ((count - 1) / 2),
          }}
          onDragEnd={onDragEnd}
        >
          {projects.map((p, i) => (
            <div
              key={p.id}
              className={cn("shrink-0", i !== index && "cursor-pointer")}
              style={{ width: cardW }}
              onClick={() => i !== index && go(i)}
            >
              <motion.div
                initial={
                  reduce
                    ? false
                    : i === index
                      ? { scale: 0.46, opacity: 0 }
                      : { scale: 0.9, opacity: 0 }
                }
                animate={
                  i === index
                    ? { scale: 1, opacity: 1 }
                    : { scale: 0.9, opacity: entered ? 0.45 : 0 }
                }
                exit={
                  i === index
                    ? { scale: 0.5, opacity: 0 }
                    : { opacity: 0 }
                }
                transition={
                  reduce
                    ? { duration: 0 }
                    : i === index
                      ? { type: "spring", stiffness: 240, damping: 22 }
                      : { duration: 0.32, ease: "easeOut" }
                }
                className={cn(i !== index && "pointer-events-none")}
              >
                <StoryCard project={p} active={i === index} />
              </motion.div>
            </div>
          ))}
        </motion.div>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-stone-900/35 text-white/85 backdrop-blur-md transition-colors hover:bg-stone-900/55 hover:text-white sm:right-6 sm:top-6"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Arrows on desktop only — on mobile the card fills the width, so the
          scrubber below is the control instead. */}
      <GalleryArrow side="left" disabled={index === 0} onClick={() => go(index - 1)} />
      <GalleryArrow
        side="right"
        disabled={index === count - 1}
        onClick={() => go(index + 1)}
      />

      <GalleryScrubber count={count} index={index} go={go} />
    </motion.div>,
    document.body,
  );
}

function GalleryScrubber({
  count,
  index,
  go,
}: {
  count: number;
  index: number;
  go: (n: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const update = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    go(Math.round(((clientX - r.left) / r.width) * (count - 1)));
  };

  return (
    <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
      <div
        ref={ref}
        role="slider"
        aria-label="Project"
        aria-valuemin={1}
        aria-valuemax={count}
        aria-valuenow={index + 1}
        className="relative h-2.5 w-[min(72vw,340px)] cursor-grab touch-none rounded-full bg-white/15 active:cursor-grabbing"
        onPointerDown={(e) => {
          setDragging(true);
          ref.current?.setPointerCapture(e.pointerId);
          update(e.clientX);
        }}
        onPointerMove={(e) => dragging && update(e.clientX)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <motion.div
          className="absolute inset-y-0 rounded-full bg-white/90"
          style={{ width: `${100 / count}%` }}
          animate={{ left: `${(index * 100) / count}%` }}
          transition={spring}
        />
      </div>
    </div>
  );
}

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

function getStackPose(depth: number): TargetAndTransition {
  const layer = Math.min(depth, visibleDepth);

  // Right-fanned reveal: each card behind drifts right and tilts so a strip of
  // its own content shows along the edge — the deck reads as a fan of cards.
  return {
    x: layer * 22,
    y: layer * 5,
    z: -layer * 36,
    scale: 1 - layer * 0.015,
    rotateX: 0,
    rotateZ: layer * 3.2,
    opacity: depth > visibleDepth ? 0 : 1 - layer * 0.03,
    filter: `blur(${Math.max(0, layer - 2) * 0.6}px)`,
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
    filter: "blur(8px)",
  };
}

export default function ProjectStack({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const ids = useMemo(() => projects.map((p) => p.id), []);
  const [order, setOrder] = useState(ids);
  const [hasEntered, setHasEntered] = useState(Boolean(reduce));
  const [paused, setPaused] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), []);

  const advance = () =>
    setOrder((o) => (o.length < 2 ? o : [...o.slice(1), o[0]]));
  const promote = (id: string) =>
    setOrder((o) => [id, ...o.filter((x) => x !== id)]);
  const openGallery = (id: string) =>
    setGalleryIndex(projects.findIndex((p) => p.id === id));

  // Reset on each pointer-down, set true once a drag actually moves — onTap then
  // reliably opens only on a real tap, never on the tail of a stack flip.
  const draggedRef = useRef(false);

  // Entrance: fan the deck out once after mount.
  useEffect(() => {
    if (reduce) return setHasEntered(true);
    const t = window.setTimeout(() => setHasEntered(true), 1000);
    return () => window.clearTimeout(t);
  }, [reduce]);

  // Slow auto-advance, suspended while hovered or while the gallery is open.
  useEffect(() => {
    if (
      reduce ||
      !hasEntered ||
      paused ||
      galleryIndex != null ||
      projects.length < 2
    )
      return;
    const t = window.setTimeout(advance, autoAdvanceMs);
    return () => window.clearTimeout(t);
  }, [reduce, hasEntered, paused, galleryIndex, order]);

  const ordered = order
    .map((id) => byId.get(id))
    .filter((p): p is ShowcaseProject => Boolean(p));

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > dragAdvanceThreshold) advance();
  };

  return (
    <div
      className={cn("relative mx-auto w-full max-w-[440px]", className)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div
        className="relative h-[520px] w-full sm:h-[540px]"
        style={{ perspective: 1200 }}
        aria-roledescription="carousel"
        aria-label="Projects"
      >
        {ordered.map((project, depth) => {
          const active = depth === 0;
          return (
            <motion.article
              key={project.id}
              // !touch-pan-y overrides framer's auto `touch-action: none` for
              // both-axis drag: on touch, vertical still scrolls the page and only
              // horizontal drags; a mouse ignores touch-action and drags freely.
              className="absolute inset-x-0 top-0 mx-auto w-full max-w-[400px] select-none !touch-pan-y"
              style={{
                transformStyle: "preserve-3d",
                transformOrigin: "center center",
                zIndex: projects.length - depth,
                pointerEvents: depth <= visibleDepth ? "auto" : "none",
                cursor: active ? "grab" : "pointer",
              }}
              initial={reduce ? getStackPose(depth) : getEntrancePose()}
              animate={getStackPose(depth)}
              transition={{
                type: "spring",
                stiffness: hasEntered ? 130 : 96,
                damping: hasEntered ? 21 : 24,
                mass: 0.82,
                delay: hasEntered || reduce ? 0 : depth * 0.08,
              }}
              // Free drag in both axes — toss it anywhere, it springs home.
              drag={active && !reduce}
              dragSnapToOrigin
              dragElastic={0.6}
              whileHover={active && !reduce ? { y: -6 } : undefined}
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
