import { useEffect, useState } from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "framer-motion";

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

function TourImage({
  slide,
  eager,
  live,
  shouldReduce,
  intervalMs,
}: {
  slide: Slide;
  eager: boolean;
  live: boolean;
  shouldReduce: boolean;
  intervalMs: number;
}) {
  const present = useIsPresent();

  return (
    <motion.img
      src={slide.src}
      alt={present ? slide.alt : ""}
      aria-hidden={present ? undefined : true}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className="absolute inset-0 h-full w-full object-cover"
      initial={{ opacity: 0, objectPosition: "50% 0%", scale: 1 }}
      animate={{
        opacity: 1,
        objectPosition: shouldReduce || !live ? "50% 50%" : "50% 100%",
        scale: live ? 1.06 : 1,
      }}
      exit={{ opacity: 0 }}
      transition={{
        opacity: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
        objectPosition: { duration: live ? (intervalMs + 900) / 1000 : 0.3, ease: "linear" },
        scale: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
      }}
    />
  );
}

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
  }, [live]);

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
        <AnimatePresence initial={false}>
          <TourImage
            key={slide.src}
            slide={slide}
            eager={active === 0}
            live={live}
            shouldReduce={shouldReduce}
            intervalMs={intervalMs}
          />
        </AnimatePresence>
      </div>
    </div>
  );
}
