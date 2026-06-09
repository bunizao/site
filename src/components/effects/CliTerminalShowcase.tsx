import { useEffect, useState } from "react";

// A self-typing terminal that cycles through the CLI cluster, running each
// tool's signature command and streaming its output. The animation IS the
// content — commands and outputs are honest representations of each tool.

interface Scene {
  tool: string;
  command: string;
  output: string[];
}

const scenes: Scene[] = [
  {
    tool: "moodle-cli",
    command: "moodle assignments --due",
    output: [
      "FIT2099  Assignment 3       due in 2 days",
      "FIT3077  Sprint 2 demo      due in 5 days",
      "FIT1055  Reflective essay   due in 9 days",
    ],
  },
  {
    tool: "always-attend",
    command: "always-attend run",
    output: [
      "→ FIT2099  Mon 10:00   code 4821   ✓ submitted",
      "→ FIT3077  Wed 14:00   code 9530   ✓ submitted",
      "2 sessions marked present",
    ],
  },
  {
    tool: "edstem-cli",
    command: "edstem threads --course FIT2099 --unread",
    output: [
      "#482  Clarification on rubric Q2        3 replies",
      "#479  Is the demo individual or group?  7 replies",
      "#471  Extension policy?                 1 reply",
    ],
  },
  {
    tool: "ontrack-cli",
    command: "ontrack tasks --pending",
    output: [
      "Task 4.2  Inheritance refactor   needs fix",
      "Task 5.1  Design rationale        ready",
      "2 tasks awaiting submission",
    ],
  },
  {
    tool: "okta-auth",
    command: "okta-auth login",
    output: [
      "✓ SSO session established",
      "token cached · expires in 8h",
    ],
  },
];

type Phase = "typing" | "running" | "output" | "hold";

const TYPE_MS = 48;
const RUN_MS = 520;
const LINE_MS = 170;
const HOLD_MS = 2300;
const OUTPUT_RESERVED_LINES = 3;

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

export default function CliTerminalShowcase() {
  const reduced = usePrefersReducedMotion();
  const [scene, setScene] = useState(0);
  const [typed, setTyped] = useState(0);
  const [outLines, setOutLines] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");

  const current = scenes[scene];

  useEffect(() => {
    if (reduced) return;

    let timer: number;
    const { command, output } = scenes[scene];

    if (phase === "typing") {
      timer = window.setTimeout(
        () => (typed < command.length ? setTyped(typed + 1) : setPhase("running")),
        typed < command.length ? TYPE_MS : 320,
      );
    } else if (phase === "running") {
      timer = window.setTimeout(() => setPhase("output"), RUN_MS);
    } else if (phase === "output") {
      timer = window.setTimeout(
        () => (outLines < output.length ? setOutLines(outLines + 1) : setPhase("hold")),
        outLines < output.length ? LINE_MS : HOLD_MS,
      );
    } else {
      timer = window.setTimeout(() => {
        setTyped(0);
        setOutLines(0);
        setScene((scene + 1) % scenes.length);
        setPhase("typing");
      }, 60);
    }

    return () => window.clearTimeout(timer);
  }, [phase, typed, outLines, scene, reduced]);

  // Reduced motion: show the first scene fully, no timers.
  const shownCommand = reduced ? current.command : current.command.slice(0, typed);
  const shownOutput = reduced ? current.output : current.output.slice(0, outLines);
  const showCursor = !reduced && (phase === "typing" || phase === "running");

  return (
    <div className="cli-showcase w-full max-w-[680px]">
      <div className="overflow-hidden rounded-xl border border-white/12 bg-[#0c0d10] shadow-2xl shadow-black/50">
        {/* Title bar */}
        <div className="flex items-center gap-1.5 border-b border-white/10 px-3.5 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="ml-2 font-code text-[11px] text-white/40">
            {current.tool} — zsh
          </span>
        </div>

        {/* Body */}
        <div className="px-4 py-4 font-code text-[13px] leading-[1.65]">
          <div className="flex">
            <span className="mr-2 select-none text-white/45">❯</span>
            <span className="text-white/90">
              {shownCommand}
              {showCursor && (
                <span className="ml-0.5 inline-block h-[1.05em] w-[0.55em] translate-y-[0.18em] animate-pulse bg-white/70" />
              )}
            </span>
          </div>

          <div
            className="mt-2 text-white/55"
            style={{ minHeight: `${OUTPUT_RESERVED_LINES * 1.65}em` }}
          >
            {shownOutput.map((line, i) => (
              <div key={i} className="whitespace-pre">
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tool legend — the active tool lights up as the loop advances */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {scenes.map((s, i) => (
          <span
            key={s.tool}
            className={`font-code text-[11px] transition-colors duration-300 ${
              i === scene ? "text-white/85" : "text-white/30"
            }`}
          >
            {s.tool}
          </span>
        ))}
      </div>
    </div>
  );
}
