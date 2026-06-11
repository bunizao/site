import { Star } from "lucide-react";
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
