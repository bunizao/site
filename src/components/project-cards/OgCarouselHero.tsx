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
      {/* Ambient backdrop: a blurred, dimmed copy of the active card fills the
          frame so the surrounding space glows with the card's own colors. */}
      <AnimatePresence initial={false}>
        <motion.img
          key={`bg-${slide.src}`}
          src={slide.src}
          aria-hidden
          className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.45 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-[#f4f2ec]/40 dark:bg-[#0c0d10]/30" />

      {/* The OG card floats in a liquid-glass mount: a frosted slab that blurs
          and saturates the ambient backdrop showing through its margin, a bright
          specular rim along the top edge, and a soft drop so it lifts off the
          surface. No hard border — the glass IS the frame. */}
      <div className="absolute inset-0 flex items-center justify-center p-6 sm:p-7">
        <div
          className="relative w-full rounded-[20px] border border-white/40 p-[10px] backdrop-blur-xl backdrop-saturate-150 dark:border-white/15"
          style={{
            aspectRatio: "1200 / 630",
            transform: live ? "scale(1.035)" : "scale(1)",
            transition: "transform 450ms cubic-bezier(0.22,1,0.36,1)",
            // Frosted fill + specular top highlight + a faint bottom lip + float.
            background: "rgba(255,255,255,0.14)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.65), inset 0 -1px 2px rgba(0,0,0,0.12), 0 16px 48px -14px rgba(0,0,0,0.5)",
          }}
        >
          <div className="relative h-full w-full overflow-hidden rounded-[11px]">
            <AnimatePresence initial={false}>
              <motion.img
                key={slide.src}
                src={slide.src}
                alt={slide.alt}
                loading={active === 0 ? "eager" : "lazy"}
                className="absolute inset-0 h-full w-full object-cover"
                initial={reduced ? false : { opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
              />
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
