import { useEffect, useState } from "react";

// Network throughput as harmonics: stacked sine waves at integer frequencies,
// each scrolling at its own speed. Where crests align the band swells; where
// they cancel it thins — so the line "breathes" like real bandwidth, never
// looping visibly. Pure CSS transform loop (survives backgrounded tabs).

const VW = 400;
const VH = 220;
const SPAN = VW * 2; // path is twice as wide so the scroll seam is off-screen
const SAMPLES = 110;

interface Harmonic {
  k: number; // integer cycles per viewport — keeps the SPAN loop seamless
  amp: number;
  phase: number;
}

interface WaveLayer {
  midY: number;
  harmonics: Harmonic[];
  fill: string;
  stroke?: string;
  duration: number; // seconds for one VW of travel
}

// Lower layers: big, slow swell. Upper layers: tighter, faster detail.
// Different durations make the crests drift in and out of phase over time.
const layers: WaveLayer[] = [
  {
    midY: 150,
    harmonics: [{ k: 1, amp: 30, phase: 0 }],
    fill: "rgb(var(--hero-accent) / 0.1)",
    duration: 17,
  },
  {
    midY: 138,
    harmonics: [
      { k: 2, amp: 20, phase: 0.6 },
      { k: 1, amp: 12, phase: 0 },
    ],
    fill: "rgb(var(--hero-accent) / 0.16)",
    duration: 11,
  },
  {
    midY: 126,
    harmonics: [
      { k: 3, amp: 13, phase: 2.1 },
      { k: 5, amp: 6, phase: 0.4 },
    ],
    fill: "rgb(var(--hero-accent) / 0.24)",
    stroke: "rgb(var(--hero-accent) / 0.75)",
    duration: 7,
  },
];

function samplePoints(layer: WaveLayer): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const x = (i / SAMPLES) * SPAN;
    let y = layer.midY;
    for (const h of layer.harmonics) {
      const wavelength = VW / h.k;
      y += h.amp * Math.sin((x / wavelength) * Math.PI * 2 + h.phase);
    }
    pts.push([x, y]);
  }
  return pts;
}

function areaPath(pts: Array<[number, number]>): string {
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");
  return `M${line} L${SPAN},${VH} L0,${VH} Z`;
}

function linePath(pts: Array<[number, number]>): string {
  return "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");
}

// Precompute paths once — geometry is static, only the transform animates.
const built = layers.map((layer) => {
  const pts = samplePoints(layer);
  return { layer, area: areaPath(pts), line: linePath(pts) };
});

function usePrefersReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const u = () => setR(m.matches);
    u();
    m.addEventListener("change", u);
    return () => m.removeEventListener("change", u);
  }, []);
  return r;
}

export default function HarmonicWaveHero({ hovered = false }: { hovered?: boolean }) {
  const reduced = usePrefersReducedMotion();
  const live = hovered && !reduced;

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[#f4f2ec] [--hero-accent:13_148_136] dark:bg-[#0c0d10] dark:[--hero-accent:45_212_191]"
      style={{
        transform: live ? "scaleY(1.12)" : "scaleY(1)",
        transformOrigin: "bottom",
        transition: "transform 500ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        role="img"
        aria-label="Animated network throughput waveform"
      >
        {built.map(({ layer, area, line }, i) => (
          <g
            key={i}
            className={reduced ? undefined : `wave-scroll wave-${i}`}
            style={{ ["--dur" as string]: `${live ? layer.duration * 0.55 : layer.duration}s` }}
          >
            <path d={area} style={{ fill: layer.fill }} />
            {layer.stroke && (
              <path
                d={line}
                strokeWidth={1.25}
                style={{ fill: "none", stroke: layer.stroke }}
              />
            )}
          </g>
        ))}
      </svg>

      {/* Fade the top so the waves emerge from the surface rather than hard-cut */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#f4f2ec] via-transparent to-transparent dark:from-[#0c0d10]" />

      <style>{`
        @keyframes wave-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-${VW}px); }
        }
        .wave-scroll {
          transform-box: view-box;
          animation: wave-scroll var(--dur) linear infinite;
        }
      `}</style>
    </div>
  );
}
