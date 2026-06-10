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

function diamond(cy: number) {
  return `${CX},${cy - HH} ${CX + HW},${cy} ${CX},${cy + HH} ${CX - HW},${cy}`;
}
function leftFace(cy: number) {
  return `${CX - HW},${cy} ${CX},${cy + HH} ${CX},${cy + HH + THICK} ${CX - HW},${cy + THICK}`;
}
function rightFace(cy: number) {
  return `${CX + HW},${cy} ${CX},${cy + HH} ${CX},${cy + HH + THICK} ${CX + HW},${cy + THICK}`;
}

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
  const live = hovered && !reduced;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(
      () => setActive((a) => (a + 1) % layers.length),
      live ? 650 : 1500,
    );
    return () => window.clearInterval(id);
  }, [reduced, live]);

  return (
    <div
      className="absolute inset-0 bg-[#0c0d10]"
      style={{
        transform: live
          ? "perspective(720px) translateY(-6px) rotateX(5deg) rotateY(-13deg) scale(1.035)"
          : "perspective(720px) translateY(0) rotateX(0deg) rotateY(0deg) scale(1)",
        transformStyle: "preserve-3d",
        transition: "transform 560ms cubic-bezier(0.22,1,0.36,1)",
        willChange: "transform",
      }}
    >
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
                    stroke: on ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.16)",
                    transition: "stroke 400ms ease",
                  }}
                  strokeWidth={1}
                />
                <circle
                  cx={endX}
                  cy={cy}
                  r={on ? 3 : 2}
                  style={{
                    fill: on ? "#ffffff" : "rgba(255,255,255,0.3)",
                    transition: "fill 400ms ease, r 400ms ease",
                  }}
                />
                <text
                  x={isLeft ? endX - 8 : endX + 8}
                  y={cy + 3}
                  textAnchor={isLeft ? "end" : "start"}
                  style={{
                    fill: on ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.4)",
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
              return (
                <g
                  key={`p-${layer.label}`}
                  style={{
                    transform: on ? "translateY(-4px)" : "translateY(0)",
                    transition: "transform 400ms ease",
                  }}
                >
                  <polygon
                    points={leftFace(cy)}
                    style={{
                      fill: on ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.025)",
                      stroke: on ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.16)",
                      transition: "fill 400ms ease, stroke 400ms ease",
                    }}
                    strokeWidth={1}
                  />
                  <polygon
                    points={rightFace(cy)}
                    style={{
                      fill: on ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.015)",
                      stroke: on ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.16)",
                      transition: "fill 400ms ease, stroke 400ms ease",
                    }}
                    strokeWidth={1}
                  />
                  <polygon
                    points={diamond(cy)}
                    style={{
                      fill: on ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.04)",
                      stroke: on ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.22)",
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
