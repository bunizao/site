import { ArrowUpRight, Image, Layers3 } from "lucide-react";

const chips = ["Open Graph", "React", "TypeScript"];

export default function ProjectCardC() {
  return (
    <a
      href="https://github.com/bunizao/ogis"
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block h-[500px] overflow-hidden rounded-[8px] border border-zinc-950/10 bg-[#f8f7f2] text-zinc-950 shadow-2xl shadow-zinc-950/20 dark:border-white/10 dark:bg-[#090909] dark:text-white sm:h-[470px]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(59,130,246,0.24),transparent_25%),radial-gradient(circle_at_84%_14%,rgba(249,115,22,0.24),transparent_22%),linear-gradient(145deg,rgba(24,24,27,0.06),transparent_58%)] dark:bg-[radial-gradient(circle_at_20%_18%,rgba(96,165,250,0.22),transparent_25%),radial-gradient(circle_at_84%_14%,rgba(251,146,60,0.22),transparent_22%),linear-gradient(145deg,rgba(255,255,255,0.06),transparent_58%)]" />
      <div className="absolute -right-24 top-10 h-72 w-72 rounded-full bg-[conic-gradient(from_120deg,rgba(59,130,246,0.48),rgba(249,115,22,0.5),rgba(34,197,94,0.42),rgba(59,130,246,0.48))] opacity-70 blur-2xl" />
      <div className="absolute bottom-8 left-7 h-24 w-24 rotate-45 border border-zinc-950/10 dark:border-white/10" />

      <div className="relative flex h-full flex-col justify-between p-5 sm:p-7">
        <div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[12px] uppercase tracking-normal text-zinc-600 dark:text-white/[0.58]">
              <Image className="h-4 w-4" />
              Dynamic images
            </div>
            <Layers3 className="h-5 w-5 text-orange-500" />
          </div>
          <h2 className="mt-5 font-display text-[54px] font-black uppercase leading-[0.9] tracking-normal sm:text-[72px]">
            ogis
          </h2>
          <p className="mt-4 max-w-md font-sans text-sm leading-6 text-zinc-700 dark:text-white/[0.68] sm:text-[15px]">
            Open Graph image generation with composable templates, precise rendering, and previews
            that look intentional before the link leaves your tab.
          </p>
        </div>

        <div className="relative my-4">
          <div className="absolute -right-3 -top-4 h-full w-full rotate-2 rounded-[8px] border border-zinc-950/10 bg-white/[0.42] dark:border-white/10 dark:bg-white/[0.08]" />
          <div className="relative overflow-hidden rounded-[8px] border border-zinc-950/[0.12] bg-white shadow-xl shadow-zinc-950/[0.12] dark:border-white/10 dark:bg-zinc-950">
            <img
              src="/api/project.svg?project=ogis&theme=light"
              alt="ogis generated project preview"
              className="h-auto w-full dark:hidden"
              loading="lazy"
            />
            <img
              src="/api/project.svg?project=ogis&theme=dark"
              alt="ogis generated project preview"
              className="hidden h-auto w-full dark:block"
              loading="lazy"
            />
          </div>
        </div>

        <div>
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <span
                key={chip}
                className="rounded-[4px] border border-zinc-950/10 bg-white/[0.64] px-2.5 py-1 text-[11px] text-zinc-700 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.08] dark:text-white/[0.64]"
              >
                {chip}
              </span>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-zinc-950/10 pt-4 text-sm text-zinc-600 dark:border-white/10 dark:text-white/[0.56]">
            <span>Image API / template renderer</span>
            <ArrowUpRight className="h-5 w-5 text-zinc-950 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1 dark:text-white" />
          </div>
        </div>
      </div>
    </a>
  );
}
