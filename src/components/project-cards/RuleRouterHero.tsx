import { useEffect, useState } from "react";

// One source rule → four platform formats. That IS the project's value prop.
// Cycling rules with a brief "compiling" beat before the tiles update.
// 2×2 grid scales fine at both L0 (340px) and L1 (680px) card sizes.

interface Rule {
  label: string;
  surge: string;
  clash: string;
  srk: string;
  qx: string;
}

const rules: Rule[] = [
  {
    label: "DOMAIN-SUFFIX,github.com,Proxy",
    surge: "DOMAIN-SUFFIX,github.com,Proxy",
    clash: "- DOMAIN-SUFFIX,github.com,PROXY",
    srk:   "DOMAIN-SUFFIX,github.com,PROXY",
    qx:    "host-suffix, github.com, proxy",
  },
  {
    label: "DOMAIN-KEYWORD,google,Proxy",
    surge: "DOMAIN-KEYWORD,google,Proxy",
    clash: "- DOMAIN-KEYWORD,google,PROXY",
    srk:   "DOMAIN-KEYWORD,google,PROXY",
    qx:    "keyword, google, proxy",
  },
  {
    label: "GEOIP,CN,DIRECT",
    surge: "GEOIP,CN,DIRECT",
    clash: "- GEOIP,CN,DIRECT",
    srk:   "GEOIP,CN,DIRECT",
    qx:    "ip-cidr, geoip:cn, direct",
  },
  {
    label: "RULE-SET,reject.list,REJECT",
    surge: "RULE-SET,reject.list,REJECT",
    clash: "- RULE-SET,reject.list,REJECT",
    srk:   "RULE-SET,reject.list,REJECT",
    qx:    "host-suffix, reject-list, reject",
  },
];

const platforms: Array<{ key: keyof Omit<Rule, "label">; name: string }> = [
  { key: "surge", name: "Surge" },
  { key: "clash", name: "Clash" },
  { key: "srk",   name: "Shadowrocket" },
  { key: "qx",    name: "Quantumult X" },
];

const HOLD_MS = 2400;
const COMPILE_MS = 380; // brief dimmed beat before tiles update

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

export default function RuleRouterHero() {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [compiling, setCompiling] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const t = window.setTimeout(() => {
      setCompiling(true);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % rules.length);
        setCompiling(false);
      }, COMPILE_MS);
    }, HOLD_MS);
    return () => window.clearTimeout(t);
  }, [index, compiling, reduced]);

  const rule = rules[index];

  return (
    <div className="flex h-full w-full flex-col bg-[#0c0d10]">
      {/* Title bar */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-white/10 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-white/20" />
        <span className="h-2 w-2 rounded-full bg-white/20" />
        <span className="h-2 w-2 rounded-full bg-white/20" />
        <span className="ml-2 truncate font-code text-[10px] text-white/40">
          TutuBetterRules · 1 source → 4 platforms
        </span>
      </div>

      {/* Source rule */}
      <div className="shrink-0 border-b border-white/[0.07] px-3 py-2">
        <p className="mb-0.5 font-code text-[9px] uppercase tracking-[0.12em] text-white/25">
          source
        </p>
        <p
          className="truncate font-code text-[11px] text-white/70"
          style={{
            opacity: compiling ? 0.3 : 1,
            transition: "opacity 200ms ease",
          }}
        >
          {rule.label}
        </p>
      </div>

      {/* 4-row platform list — platform name left, compiled rule right */}
      <div className="flex flex-1 flex-col divide-y divide-white/[0.07]">
        {platforms.map(({ key, name }) => (
          <div
            key={key}
            className="flex min-h-0 flex-1 items-center gap-3 overflow-hidden px-3"
            style={{
              opacity: compiling ? 0.25 : 1,
              transition: `opacity ${COMPILE_MS}ms ease`,
            }}
          >
            <span className="w-[82px] shrink-0 font-code text-[9px] uppercase tracking-[0.12em] text-white/30">
              {name}
            </span>
            <span className="min-w-0 flex-1 truncate font-code text-[11px] text-white/75">
              {rule[key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
