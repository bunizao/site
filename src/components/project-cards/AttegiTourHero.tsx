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
    src: "/projects/attegi/home.webp",
    url: "attegi.tuuhub.com",
    alt: "Attegi homepage in dark mode",
  },
  {
    src: "/projects/attegi/toc.webp",
    url: "attegi.tuuhub.com/blog/typography",
    alt: "Attegi post with editorial table of contents",
  },
  {
    src: "/projects/attegi/code.webp",
    url: "attegi.tuuhub.com/blog/code-blocks",
    alt: "Attegi post with syntax-highlighted code blocks",
  },
];

export default function AttegiTourHero({ hovered = false }: { hovered?: boolean }) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(0);
  const shouldReduce = mounted && reduced === true;
  const live = hovered && !shouldReduce;
  const intervalMs = 2600;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(
      () => setActive((a) => (a + 1) % slides.length),
      intervalMs,
    );
    return () => window.clearInterval(id);
  }, [live, intervalMs]);

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
              initial={shouldReduce ? false : { opacity: 0 }}
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
        {slides.map((candidate, index) => {
          const current = index === active;
          const objectDuration = current && live ? intervalMs + 900 : 300;
          return (
            <img
              key={candidate.src}
              src={candidate.src}
              alt={current ? candidate.alt : ""}
              aria-hidden={current ? undefined : true}
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                opacity: current ? 1 : 0,
                zIndex: current ? 1 : 0,
                objectPosition:
                  shouldReduce || !live
                    ? "50% 50%"
                    : current
                      ? "50% 100%"
                      : "50% 0%",
                transform: current && live ? "scale(1.06)" : "scale(1)",
                transition:
                  `opacity 900ms cubic-bezier(0.22,1,0.36,1), ` +
                  `object-position ${objectDuration}ms linear, ` +
                  "transform 450ms cubic-bezier(0.22,1,0.36,1)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
