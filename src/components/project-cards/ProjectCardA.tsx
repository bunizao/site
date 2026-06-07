import { ArrowUpRight, Code2, Sparkles } from "lucide-react";

const tags = ["Ghost", "Theme", "TailwindCSS"];

export default function ProjectCardA() {
  return (
    <a
      href="https://github.com/bunizao/Attegi"
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block h-[500px] overflow-hidden rounded-[8px] border border-white/[0.14] bg-[#111] text-white shadow-2xl shadow-black/30 sm:h-[470px]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(94,234,212,0.36),transparent_27%),radial-gradient(circle_at_86%_20%,rgba(251,113,133,0.3),transparent_24%),linear-gradient(135deg,#101010_0%,#1f1f1f_48%,#0c0c0c_100%)]" />
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.16) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="absolute -left-20 top-20 h-48 w-48 rotate-12 border border-cyan-200/25" />
      <div className="absolute right-6 top-6 flex items-center gap-2 rounded-[4px] border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] uppercase tracking-normal text-white/[0.72] backdrop-blur-md">
        <Sparkles className="h-3 w-3 text-cyan-200" />
        Live theme
      </div>

      <div className="relative flex h-full flex-col justify-between p-5 sm:p-7">
        <div>
          <div className="flex items-center gap-2 text-[12px] uppercase tracking-normal text-white/[0.58]">
            <Code2 className="h-4 w-4" />
            bunizao/Attegi
          </div>
          <h2 className="mt-5 max-w-[9ch] font-display text-[58px] font-black uppercase leading-[0.84] tracking-normal text-white sm:text-[76px]">
            Attegi
          </h2>
          <p className="mt-5 max-w-sm font-sans text-sm leading-6 text-white/[0.72] sm:text-[15px]">
            A Ghost theme with a quiet editorial spine: sharp type, fast pages, and enough edge
            that the template does not look factory-issued.
          </p>
        </div>

        <div className="relative">
          <div className="absolute -right-5 -top-16 hidden h-32 w-48 rotate-[-7deg] rounded-[8px] border border-white/[0.12] bg-white/[0.09] p-3 shadow-xl shadow-black/30 backdrop-blur-xl sm:block">
            <div className="mb-3 flex gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-300" />
              <span className="h-2 w-2 rounded-full bg-amber-300" />
              <span className="h-2 w-2 rounded-full bg-cyan-300" />
            </div>
            <div className="space-y-2">
              <div className="h-2 w-28 rounded-[2px] bg-white/70" />
              <div className="h-2 w-36 rounded-[2px] bg-white/25" />
              <div className="h-2 w-24 rounded-[2px] bg-white/25" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-[4px] border border-white/[0.14] bg-white/[0.08] px-2.5 py-1 text-[11px] text-white/[0.72] backdrop-blur-md"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-white/[0.12] pt-4 text-sm">
            <span className="text-white/[0.56]">Editorial Ghost theme</span>
            <ArrowUpRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
          </div>
        </div>
      </div>
    </a>
  );
}
