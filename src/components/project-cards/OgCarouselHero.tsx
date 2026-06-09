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
  { src: "/dev/ogis/og-1.jpg", alt: "OG card: Link previews, on the edge" },
  { src: "/dev/ogis/og-2.jpg", alt: "OG card: Frosted glass, zero cold starts" },
  { src: "/dev/ogis/og-3.jpg", alt: "OG card: Every share, intentional" },
  { src: "/dev/ogis/og-4.jpg", alt: "OG card: Generated live by ogis" },
];

const INTERVAL_MS = 4200;

export default function OgCarouselHero() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(
      () => setActive((a) => (a + 1) % slides.length),
      INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [reduced]);

  const slide = slides[active];

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0c0d10]">
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
      <div className="absolute inset-0 bg-[#0c0d10]/30" />

      {/* The framed OG card, centered at native ratio. */}
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-5">
        <div
          className="relative w-full overflow-hidden rounded-lg border border-white/10 shadow-2xl shadow-black/60 ring-1 ring-white/5"
          style={{ aspectRatio: "1200 / 630" }}
        >
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
  );
}
