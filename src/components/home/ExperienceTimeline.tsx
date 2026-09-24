import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { experience, type ExperienceItem } from '@/data/site';

const GLYPH = 'h-[17px] w-[17px]';

function RowBody({ item }: { item: ExperienceItem }) {
  return (
    <>
      <span
        className="exp-tile relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[hsl(var(--foreground)/0.82)]"
        aria-hidden="true"
      >
        <item.icon className={GLYPH} strokeWidth={item.strokeWidth} />
      </span>

      {/* Typography lives in Experience.astro's style block, on the exp-* class
          names, so this section reads the same --home-* scale as the four
          Astro sections instead of carrying its own hardcoded sizes. */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-px">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="exp-org w-fit transition-opacity duration-150 hover:opacity-60"
        >
          {item.org}
        </a>

        {item.role && <span className="exp-detail text-pretty">{item.role}</span>}

        {item.description && (
          <span className="exp-detail text-pretty">{item.description}</span>
        )}

        {item.location && (
          <span className="exp-location mt-0.5 flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {item.location}
          </span>
        )}
      </div>

      <span className="exp-period shrink-0 pt-[3px] max-[480px]:w-full max-[480px]:pl-[50px] max-[480px]:pt-1">
        {item.period}
      </span>
    </>
  );
}

const ROW_FLEX =
  'flex flex-wrap items-start gap-[14px] py-4 min-[481px]:flex-nowrap';

export default function ExperienceTimeline() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <ol className="m-0 list-none p-0" data-experience-timeline={hydrated ? 'hydrated' : 'ssr'}>
      {experience.map((item) => (
        <li
          key={item.org}
          className="relative before:absolute before:left-[17px] before:top-0 before:bottom-0 before:w-px before:bg-[hsl(var(--foreground)/0.12)] first:before:top-[34px] last:before:bottom-auto last:before:h-[34px]"
        >
          <div className={ROW_FLEX}>
            <RowBody item={item} />
          </div>
        </li>
      ))}
    </ol>
  );
}
