import { useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react';
import { GraduationCap, MapPin } from 'lucide-react';
import { OpenAIIcon, AnthropicIcon } from '@/components/icons';
import { ParticleVeil } from './ParticleVeil';

interface ExperienceItem {
  org: string;
  url: string;
  period: string;
  icon: ReactNode;
  /** Primary line under the org (subscription roles). */
  role?: string;
  /** Monash carries a fuller description + location instead of a role. */
  description?: string;
  location?: string;
  /** Pulsing dot — the one role that's genuinely current. */
  current?: boolean;
  /** Hidden behind a blur until hovered; reveals with a particle burst. */
  joke?: boolean;
}

const GLYPH = 'h-[17px] w-[17px]';

const experiences: ExperienceItem[] = [
  {
    org: 'Monash University',
    url: 'https://www.monash.edu',
    period: 'Jul 2025 — Present',
    icon: <GraduationCap className={GLYPH} strokeWidth={1.8} />,
    description: "Studying for a Bachelor's degree in Data Science (Honours)",
    location: 'Clayton, Melbourne, Australia',
    current: true,
  },
  {
    org: 'Anthropic',
    url: 'https://www.anthropic.com',
    period: '2025 — Present',
    icon: <AnthropicIcon className={GLYPH} />,
    role: 'Subscriber, Claude',
    joke: true,
  },
  {
    org: 'OpenAI',
    url: 'https://openai.com',
    period: '2023 — Present',
    icon: <OpenAIIcon className={GLYPH} />,
    role: 'Subscriber, ChatGPT & Codex',
    joke: true,
  },
];

function RowBody({ item }: { item: ExperienceItem }) {
  return (
    <>
      <span
        className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-[hsl(var(--foreground)/0.14)] bg-[hsl(var(--card))] text-[hsl(var(--foreground)/0.82)] shadow-[0_0_0_3px_hsl(var(--background)),0_1px_2px_hsl(var(--foreground)/0.06)]"
        aria-hidden="true"
      >
        {item.icon}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-px">
        <span className="flex items-center gap-2">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit text-[15px] font-semibold leading-snug tracking-[-0.01em] text-[hsl(var(--foreground))] transition-opacity duration-150 hover:opacity-60"
          >
            {item.org}
          </a>
          {item.current && (
            <span className="relative flex h-[7px] w-[7px] items-center justify-center" aria-label="Current">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--foreground)/0.4)]" />
              <span className="relative inline-flex h-[6px] w-[6px] rounded-full bg-[hsl(var(--foreground)/0.55)]" />
            </span>
          )}
        </span>

        {item.role && (
          <span className="text-[13px] leading-snug text-[hsl(var(--muted-foreground))]">
            {item.role}
          </span>
        )}

        {item.description && (
          <span className="text-[13px] leading-snug text-[hsl(var(--muted-foreground))]">
            {item.description}
          </span>
        )}

        {item.location && (
          <span className="mt-0.5 flex items-center gap-1 text-[12px] leading-snug text-[hsl(var(--muted-foreground)/0.7)]">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {item.location}
          </span>
        )}
      </div>

      <span className="shrink-0 pt-[3px] text-[12px] font-light leading-snug tabular-nums text-[hsl(var(--muted-foreground)/0.6)] max-[480px]:w-full max-[480px]:pl-[50px] max-[480px]:pt-1">
        {item.period}
      </span>
    </>
  );
}

const ROW_FLEX =
  'flex flex-wrap items-start gap-[14px] py-4 min-[481px]:flex-nowrap';

export default function ExperienceTimeline() {
  // The joke rows share one reveal state — hovering either dissolves both veils.
  const [revealed, setRevealed] = useState(false);

  const leavingGroup = (next: EventTarget | null) =>
    !(next instanceof Element) || !next.closest('[data-joke-group]');

  const show = () => setRevealed(true);
  const onPointerLeave = (e: PointerEvent) => {
    if (leavingGroup(e.relatedTarget)) setRevealed(false);
  };
  const onBlur = (e: FocusEvent) => {
    if (leavingGroup(e.relatedTarget)) setRevealed(false);
  };

  return (
    <ol className="m-0 list-none p-0">
      {experiences.map((item) => (
        <li
          key={item.org}
          data-joke-group={item.joke ? '' : undefined}
          onPointerEnter={item.joke ? show : undefined}
          onPointerLeave={item.joke ? onPointerLeave : undefined}
          onFocusCapture={item.joke ? show : undefined}
          onBlurCapture={item.joke ? onBlur : undefined}
          className="relative before:absolute before:left-[17px] before:top-0 before:bottom-0 before:w-px before:bg-[hsl(var(--foreground)/0.12)] first:before:top-[34px] last:before:bottom-auto last:before:h-[34px]"
        >
          {item.joke ? (
            <ParticleVeil revealed={revealed} className={ROW_FLEX}>
              <RowBody item={item} />
            </ParticleVeil>
          ) : (
            <div className={ROW_FLEX}>
              <RowBody item={item} />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
