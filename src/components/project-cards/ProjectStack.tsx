import { useEffect, useMemo, useState } from "react";
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
const dragAdvanceThreshold = 90;

const depthRotations = [0, 1.8, 3.4, 4.8];

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

      <div className="overflow-y-auto overscroll-contain px-4 pb-3 pt-5 sm:px-5 sm:pb-4">
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
      className="fixed inset-0 z-[100] overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        className="absolute inset-0 bg-stone-900/40 backdrop-blur-md dark:bg-black/65"
        onClick={onClose}
      />

      {/* Card track — empty space falls through to the backdrop (click to close). */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <motion.div
          className="pointer-events-auto flex items-center"
          style={{ gap }}
          animate={{ x: centerOffset }}
          transition={reduce ? { duration: 0 } : spring}
          drag={reduce ? false : "x"}
          dragElastic={0.12}
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
                animate={{
                  scale: i === index ? 1 : 0.9,
                  opacity: i === index ? 1 : 0.45,
                }}
                transition={reduce ? { duration: 0 } : spring}
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

      <GalleryArrow side="left" disabled={index === 0} onClick={() => go(index - 1)} />
      <GalleryArrow
        side="right"
        disabled={index === count - 1}
        onClick={() => go(index + 1)}
      />

      <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
        {projects.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => go(i)}
            aria-label={`Show ${p.name}`}
            aria-current={i === index}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === index
                ? "w-6 bg-white/85"
                : "w-1.5 bg-white/30 hover:bg-white/55",
            )}
          />
        ))}
      </div>
    </motion.div>,
    document.body,
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
        "absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-stone-900/35 text-white backdrop-blur-md transition-all hover:bg-stone-900/55",
        side === "left" ? "left-3 sm:left-6" : "right-3 sm:right-6",
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

  // Directional cascade: each card behind drops down + drifts right + tilts,
  // so the deck unmistakably reads as a pile with every card peeking.
  return {
    x: layer * 14,
    y: layer * 30,
    z: -layer * 50,
    scale: 1 - layer * 0.04,
    rotateX: layer * 1.2,
    rotateZ: depthRotations[layer] ?? 0,
    opacity: depth > visibleDepth ? 0 : 1 - layer * 0.04,
    filter: `blur(${Math.max(0, layer - 1) * 0.45}px)`,
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
              className="absolute inset-x-0 top-0 mx-auto w-full max-w-[400px] select-none"
              style={{
                transformStyle: "preserve-3d",
                transformOrigin: "center top",
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
              drag={active && !reduce ? "x" : false}
              dragSnapToOrigin
              dragElastic={0.5}
              dragConstraints={{ left: 0, right: 0 }}
              whileHover={active && !reduce ? { y: -6 } : undefined}
              whileDrag={{ cursor: "grabbing" }}
              onDragStart={(e) => e.preventDefault()}
              onDragEnd={onDragEnd}
              onClick={
                active
                  ? () => openGallery(project.id)
                  : () => promote(project.id)
              }
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
