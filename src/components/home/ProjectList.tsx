import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, ChevronDown, Star } from 'lucide-react';

export interface ListProject {
  name: string;
  url: string;
  description: string;
  role: 'Author' | 'Contributor';
  tags: string[];
  stars?: number | null;
}

interface ProjectListProps {
  projects: ListProject[];
  /** How many rows show before "Show More". */
  max?: number;
}

// 55102 reads as noise; 55.1k reads as a number.
function formatStars(stars: number): string {
  if (stars < 1000) return String(stars);
  const k = stars / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
}

export default function ProjectList({ projects, max = 4 }: ProjectListProps) {
  const reduced = useReducedMotion();
  const [openName, setOpenName] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (projects.length === 0) return null;

  const visible = showAll ? projects : projects.slice(0, max);
  const hiddenCount = projects.length - max;

  return (
    <div>
      <ul className="m-0 list-none p-0">
        {visible.map((project) => {
          const isOpen = openName === project.name;
          const canExpand = Boolean(project.description) || project.tags.length > 0;

          return (
            <li
              key={project.name}
              className="border-b border-[hsl(var(--foreground)/0.08)] last:border-b-0"
            >
              <div className="flex items-stretch transition-colors duration-150 hover:bg-[hsl(var(--foreground)/0.025)]">
                {/* Logo node */}
                <div className="flex w-[62px] shrink-0 justify-center pt-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[11px] border border-[hsl(var(--foreground)/0.14)] bg-[hsl(var(--card))] font-code text-[15px] font-medium text-[hsl(var(--foreground)/0.7)] shadow-[0_1px_2px_hsl(var(--foreground)/0.05)]">
                    {project.name.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Content column, divided from the node by a dashed rail */}
                <div className="min-w-0 flex-1 border-l border-dashed border-[hsl(var(--foreground)/0.14)]">
                  <button
                    type="button"
                    onClick={() => canExpand && setOpenName(isOpen ? null : project.name)}
                    aria-expanded={isOpen}
                    disabled={!canExpand}
                    className="flex w-full items-center gap-2 py-4 pl-4 pr-3 text-left disabled:cursor-default"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <h3 className="truncate font-display text-[14px] font-medium leading-snug text-[hsl(var(--foreground))]">
                          {project.name}
                        </h3>
                        <span className="shrink-0 font-code text-[10px] font-medium uppercase tracking-[0.04em] text-[hsl(var(--muted-foreground)/0.7)]">
                          {project.role}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
                        {typeof project.stars === 'number' && (
                          <span className="flex items-center gap-1 font-code text-[12px] tabular-nums">
                            <Star className="h-3 w-3" aria-hidden="true" />
                            {formatStars(project.stars)}
                          </span>
                        )}
                        {typeof project.stars === 'number' && project.tags[0] && (
                          <span className="h-3 w-px bg-[hsl(var(--foreground)/0.15)]" aria-hidden="true" />
                        )}
                        {project.tags[0] && (
                          <span className="truncate font-code text-[12px] text-[hsl(var(--muted-foreground)/0.8)]">
                            {project.tags[0]}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* External link sits inside the row but acts independently */}
                    <a
                      href={project.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Open ${project.name}`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground)/0.7)] transition-colors hover:bg-[hsl(var(--foreground)/0.06)] hover:text-[hsl(var(--foreground))]"
                    >
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </a>

                    {canExpand && (
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground)/0.6)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      />
                    )}
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={reduced ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ duration: reduced ? 0 : 0.25, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-3 border-t border-[hsl(var(--foreground)/0.08)] px-4 py-3.5">
                          {project.description && (
                            <p className="font-sans text-[13px] leading-relaxed text-[hsl(var(--foreground)/0.62)]">
                              {project.description}
                            </p>
                          )}
                          {project.tags.length > 0 && (
                            <ul className="flex flex-wrap gap-1.5">
                              {project.tags.map((tag) => (
                                <li
                                  key={tag}
                                  className="rounded-md border border-[hsl(var(--foreground)/0.1)] bg-[hsl(var(--foreground)/0.03)] px-1.5 py-0.5 font-code text-[11px] text-[hsl(var(--muted-foreground))]"
                                >
                                  {tag}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {hiddenCount > 0 && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-[hsl(var(--foreground)/0.12)] bg-[hsl(var(--foreground)/0.02)] py-1.5 pl-3 pr-2.5 font-code text-[12px] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--foreground)/0.05)] hover:text-[hsl(var(--foreground))]"
          >
            {showAll ? 'Show less' : `Show ${hiddenCount} more`}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      )}
    </div>
  );
}
