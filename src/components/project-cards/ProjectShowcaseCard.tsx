import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Star, X } from "lucide-react";

// MVP: a single project drives both the collapsed (L0) and expanded (L1) card.
// Later this becomes a prop fed from the GitHub pipeline in Projects.astro.
interface ShowcaseProject {
  name: string;
  type: string; // category label shown on the hero
  url: string;
  blurb: string; // one line, shown at L0
  story: string[]; // narrative paragraphs, shown only at L1
  tags: string[]; // shown only at L1
  stars: number | null;
}

const project: ShowcaseProject = {
  name: "TutuBetterRules",
  type: "Proxy Rules",
  url: "https://github.com/bunizao/TutuBetterRules",
  blurb: "Cross-platform proxy rules — Surge-first, syncs to Clash, Shadowrocket & QX.",
  story: [
    "It started as my own Surge config — the kind you keep tweaking at 1am until traffic finally routes the way you want. Then it grew into one source of truth that compiles out to Surge, Clash, Shadowrocket, and Quantumult X.",
    "Now ~400 people run it. Modules, rewrites, and policy groups kept in sync, so you update once instead of babysitting four bespoke configs.",
  ],
  tags: ["Surge", "Clash", "Shadowrocket", "QX"],
  stars: 391,
};

// Sunset + pixel-grid + scanline — the ASCII-texture look, as a hero stand-in.
// Drop a real screenshot in here later by swapping this for an <img>.
function HeroTexture() {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(155deg,#6fc7d0 0%,#a9a6d8 30%,#e3a0c0 56%,#f3c69e 80%,#f6d98c 100%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-40 mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(rgba(15,15,25,0.85) 0.5px, transparent 0.6px)",
          backgroundSize: "4px 4px",
        }}
      />
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.4) 0 1px, transparent 1px 4px)",
        }}
      />
    </>
  );
}

function StarBadge({ stars }: { stars: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 font-code text-[12px] font-semibold text-white/85 backdrop-blur-md">
      <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
      {stars}
    </span>
  );
}

export default function ProjectShowcaseCard() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  // One spring drives every layout morph, so L0↔L1 feels like a single object.
  const spring = reduce
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 210, damping: 26, mass: 0.9 } as const);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      {/* ---------- L0: collapsed card (the one that sits in the stack) ---------- */}
      <motion.button
        layoutId="showcase-card"
        type="button"
        onClick={() => setOpen(true)}
        transition={spring}
        whileHover={reduce ? undefined : { y: -5 }}
        className="group relative block w-[340px] max-w-full overflow-hidden rounded-[18px] border border-white/12 bg-neutral-950/80 text-left text-white shadow-2xl shadow-black/40 outline-none backdrop-blur-xl focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <motion.div
          layoutId="showcase-hero"
          className="relative aspect-[16/10] w-full overflow-hidden"
        >
          {/* Texture wakes up on hover: slow zoom + scanlines clear. */}
          <div className="absolute inset-0 scale-100 transition-transform duration-700 ease-out group-hover:scale-105">
            <HeroTexture />
          </div>
          {/* Type label glides from top-left to a centered pill on hover. */}
          <span className="absolute left-3 top-3 rounded-md border border-transparent px-0 py-1 font-code text-[11px] uppercase tracking-wide text-white/70 transition-all duration-300 group-hover:left-1/2 group-hover:-translate-x-1/2 group-hover:border-white/15 group-hover:bg-black/40 group-hover:px-2.5 group-hover:text-white group-hover:backdrop-blur-md">
            {project.type}
          </span>
        </motion.div>

        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <motion.h3
              layoutId="showcase-title"
              className="relative font-display text-[22px] font-extrabold leading-none tracking-tight"
            >
              {project.name}
              <span className="absolute -bottom-1 left-0 h-px w-0 bg-white/70 transition-all duration-700 ease-out group-hover:w-full" />
            </motion.h3>
            {project.stars != null && <StarBadge stars={project.stars} />}
          </div>

          <p className="mt-3 font-sans text-[13.5px] leading-relaxed text-white/55 transition-colors duration-300 group-hover:text-white/75">
            {project.blurb}
          </p>

          <div className="mt-4 flex items-center justify-end">
            <span className="inline-flex items-center gap-1 font-code text-[11px] font-semibold uppercase tracking-wide text-white/40 transition-colors duration-300 group-hover:text-white/70">
              Tell me more
              <ArrowUpRight className="h-0 w-0 scale-0 transition-all duration-300 group-hover:h-3.5 group-hover:w-3.5 group-hover:scale-100" />
            </span>
          </div>
        </div>
      </motion.button>

      {/* ---------- L1: expanded card (morphs from the same layoutId) ---------- */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
            <motion.div
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            <motion.div
              layoutId="showcase-card"
              role="dialog"
              aria-modal="true"
              aria-label={project.name}
              transition={spring}
              className="relative z-10 w-[680px] max-w-full overflow-hidden rounded-[22px] border border-white/12 bg-neutral-950/90 text-white shadow-2xl shadow-black/60 backdrop-blur-xl"
            >
              <motion.div
                layoutId="showcase-hero"
                className="relative aspect-[16/9] w-full overflow-hidden"
              >
                <HeroTexture />
              </motion.div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/40 text-white/80 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="p-6 sm:p-8">
                <div className="flex items-center justify-between gap-3">
                  <motion.h3
                    layoutId="showcase-title"
                    className="font-display text-[34px] font-extrabold leading-none tracking-tight sm:text-[40px]"
                  >
                    {project.name}
                  </motion.h3>
                  {project.stars != null && <StarBadge stars={project.stars} />}
                </div>

                <motion.div
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduce ? 0 : 0.12, duration: 0.3 }}
                >
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
                </motion.div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
