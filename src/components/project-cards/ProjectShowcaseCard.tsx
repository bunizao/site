import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Star, X } from "lucide-react";
import CliCubeHero from "@/components/project-cards/CliCubeHero";
import HarmonicWaveHero from "@/components/project-cards/HarmonicWaveHero";
import OgCarouselHero from "@/components/project-cards/OgCarouselHero";
import AttegiTourHero from "@/components/project-cards/AttegiTourHero";

// ---------------------------------------------------------------------------
// Data model. Each project carries the ONE hero that best represents it:
//   waves    → an animated signature (abstract products like proxy rules)
//   cube     → an owned isometric diagram (tool clusters)
//   tour     → a live-site walkthrough of real pixels (visual products like themes)
//   carousel → show what the project produces (the OG image service)
// ---------------------------------------------------------------------------

export type Hero =
  | { kind: "waves" }
  | { kind: "tour" }
  | { kind: "carousel" }
  | { kind: "cube" };

export interface ShowcaseProject {
  id: string;
  name: string;
  type: string;
  url: string;
  blurb: string;
  story: string[];
  tags: string[];
  stars: number | null;
  hero: Hero;
  // Card surface tint, paired with the hero's accent so the whole card reads as
  // one family. Kept high-key in light (paper hues) and low-key in dark (hinted
  // near-blacks) so the four cards differ without breaking the monochrome calm.
  tint: { light: string; dark: string };
}

export const projects: ShowcaseProject[] = [
  {
    id: "cli-tools",
    name: "Tools for Agents",
    type: "CLI + MCP",
    url: "https://github.com/bunizao?tab=repositories&q=cli",
    blurb: "Small CLIs for the dull parts of being a student. Each one speaks MCP, so an agent can run it for you.",
    story: [
      "I kept doing the same chores by hand: pulling assignments off Moodle, reading Ed threads, syncing OnTrack tasks, signing in through Okta, marking attendance. So I wrote a CLI for each one. They do a single job and stay out of the way.",
      "Then I gave them an MCP server. Now an agent drives them while I'm doing something better with my afternoon.",
    ],
    tags: ["CLI", "MCP", "Automation"],
    stars: null,
    hero: { kind: "cube" },
    tint: { light: "#f6f1e7", dark: "#16140f" }, // warm ivory, matches amber linework
  },
  {
    id: "ogis",
    name: "ogis",
    type: "OG Image Service",
    url: "https://github.com/bunizao/ogis",
    blurb: "Turn a title into a share image. Themed, signed, rendered at the edge.",
    story: [
      "Give ogis a title and a site name and it builds a clean Open Graph card on the edge. Pick a theme, sign the request so nobody hotlinks your generator, and every share gets its own image.",
      "The card you're looking at came out of ogis. That's the whole pitch.",
    ],
    tags: ["Next.js", "OG Image", "Edge"],
    stars: 5,
    hero: { kind: "carousel" },
    tint: { light: "#eceef2", dark: "#101216" }, // cool porcelain, faint blue-grey
  },
  {
    id: "attegi",
    name: "Attegi",
    type: "Ghost Theme",
    url: "https://github.com/bunizao/Attegi",
    blurb: "A Ghost theme with an editorial spine. Fast pages, a real table of contents, a dark mode that looks designed.",
    story: [
      "I set up my own Ghost blog and none of the themes fit, so I built Attegi. Sharp type, pages that load quick, a table of contents that tracks where you're reading, code blocks that leave you alone.",
      "27 blogs run it now. It's the theme I wanted on day one.",
    ],
    tags: ["Ghost", "Theme", "TailwindCSS"],
    stars: 27,
    hero: { kind: "tour" },
    tint: { light: "#f1ece3", dark: "#151318" }, // warm oat, editorial paper
  },
  {
    id: "tutubetterrules",
    name: "TutuBetterRules",
    type: "Proxy Rules",
    url: "https://github.com/bunizao/TutuBetterRules",
    blurb: "Cross-platform proxy rules. Surge-first, syncs to Clash, Shadowrocket, and QX.",
    story: [
      "It started as my own Surge config, the kind you tweak at 1am until traffic finally routes the way you want. Then it grew into one source of truth that compiles out to Surge, Clash, Shadowrocket, and Quantumult X.",
      "About 400 people run it now. Modules, rewrites, and policy groups stay in sync, so you update once instead of babysitting four configs.",
    ],
    tags: ["Surge", "Clash", "Shadowrocket", "QX"],
    stars: 391,
    hero: { kind: "waves" },
    tint: { light: "#e8edeb", dark: "#0f1513" }, // cool grey-green whisper, nods to teal
  },
];

// ---------------------------------------------------------------------------
// Hero renderers
// ---------------------------------------------------------------------------

export function renderHero(hero: Hero, hovered: boolean) {
  switch (hero.kind) {
    case "waves":
      return <HarmonicWaveHero hovered={hovered} />;
    case "tour":
      return <AttegiTourHero hovered={hovered} />;
    case "carousel":
      return <OgCarouselHero hovered={hovered} />;
    case "cube":
      return <CliCubeHero hovered={hovered} />;
  }
}

export function StarBadge({ stars }: { stars: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-stone-900/10 bg-stone-900/[0.035] px-2.5 py-1 font-code text-[12px] font-semibold text-stone-600 backdrop-blur-md dark:border-white/12 dark:bg-white/[0.07] dark:text-white/80">
      <Star className="h-3 w-3 fill-amber-400 text-amber-400 dark:fill-amber-300 dark:text-amber-300" />
      {stars}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Card: collapsed (L0) ↔ expanded (L1), morphing via shared layoutId.
// ---------------------------------------------------------------------------

function ProjectShowcaseCard({ project }: { project: ShowcaseProject }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const reduce = useReducedMotion();

  const ids = {
    card: `card-${project.id}`,
    hero: `hero-${project.id}`,
    title: `title-${project.id}`,
  };

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
      {/* ---------- L0 ---------- */}
      <motion.button
        layoutId={ids.card}
        type="button"
        onClick={() => setOpen(true)}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        transition={spring}
        whileHover={reduce ? undefined : { y: -5 }}
        className="group relative block w-[340px] max-w-full overflow-hidden rounded-[18px] border border-white/12 bg-neutral-950/85 text-left text-white shadow-2xl shadow-black/40 outline-none backdrop-blur-xl focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <motion.div
          layoutId={ids.hero}
          className="relative aspect-[16/10] w-full overflow-hidden"
        >
          {renderHero(project.hero, hovered)}
        </motion.div>

        <div className="p-5">
          <p className="font-code text-[10px] uppercase tracking-[0.14em] text-white/35 transition-colors duration-300 group-hover:text-white/55">
            {project.type}
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <motion.h3
              layoutId={ids.title}
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

      {/* ---------- L1 ---------- */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            <motion.div
              layoutId={ids.card}
              role="dialog"
              aria-modal="true"
              aria-label={project.name}
              transition={spring}
              className="relative z-10 w-[680px] max-w-full overflow-hidden rounded-[22px] border border-white/12 bg-neutral-950/95 text-white shadow-2xl shadow-black/60 backdrop-blur-xl"
            >
              <motion.div
                layoutId={ids.hero}
                className="relative aspect-[16/9] w-full overflow-hidden"
              >
                {renderHero(project.hero, false)}
              </motion.div>

              <button
                type="button"
                onClick={() => setOpen(false)}
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
                  <motion.h3
                    layoutId={ids.title}
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

export default function ProjectShowcase() {
  return (
    <div className="flex flex-wrap items-start justify-center gap-6">
      {projects.map((project) => (
        <ProjectShowcaseCard key={project.id} project={project} />
      ))}
    </div>
  );
}
