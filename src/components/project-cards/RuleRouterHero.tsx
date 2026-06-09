import { useEffect, useState } from "react";

// A live traffic monitor for the proxy rules: domains stream in from the top,
// each one gets matched to a policy after a brief "scanning" beat. This is what
// the project actually does — route traffic — instead of a static config dump.
// setTimeout-driven so it survives backgrounded tabs (rAF would pause).

type Policy = "PROXY" | "DIRECT" | "REJECT";

interface Hit {
  domain: string;
  policy: Policy;
}

// Honest, recognizable traffic — the kind of decisions the ruleset makes.
const feed: Hit[] = [
  { domain: "github.com", policy: "PROXY" },
  { domain: "doubleclick.net", policy: "REJECT" },
  { domain: "taobao.com", policy: "DIRECT" },
  { domain: "googlevideo.com", policy: "PROXY" },
  { domain: "analytics.google.com", policy: "REJECT" },
  { domain: "weixin.qq.com", policy: "DIRECT" },
  { domain: "telegram.org", policy: "PROXY" },
  { domain: "adservice.google", policy: "REJECT" },
  { domain: "baidu.com", policy: "DIRECT" },
  { domain: "openai.com", policy: "PROXY" },
];

const ROWS = 6;
const SCAN_MS = 520; // time spent "matching" before the policy resolves
const HOLD_MS = 900; // time the resolved row sits before the next arrives

// Monochrome tiers — the decision reads by intensity, not color.
const policyClass: Record<Policy, string> = {
  PROXY: "text-white",
  DIRECT: "text-white/55",
  REJECT: "text-white/30 line-through",
};
const dotClass: Record<Policy, string> = {
  PROXY: "bg-white",
  DIRECT: "bg-white/55",
  REJECT: "bg-white/25",
};

interface Row {
  key: number;
  hit: Hit;
  resolved: boolean;
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

const seed = (): Row[] =>
  Array.from({ length: ROWS }, (_, i) => ({
    key: i,
    hit: feed[i % feed.length],
    resolved: true,
  }));

export default function RuleRouterHero() {
  const reduced = usePrefersReducedMotion();
  const [rows, setRows] = useState<Row[]>(seed);
  const [cursor, setCursor] = useState(ROWS);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (reduced) return;

    let timer: number;
    if (scanning) {
      // The newest row is in flight — resolve its policy.
      timer = window.setTimeout(() => {
        setRows((prev) =>
          prev.map((r, i) => (i === prev.length - 1 ? { ...r, resolved: true } : r)),
        );
        setScanning(false);
      }, SCAN_MS);
    } else {
      // Wait, then push the next domain in (unresolved) and drop the oldest.
      timer = window.setTimeout(() => {
        const hit = feed[cursor % feed.length];
        setRows((prev) => [
          ...prev.slice(1),
          { key: cursor, hit, resolved: false },
        ]);
        setCursor((c) => c + 1);
        setScanning(true);
      }, HOLD_MS);
    }
    return () => window.clearTimeout(timer);
  }, [scanning, cursor, reduced]);

  return (
    <div className="flex h-full w-full flex-col bg-[#0c0d10]">
      {/* Title bar */}
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-white/20" />
        <span className="h-2 w-2 rounded-full bg-white/20" />
        <span className="h-2 w-2 rounded-full bg-white/20" />
        <span className="ml-2 truncate font-code text-[10px] text-white/40">
          Surge · TutuBetterRules
        </span>
      </div>

      {/* Live match feed */}
      <div className="flex flex-1 flex-col justify-end gap-[3px] overflow-hidden px-3 py-2.5 font-code text-[11px] leading-none">
        {rows.map((row, i) => {
          const isNewest = i === rows.length - 1;
          const pending = isNewest && !row.resolved;
          return (
            <div
              key={row.key}
              className="flex items-center gap-2"
              style={{
                opacity: 0.35 + (i / (rows.length - 1)) * 0.65,
                transition: "opacity 500ms ease",
              }}
            >
              <span className="min-w-0 flex-1 truncate text-white/70">
                {row.hit.domain}
              </span>
              <span className="select-none text-white/25">→</span>
              {pending ? (
                <span className="inline-flex w-[68px] items-center gap-1 text-white/35">
                  <span className="animate-pulse">scanning</span>
                </span>
              ) : (
                <span
                  className={`inline-flex w-[68px] items-center gap-1.5 font-semibold tracking-wide ${policyClass[row.hit.policy]}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${dotClass[row.hit.policy]}`} />
                  {row.hit.policy}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
