import { useEffect, useState } from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "framer-motion";

// A framed carousel of OG cards — each one generated live by ogis from a
// different background and headline. The hero IS the demo. The card floats at
// its native 1200x630 ratio over a soft, blurred copy of itself, so the OG
// aspect never fights the card box. Slides cross-dissolve with a gentle scale.

interface Slide {
  src: string;
  blurSrc?: string;
  alt: string;
}

const slides: Slide[] = [
  { src: "/projects/ogis/og-1.webp", alt: "OG card: Link previews, on the edge" },
  {
    src: "/projects/ogis/og-2.webp",
    blurSrc: "/projects/ogis/og-2-blur.webp",
    alt: "OG card: Frosted glass, zero cold starts",
  },
  { src: "/projects/ogis/og-3.webp", alt: "OG card: Every share, intentional" },
  {
    src: "/projects/ogis/og-4.webp",
    blurSrc: "/projects/ogis/og-4-blur.webp",
    alt: "OG card: Generated live by ogis",
  },
];

function ForegroundImage({ slide, eager }: { slide: Slide; eager: boolean }) {
  const present = useIsPresent();

  return (
    <motion.img
      src={slide.src}
      alt={present ? slide.alt : ""}
      aria-hidden={present ? undefined : true}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className="absolute inset-0 h-full w-full object-contain"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

export default function OgCarouselHero({ hovered = false }: { hovered?: boolean }) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(0);
  const shouldReduce = mounted && reduced === true;
  const live = hovered && !shouldReduce;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(
      () => setActive((a) => (a + 1) % slides.length),
      2100,
    );
    return () => window.clearInterval(id);
  }, [live]);

  const slide = slides[active];
  const backgroundSrc = slide.blurSrc ?? slide.src;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f4f2ec] dark:bg-[#0c0d10]">
      {/* The same card, enlarged and blurred, bleeds to the tile edges — so the
          sharp card on top melts into its own colour instead of sitting inside a
          frame. No border, no mount: the only edge is the hero tile's ring. */}
      <AnimatePresence initial={false}>
        <motion.img
          key={`bg-${backgroundSrc}`}
          src={backgroundSrc}
          alt=""
          aria-hidden
          loading={active === 0 ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full scale-[1.4] object-cover blur-3xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          exit={{ opacity: 0, transition: { duration: 0.45, ease: "easeOut" } }}
          transition={{ duration: 1, ease: "easeOut" }}
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
          <ForegroundImage
            key={slide.src}
            slide={slide}
            eager={active === 0}
          />
        </AnimatePresence>
      </div>
    </div>
  );
}
