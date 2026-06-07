import { ArrowUpRight, Boxes, GitBranch } from "lucide-react";

const registries = ["ghcr.io", "docker.io", "quay.io"];

export default function ProjectCardB() {
  return (
    <a
      href="https://github.com/bunizao/Mirrored"
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block h-[500px] overflow-hidden rounded-[8px] border border-slate-900/[0.12] bg-[#eef3f1] text-slate-950 shadow-2xl shadow-slate-950/20 dark:border-white/10 dark:bg-[#0c1210] dark:text-white sm:h-[470px]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(20,184,166,0.3),transparent_26%),radial-gradient(circle_at_86%_18%,rgba(245,158,11,0.34),transparent_22%),linear-gradient(135deg,rgba(15,23,42,0.08),transparent_52%)] dark:bg-[radial-gradient(circle_at_16%_14%,rgba(45,212,191,0.24),transparent_25%),radial-gradient(circle_at_88%_24%,rgba(251,191,36,0.22),transparent_22%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_52%)]" />
      <svg
        className="absolute right-0 top-0 h-full w-[55%] text-slate-900/10 dark:text-white/10"
        viewBox="0 0 240 420"
        fill="none"
        aria-hidden="true"
      >
        <path d="M26 42h142l42 42v250H26V42Z" stroke="currentColor" strokeWidth="2" />
        <path d="M168 42v42h42" stroke="currentColor" strokeWidth="2" />
        <path d="M60 150h116M60 188h92M60 226h126M60 264h76" stroke="currentColor" strokeWidth="2" />
      </svg>

      <div className="relative flex h-full flex-col justify-between p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[12px] uppercase tracking-normal text-slate-700 dark:text-white/[0.58]">
              <Boxes className="h-4 w-4" />
              Registry automation
            </div>
            <h2 className="mt-5 font-code text-[46px] font-black leading-none tracking-normal sm:text-[62px]">
              Mirrored
            </h2>
          </div>
          <div className="rounded-[4px] border border-slate-950/10 bg-white/[0.65] px-2.5 py-1 text-[11px] uppercase tracking-normal text-slate-700 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/10 dark:text-white/70">
            CI sync
          </div>
        </div>

        <div className="my-6 grid gap-3 sm:my-4">
          {registries.map((registry, index) => (
            <div
              key={registry}
              className="relative flex items-center justify-between rounded-[8px] border border-slate-950/10 bg-white/[0.72] px-4 py-3 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.08]"
            >
              <span className="font-code text-sm font-semibold">{registry}</span>
              <span className="flex items-center gap-2 text-[11px] uppercase tracking-normal text-slate-600 dark:text-white/[0.56]">
                <span
                  className="h-2 w-2 animate-pulse rounded-full bg-teal-500 shadow-[0_0_18px_rgba(20,184,166,0.9)]"
                  style={{ animationDelay: `${index * 160}ms` }}
                />
                synced
              </span>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-5 flex items-center gap-3 rounded-[8px] border border-slate-950/10 bg-slate-950 px-4 py-3 text-white shadow-lg shadow-slate-950/20 dark:border-white/10 dark:bg-black/[0.42]">
            <GitBranch className="h-5 w-5 text-amber-300" />
            <p className="font-sans text-sm leading-5 text-white/[0.76]">
              Automated mirror sync that keeps container images moving without turning CI into a
              shrine of YAML.
            </p>
          </div>
          <div className="flex items-center justify-between border-t border-slate-950/10 pt-4 text-sm text-slate-700 dark:border-white/10 dark:text-white/[0.58]">
            <span>Python / CI/CD / Automation</span>
            <ArrowUpRight className="h-5 w-5 text-slate-950 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1 dark:text-white" />
          </div>
        </div>
      </div>
    </a>
  );
}
