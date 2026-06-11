import { useEffect, useState } from "react";

// An owned recreation of the "isometric stack + labeled connectors" look:
// each layer is one of the CLI tools, and a highlight cycles through them.
// Pure SVG — no external asset, monochrome to match the site.

type Side = "left" | "right";
interface Layer {
  label: string;
  side: Side;
}

const layers: Layer[] = [
  { label: "moodle-cli", side: "right" },
  { label: "edstem-cli", side: "left" },
  { label: "always-attend", side: "right" },
  { label: "ontrack-cli", side: "left" },
  { label: "okta-auth", side: "right" },
];

// Isometric geometry (viewBox 400 x 250).
const CX = 200;
const HW = 56; // diamond half-width
const HH = 28; // diamond half-height
const THICK = 12; // plate side depth
const GAP = 18; // vertical distance between plate centers
const TOP_CY = 82;
const LEFT_X = 98;
const RIGHT_X = 302;

// How long a single plate takes to complete one clockwise twist (ms).
// Kept under the live highlight dwell so each slice finishes before the next.
const TWIST_MS = 1200;
// Highlight step cadence: slow walk while hovered (with room for the twist to
// settle), calmer idle cycle when not.
const STEP_HOVER_MS = 1900;
const STEP_IDLE_MS = 1900;

// The flat top face is a unit square (half-size 0.5) lying on the ground plane.
const SQUARE: [number, number][] = [
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
  [-0.5, -0.5],
];

// Rotate the square in its own plane by phi, then project to isometric screen
// space. Because the rotation happens before projection, the plate stays flat
// on the horizontal plane and spins clockwise — it never tips edge-on.
function plateFaces(cy: number, phi: number) {
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const top = SQUARE.map(([x, y]) => {
    const rx = x * cos + y * sin;
    const ry = -x * sin + y * cos;
    return [CX + (rx - ry) * HW, cy + (rx + ry) * HH] as [number, number];
  });

  const midY = top.reduce((s, p) => s + p[1], 0) / top.length;
  const sides: [number, number][][] = [];
  for (let i = 0; i < top.length; i++) {
    const p = top[i];
    const q = top[(i + 1) % top.length];
    // An edge sits on the front (viewer-facing) silhouette when it runs below
    // the face center — that's where the extruded depth wall is visible.
    if ((p[1] + q[1]) / 2 > midY) {
      sides.push([p, q, [q[0], q[1] + THICK], [p[0], p[1] + THICK]]);
    }
  }
  return { top, sides };
}

const toPoints = (pts: [number, number][]) =>
  pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

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

export default function CliCubeHero({ hovered = false }: { hovered?: boolean }) {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [phi, setPhi] = useState(0);
  const live = hovered && !reduced;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(
      () => setActive((a) => (a + 1) % layers.length),
      live ? STEP_HOVER_MS : STEP_IDLE_MS,
    );
    return () => window.clearInterval(id);
  }, [reduced, live]);

  // Twist only the active plate, one clean turn per highlight step. Re-running
  // on every `active` change makes the slices rotate one at a time down the
  // stack, Rubik-style — never all together.
  useEffect(() => {
    if (!live) {
      setPhi(0);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const loop = (t: number) => {
      if (start === null) start = t;
      const p = Math.min((t - start) / TWIST_MS, 1);
      // easeInOutCubic for a weighted twist that settles flat.
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      setPhi(e * Math.PI * 2);
      if (p < 1) raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [live, active]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#f4f2ec] [--hero-accent:180_83_9] dark:bg-[#0c0d10] dark:[--hero-accent:251_191_36]">
      <svg
        viewBox="0 0 400 250"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label="Isometric stack of CLI tools"
      >
        <g className={reduced ? undefined : "cli-cube-float"}>
          {/* Connectors first (behind the plates) */}
          {layers.map((layer, i) => {
            const cy = TOP_CY + i * GAP;
            const on = i === active;
            const isLeft = layer.side === "left";
            const startX = isLeft ? CX - HW : CX + HW;
            const endX = isLeft ? LEFT_X : RIGHT_X;
            return (
              <g
                key={`c-${layer.label}`}
                style={{
                  opacity: on ? 1 : 0.42,
                  transition: "opacity 400ms ease",
                }}
              >
                <line
                  x1={startX}
                  y1={cy}
                  x2={endX}
                  y2={cy}
                  style={{
                    stroke: on
                      ? "rgb(var(--hero-accent) / 0.9)"
                      : "hsl(var(--foreground) / 0.16)",
                    transition: "stroke 400ms ease",
                  }}
                  strokeWidth={1}
                />
                <circle
                  cx={endX}
                  cy={cy}
                  r={on ? 3 : 2}
                  style={{
                    fill: on
                      ? "rgb(var(--hero-accent))"
                      : "hsl(var(--foreground) / 0.3)",
                    transition: "fill 400ms ease, r 400ms ease",
                  }}
                />
                <text
                  x={isLeft ? endX - 8 : endX + 8}
                  y={cy + 3}
                  textAnchor={isLeft ? "end" : "start"}
                  style={{
                    fill: on
                      ? "hsl(var(--foreground) / 0.92)"
                      : "hsl(var(--foreground) / 0.4)",
                    transition: "fill 400ms ease",
                  }}
                  fontFamily="ui-monospace, monospace"
                  fontSize={8}
                >
                  {layer.label}
                </text>
              </g>
            );
          })}

          {/* Plates, bottom-to-top so the top plate renders frontmost */}
          {layers
            .map((layer, i) => ({ layer, i }))
            .reverse()
            .map(({ layer, i }) => {
              const cy = TOP_CY + i * GAP;
              const on = i === active;
              // Only the active plate twists; the rest stay flat.
              const { top, sides } = plateFaces(cy, on ? phi : 0);
              return (
                <g key={`p-${layer.label}`}>
                  {sides.map((quad, s) => (
                    <polygon
                      key={s}
                      points={toPoints(quad)}
                      style={{
                        fill: on
                          ? "rgb(var(--hero-accent) / 0.1)"
                          : "hsl(var(--foreground) / 0.04)",
                        stroke: on
                          ? "rgb(var(--hero-accent) / 0.75)"
                          : "hsl(var(--foreground) / 0.18)",
                        transition: "fill 400ms ease, stroke 400ms ease",
                      }}
                      strokeWidth={1}
                    />
                  ))}
                  <polygon
                    points={toPoints(top)}
                    style={{
                      fill: on
                        ? "rgb(var(--hero-accent) / 0.18)"
                        : "hsl(var(--foreground) / 0.05)",
                      stroke: on
                        ? "rgb(var(--hero-accent) / 0.95)"
                        : "hsl(var(--foreground) / 0.24)",
                      transition: "fill 400ms ease, stroke 400ms ease",
                    }}
                    strokeWidth={1}
                  />
                </g>
              );
            })}
        </g>

        <style>{`
          @keyframes cli-cube-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
          }
          .cli-cube-float {
            animation: cli-cube-float 5s ease-in-out infinite;
            transform-box: view-box;
          }
        `}</style>
      </svg>
    </div>
  );
}
