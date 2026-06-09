import { useEffect, useState } from "react";

// A cross-fading carousel of OG cards — each one generated live by ogis from a
// different background and headline. The hero IS the demo: this is literally
// what the service produces. Images are pre-rendered to /dev/ogis.

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

const INTERVAL_MS = 3600;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

export default function OgCarouselHero() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(
      () => setActive((a) => (a + 1) % slides.length),
      INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0c0d10]">
      {slides.map((slide, i) => (
        <img
          key={slide.src}
          src={slide.src}
          alt={i === active ? slide.alt : ""}
          loading={i === 0 ? "eager" : "lazy"}
          aria-hidden={i !== active}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1100ms] ease-in-out"
          style={{ opacity: i === active ? 1 : 0 }}
        />
      ))}

      {/* Slide indicator — widens on the active card */}
      <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1.5">
        {slides.map((slide, i) => (
          <span
            key={slide.src}
            className="h-1 rounded-full bg-white transition-all duration-500"
            style={{
              width: i === active ? 14 : 5,
              opacity: i === active ? 0.9 : 0.4,
            }}
          />
        ))}
      </div>
    </div>
  );
}
