import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// A framed carousel of OG cards — each one generated live by ogis from a
// different background and headline. The hero IS the demo. The card floats at
// its native 1200x630 ratio over a soft, blurred copy of itself, so the OG
// aspect never fights the card box. Slides cross-dissolve with a gentle scale.

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

const INTERVAL_MS = 4200;

export default function OgCarouselHero({ hovered = false }: { hovered?: boolean }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const live = hovered && !reduced;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(
      () => setActive((a) => (a + 1) % slides.length),
      live ? 2100 : INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [reduced, live]);

  const slide = slides[active];

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f4f2ec] dark:bg-[#0c0d10]">
      {/* The same card, enlarged and blurred, bleeds to the tile edges — so the
          sharp card on top melts into its own colour instead of sitting inside a
          frame. No border, no mount: the only edge is the hero tile's ring. */}
      <AnimatePresence initial={false}>
        <motion.img
          key={`bg-${slide.src}`}
          src={slide.src}
          aria-hidden
          className="absolute inset-0 h-full w-full scale-[1.4] object-cover blur-3xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
        />
      </AnimatePresence>

      {/* The real 1200×630 card, shown whole and edge-to-edge across the width;
          top and bottom dissolve into the blurred bleed. Hover zooms it gently. */}
      <div
        className="absolute inset-0"
        style={{
          transform: live ? "scale(1.03)" : "scale(1)",
          transition: "transform 450ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <AnimatePresence initial={false}>
          <motion.img
            key={slide.src}
            src={slide.src}
            alt={slide.alt}
            loading={active === 0 ? "eager" : "lazy"}
            className="absolute inset-0 h-full w-full object-contain"
            initial={reduced ? false : { opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
        </AnimatePresence>
      </div>
    </div>
  );
}
