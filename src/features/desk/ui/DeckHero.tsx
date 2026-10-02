// One project's hero, still, for the deck on the desk. Rendered on the server
// only; the live deck in the projects window animates its own.
import { renderHero } from '@/components/project-cards/ProjectShowcaseCard';
import type { ProjectHero } from '@/data/site';

export default function DeckHero({ hero }: { hero: ProjectHero }) {
  return renderHero(hero, false);
}
