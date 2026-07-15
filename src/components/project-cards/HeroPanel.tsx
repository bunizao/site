import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";
import { renderHero } from "@/components/project-cards/ProjectShowcaseCard";
import type { ProjectHero } from "@/data/site";

// A single project's living hero, sized for the /projects ledger. Unlike the
// home deck — where every hero is a thumbnail card face flipped through one at
// a time — here each hero gets a full panel and comes alive on its own when it
// scrolls into view. That "wakes up as you reach it" reveal is the page's
// signature, so the animation only runs while the panel is actually on screen
// (and never under reduced motion).
export default function HeroPanel({
  hero,
  accent,
}: {
  hero: ProjectHero;
  accent?: { light: string; dark: string };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [inView, setInView] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (reduced) {
      setInView(false);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio > 0.3),
      { threshold: [0, 0.3, 0.6] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  const live = !reduced && (inView || hovered);

  const style = accent
    ? ({ "--ha-l": accent.light, "--ha-d": accent.dark } as CSSProperties)
    : undefined;

  return (
    <div
      ref={ref}
      className="hero-panel"
      data-hero-accent={accent ? "" : undefined}
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {renderHero(hero, live)}
    </div>
  );
}
