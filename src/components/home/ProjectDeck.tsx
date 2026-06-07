import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, type TargetAndTransition } from "framer-motion";
import { ArrowUpRight, Star } from "lucide-react";

export interface DeckProject {
  name: string;
  url: string;
  description: string;
  role: "Author" | "Contributor";
  tags: string[];
  stars?: number | null;
}

interface ProjectDeckProps {
  projects: DeckProject[];
  /** Time a card rests on top before settling to the back of the deck. */
  cycleMs?: number;
}

// How many cards read as "in the stack"; deeper ones fade out entirely.
const VISIBLE = 4;

// Near-frontal stack: the front card faces the reader, cards behind it peek
// upward, slightly smaller and dimmer, with a faint alternating lean so the
// deck looks hand-stacked rather than mechanically aligned.
function pose(depth: number): TargetAndTransition {
  const layer = Math.min(depth, VISIBLE);
  return {
    y: layer * 24,
    scale: 1 - layer * 0.045,
    rotateZ: layer === 0 ? 0 : (layer % 2 === 0 ? 1 : -1) * (0.8 + layer * 0.5),
    opacity: depth > VISIBLE ? 0 : 1 - layer * 0.06,
    filter: `blur(${Math.max(0, layer - 1) * 0.4}px)`,
  };
}

export default function ProjectDeck({
  projects,
  cycleMs = 3600,
}: ProjectDeckProps) {
  const reduced = useReducedMotion();
  // `order` holds project indices; index 0 is the card on top.
  const [order, setOrder] = useState(() => projects.map((_, i) => i));
  const orderRef = useRef(order);
  orderRef.current = order;

  useEffect(() => {
    setOrder(projects.map((_, i) => i));
  }, [projects]);

  useEffect(() => {
    if (reduced || projects.length < 2) return;

    const interval = window.setInterval(() => {
      // Send the front card to the back; everything else moves up one slot.
      setOrder((prev) => (prev.length < 2 ? prev : [...prev.slice(1), prev[0]]));
    }, cycleMs);

    return () => window.clearInterval(interval);
  }, [reduced, projects.length, cycleMs]);

  if (projects.length === 0) return null;

  return (
    <div
      className="relative h-[420px] w-full max-w-[360px]"
      style={{ perspective: 1400 }}
      aria-label="Project showcase"
    >
      {order.map((projectIndex, depth) => {
        const project = projects[projectIndex];
        if (!project) return null;

        const isTop = depth === 0;

        return (
          <motion.div
            key={project.name}
            className="absolute inset-x-0 top-0 mx-auto w-full"
            style={{
              transformOrigin: "center top",
              zIndex: projects.length - depth,
              pointerEvents: isTop ? "auto" : "none",
            }}
            initial={false}
            animate={pose(depth)}
            transition={
              reduced
                ? { duration: 0 }
                : { type: "spring", stiffness: 110, damping: 20, mass: 0.85 }
            }
          >
            <ProjectFace
              project={project}
              index={projectIndex}
              interactive={isTop}
            />
          </motion.div>
        );
      })}
    </div>
  );
}

function ProjectFace({
  project,
  index,
  interactive,
}: {
  project: DeckProject;
  index: number;
  interactive: boolean;
}) {
  return (
    <a
      href={project.url}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={interactive ? 0 : -1}
      aria-hidden={interactive ? undefined : true}
      className="group flex h-[380px] flex-col overflow-hidden rounded-[20px] border border-[hsl(var(--border)/0.12)] bg-[hsl(var(--card))]"
      style={{
        pointerEvents: interactive ? "auto" : "none",
        // Stacked edge-shadows hint physical thickness; the soft cast grounds it.
        boxShadow:
          "0 1px 0 hsl(var(--border)/0.08), 0 2px 0 hsl(var(--border)/0.06), 0 3px 0 hsl(var(--border)/0.04), 0 22px 40px -18px hsl(var(--foreground)/0.28)",
      }}
    >
      {/* Header zone — carries identity. */}
      <div className="relative h-[42%] border-b border-[hsl(var(--border)/0.1)] px-6 pt-5">
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "radial-gradient(hsl(var(--foreground)/0.12) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
            maskImage: "linear-gradient(to bottom, black, transparent 88%)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent 88%)",
          }}
          aria-hidden="true"
        />

        <div className="relative flex items-start justify-between">
          <span className="font-code text-[13px] font-medium tabular-nums text-[hsl(var(--foreground)/0.4)]">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="rounded-[6px] border border-[hsl(var(--border)/0.14)] bg-[hsl(var(--foreground)/0.05)] px-2 py-0.5 font-code text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--foreground)/0.55)]">
            {project.role}
          </span>
        </div>

        <h3 className="relative mt-4 font-display text-[32px] font-bold leading-[0.98] tracking-tight text-[hsl(var(--foreground))]">
          {project.name}
        </h3>
      </div>

      {/* Body — description, tags, footer. */}
      <div className="flex flex-1 flex-col px-6 pb-5 pt-4">
        <p className="font-sans text-[13px] leading-[1.55] text-[hsl(var(--foreground)/0.62)]">
          {project.description}
        </p>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {project.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="font-code text-[11px] text-[hsl(var(--foreground)/0.45)]"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {typeof project.stars === "number" && (
              <span className="flex items-center gap-1 font-code text-[11px] tabular-nums text-[hsl(var(--foreground)/0.45)]">
                <Star className="h-3 w-3" aria-hidden="true" />
                {project.stars}
              </span>
            )}
            <ArrowUpRight
              className="h-5 w-5 text-[hsl(var(--foreground)/0.4)] transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[hsl(var(--foreground))]"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </a>
  );
}
