import { useReducedMotion } from "framer-motion";

// ogis turns titles into share images at scale, so the hero shows a feed of
// them: real generated cards stacked flush and scrolling up in a seamless loop.
// Each card is whole at its native 1200x630 — no crop, no letterbox, no frame.
// The aspect mismatch that plagues a single centred card just disappears when
// the cards tile vertically and the column scrolls. Hover speeds the drift.

interface Slide {
  src: string;
  alt: string;
}

const slides: Slide[] = [
  { src: "/dev/ogis/og-1.webp", alt: "OG card: Link previews, on the edge" },
  { src: "/dev/ogis/og-2.webp", alt: "OG card: Frosted glass, zero cold starts" },
  { src: "/dev/ogis/og-3.webp", alt: "OG card: Every share, intentional" },
  { src: "/dev/ogis/og-4.webp", alt: "OG card: Generated live by ogis" },
];

export default function OgCarouselHero({ hovered = false }: { hovered?: boolean }) {
  const reduced = useReducedMotion();
  const live = hovered && !reduced;

  // Two stacked copies: the column scrolls up by exactly one copy, so the loop
  // is seamless. Flush stacking (no gap) means translateY(-50%) lands perfectly.
  const loop = [...slides, ...slides];

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f4f2ec] dark:bg-[#0c0d10]">
      <div
        className={reduced ? undefined : "og-feed"}
        style={{ ["--dur" as string]: live ? "11s" : "26s" }}
      >
        {loop.map((s, i) => (
          <img
            key={i}
            src={s.src}
            alt={i < slides.length ? s.alt : ""}
            aria-hidden={i >= slides.length}
            loading={i === 0 ? "eager" : "lazy"}
            className="block w-full"
          />
        ))}
      </div>

      <style>{`
        .og-feed {
          will-change: transform;
          animation: og-feed-scroll var(--dur) linear infinite;
        }
        @keyframes og-feed-scroll {
          from { transform: translateY(0); }
          to   { transform: translateY(-50%); }
        }
      `}</style>
    </div>
  );
}
