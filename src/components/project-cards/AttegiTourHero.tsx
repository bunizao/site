import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// A live-site tour of the Attegi theme. Three real screenshots — homepage,
// editorial TOC, code blocks — cross-dissolve inside a browser chrome, and
// each one pans slowly downward while shown, so it reads like scrolling the
// page rather than staring at a flat capture. The URL in the bar follows along.

interface Slide {
  src: string;
  url: string;
  alt: string;
}

const slides: Slide[] = [
  {
    src: "/dev/attegi/home.webp",
    url: "attegi.tuuhub.com",
    alt: "Attegi homepage in dark mode",
  },
  {
    src: "/dev/attegi/toc.webp",
    url: "attegi.tuuhub.com/blog/typography",
    alt: "Attegi post with editorial table of contents",
  },
  {
    src: "/dev/attegi/code.webp",
    url: "attegi.tuuhub.com/blog/code-blocks",
    alt: "Attegi post with syntax-highlighted code blocks",
  },
];

const INTERVAL_MS = 5200;

export default function AttegiTourHero({ hovered = false }: { hovered?: boolean }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const live = hovered && !reduced;
  const intervalMs = live ? 2600 : INTERVAL_MS;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(
      () => setActive((a) => (a + 1) % slides.length),
      intervalMs,
    );
    return () => window.clearInterval(id);
  }, [reduced, intervalMs]);

  const slide = slides[active];

  return (
    <div className="flex h-full w-full flex-col bg-[#f4f2ec] dark:bg-[#0c0d10]">
      {/* Browser chrome — the URL follows the active slide. */}
      <div className="flex items-center gap-1.5 border-b border-stone-900/10 px-3 py-2 dark:border-white/10">
        <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
        <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
        <span className="h-2 w-2 rounded-full bg-[#28c840]" />
        <div className="ml-2 flex-1 overflow-hidden rounded-[4px] bg-stone-900/[0.05] px-2 py-0.5 dark:bg-white/[0.06]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={slide.url}
              className="block truncate text-center font-code text-[10px] text-stone-500 dark:text-white/40"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {slide.url}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      {/* Viewport — slides cross-dissolve, each panning down as if scrolled. */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence initial={false}>
          <motion.img
            key={slide.src}
            src={slide.src}
            alt={slide.alt}
            loading={active === 0 ? "eager" : "lazy"}
            className="absolute inset-0 h-full w-full object-cover"
            initial={
              reduced
                ? { opacity: 0, objectPosition: "50% 50%" }
                : { opacity: 0, objectPosition: "50% 0%" }
            }
            animate={{
              opacity: 1,
              objectPosition: reduced ? "50% 50%" : "50% 100%",
              scale: live ? 1.06 : 1,
            }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
              objectPosition: { duration: intervalMs / 1000 + 0.9, ease: "linear" },
              scale: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
            }}
          />
        </AnimatePresence>
      </div>
    </div>
  );
}
