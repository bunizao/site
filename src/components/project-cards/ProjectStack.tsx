import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type PanInfo,
  type TargetAndTransition,
} from "framer-motion";
import { ArrowUpRight, X } from "lucide-react";
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
//   - back cards peek, so the deck telegraphs "there are N things here"
//   - auto-advances slowly, but pauses on hover so reading is never cut off
//   - click a back card / a dot to promote it, drag the top card to advance
//   - the top card opens a modal with the full story
// ---------------------------------------------------------------------------

const visibleDepth = 3; // four projects → depths 0..3, all peek
const autoAdvanceMs = 5500; // slow enough to read; hover pauses it entirely
const dragAdvanceThreshold = 90;

const depthRotations = [0, -4.6, 4, -3];

function getStackPose(depth: number): TargetAndTransition {
  const layer = Math.min(depth, visibleDepth);
  const side = layer % 2 === 0 ? -1 : 1;

  return {
    x: side * layer * 11,
    y: layer * 30,
    z: -layer * 90,
    scale: 1 - layer * 0.05,
    rotateX: layer * 3,
    rotateZ: depthRotations[layer] ?? 0,
    opacity: depth > visibleDepth ? 0 : 1 - layer * 0.1,
    filter: `blur(${Math.max(0, layer - 1) * 0.4}px)`,
  };
}

function getEntrancePose(depth: number): TargetAndTransition {
  return {
    x: 0,
    y: 46,
    z: -depth * 16,
    scale: 0.84,
    rotateX: 0,
    rotateZ: 0,
    opacity: 0,
    filter: "blur(8px)",
  };
}

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
    <div className="overflow-hidden rounded-[18px] border border-white/12 bg-neutral-950 text-left text-white shadow-2xl shadow-black/50">
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        {renderHero(project.hero, active)}
      </div>

      <div className="p-5">
        <p className="font-code text-[10px] uppercase tracking-[0.14em] text-white/35">
          {project.type}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <h3 className="font-display text-[22px] font-extrabold leading-none tracking-tight">
            {project.name}
          </h3>
          {project.stars != null && <StarBadge stars={project.stars} />}
        </div>

        <p className="mt-3 font-sans text-[13.5px] leading-relaxed text-white/55">
          {project.blurb}
        </p>

        <div className="mt-4 flex items-center justify-end">
          <button
            type="button"
            // Only the front card is interactive; back cards are inert until promoted.
            onClick={active ? onOpen : undefined}
            tabIndex={active ? 0 : -1}
            className="inline-flex items-center gap-1 font-code text-[11px] font-semibold uppercase tracking-wide text-white/45 outline-none transition-colors hover:text-white/85 focus-visible:text-white/85"
          >
            Tell me more
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function StoryModal({
  project,
  onClose,
}: {
  project: ShowcaseProject;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={project.name}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
        className="relative z-10 w-[680px] max-w-full overflow-hidden rounded-[22px] border border-white/12 bg-neutral-950/95 text-white shadow-2xl shadow-black/60 backdrop-blur-xl"
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden">
          {renderHero(project.hero, false)}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/50 text-white/80 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 sm:p-8">
          <p className="mb-2 font-code text-[11px] uppercase tracking-[0.14em] text-white/40">
            {project.type}
          </p>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-[34px] font-extrabold leading-none tracking-tight sm:text-[40px]">
              {project.name}
            </h3>
            {project.stars != null && <StarBadge stars={project.stars} />}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 font-code text-[11px] text-white/65"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-5 space-y-4">
            {project.story.map((paragraph, i) => (
              <p
                key={i}
                className="font-sans text-[15px] leading-relaxed text-white/75"
              >
                {paragraph}
              </p>
            ))}
          </div>

          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-7 inline-flex items-center gap-1.5 border-b border-white/25 pb-0.5 font-code text-[13px] font-semibold uppercase tracking-wide text-white/80 transition-colors hover:border-white hover:text-white"
          >
            View on GitHub
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </motion.div>
    </div>
  );
}

export default function ProjectStack({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const ids = useMemo(() => projects.map((p) => p.id), []);
  const [order, setOrder] = useState(ids);
  const [hasEntered, setHasEntered] = useState(Boolean(reduce));
  const [paused, setPaused] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), []);
  const activeProject = activeId ? byId.get(activeId) : null;

  const advance = () =>
    setOrder((o) => (o.length < 2 ? o : [...o.slice(1), o[0]]));
  const promote = (id: string) =>
    setOrder((o) => [id, ...o.filter((x) => x !== id)]);

  // Entrance: fan the deck out once after mount.
  useEffect(() => {
    if (reduce) return setHasEntered(true);
    const t = window.setTimeout(() => setHasEntered(true), 1000);
    return () => window.clearTimeout(t);
  }, [reduce]);

  // Slow auto-advance, suspended while hovered or while the modal is open.
  useEffect(() => {
    if (reduce || !hasEntered || paused || activeId || projects.length < 2)
      return;
    const t = window.setTimeout(advance, autoAdvanceMs);
    return () => window.clearTimeout(t);
  }, [reduce, hasEntered, paused, activeId, order]);

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
        className="relative h-[500px] w-full sm:h-[520px]"
        style={{ perspective: 1200 }}
        aria-roledescription="carousel"
        aria-label="Projects"
      >
        {ordered.map((project, depth) => {
          const active = depth === 0;
          return (
            <motion.article
              key={project.id}
              className="absolute inset-x-0 top-0 mx-auto w-full max-w-[400px]"
              style={{
                transformStyle: "preserve-3d",
                transformOrigin: "center top",
                zIndex: projects.length - depth,
                pointerEvents: depth <= visibleDepth ? "auto" : "none",
                cursor: active ? "grab" : "pointer",
              }}
              initial={reduce ? getStackPose(depth) : getEntrancePose(depth)}
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
              whileDrag={{ cursor: "grabbing" }}
              onDragEnd={onDragEnd}
              onClick={active ? undefined : () => promote(project.id)}
              aria-hidden={!active}
            >
              <CardFace
                project={project}
                active={active}
                onOpen={() => setActiveId(project.id)}
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
                isTop ? "w-6 bg-white/80" : "w-1.5 bg-white/25 hover:bg-white/50",
              )}
            />
          );
        })}
      </div>

      <AnimatePresence>
        {activeProject && (
          <StoryModal
            project={activeProject}
            onClose={() => setActiveId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
