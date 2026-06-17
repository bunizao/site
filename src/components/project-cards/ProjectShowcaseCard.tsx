import { Star } from "lucide-react";
import CliCubeHero from "@/components/project-cards/CliCubeHero";
import HarmonicWaveHero from "@/components/project-cards/HarmonicWaveHero";
import OgCarouselHero from "@/components/project-cards/OgCarouselHero";
import AttegiTourHero from "@/components/project-cards/AttegiTourHero";
import type { ProjectHero } from "@/data/site";

// Project copy + accents live in src/data/site.ts; the hero visuals and their
// renderer stay here. `hero.kind` picks the visual best representing a project:
//   waves    → an animated signature (abstract products like proxy rules)
//   cube     → an owned isometric diagram (tool clusters)
//   tour     → a live-site walkthrough of real pixels (visual products like themes)
//   carousel → show what the project produces (the OG image service)
export { projects, type ShowcaseProject, type ProjectHero } from "@/data/site";

// ---------------------------------------------------------------------------
// Hero renderers
// ---------------------------------------------------------------------------

export function renderHero(hero: ProjectHero, hovered: boolean) {
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
