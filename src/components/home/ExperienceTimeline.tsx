import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type TouchEvent,
} from 'react';
import { MapPin } from 'lucide-react';
import { experience, type ExperienceItem } from '@/data/site';
import { FogReveal } from './FogReveal';

const GLYPH = 'h-[17px] w-[17px]';

function RowBody({ item }: { item: ExperienceItem }) {
  return (
    <>
      <span
        className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-[hsl(var(--foreground)/0.14)] bg-[hsl(var(--card))] text-[hsl(var(--foreground)/0.82)] shadow-[0_0_0_3px_hsl(var(--background)),0_1px_2px_hsl(var(--foreground)/0.06)]"
        aria-hidden="true"
      >
        <item.icon className={GLYPH} strokeWidth={item.strokeWidth} />
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
            <span className="relative flex h-[7px] w-[7px] items-center justify-center">
              <span className="sr-only">Current</span>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--foreground)/0.4)]" aria-hidden="true" />
              <span className="relative inline-flex h-[6px] w-[6px] rounded-full bg-[hsl(var(--foreground)/0.55)]" aria-hidden="true" />
            </span>
          )}
        </span>

        {item.role && (
          <span className="text-[13px] leading-snug tracking-[-0.01em] text-pretty text-[hsl(var(--muted-foreground))]">
            {item.role}
          </span>
        )}

        {item.description && (
          <span className="text-[13px] leading-snug tracking-[-0.01em] text-pretty text-[hsl(var(--muted-foreground))]">
            {item.description}
          </span>
        )}

        {item.location && (
          <span className="mt-0.5 flex items-center gap-1 text-[12px] leading-snug tracking-[-0.01em] text-[hsl(var(--muted-foreground)/0.7)]">
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
  const [hoverRevealed, setHoverRevealed] = useState(false);
  const [lockedRevealed, setLockedRevealed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const blockNextTouchClick = useRef(false);
  const resetTouchClickBlock = useRef<number | null>(null);
  const revealed = hoverRevealed || lockedRevealed;

  useEffect(() => {
    setHydrated(true);
  }, []);

  const leavingGroup = (next: EventTarget | null) =>
    !(next instanceof Element) || !next.closest('[data-joke-group]');

  const show = () => setHoverRevealed(true);
  const clearTouchClickBlockTimer = () => {
    if (resetTouchClickBlock.current === null) return;

    window.clearTimeout(resetTouchClickBlock.current);
    resetTouchClickBlock.current = null;
  };
  const clearTouchClickBlockSoon = () => {
    clearTouchClickBlockTimer();
    resetTouchClickBlock.current = window.setTimeout(() => {
      blockNextTouchClick.current = false;
      resetTouchClickBlock.current = null;
    }, 350);
  };
  const lockReveal = () => {
    setLockedRevealed(true);
    setHoverRevealed(true);
  };
  const onPointerDownCapture = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;

    blockNextTouchClick.current = !lockedRevealed;
    lockReveal();
  };
  const onTouchStartCapture = () => {
    blockNextTouchClick.current = !lockedRevealed;
    lockReveal();
  };
  const onTouchEndCapture = (e: TouchEvent) => {
    if (!blockNextTouchClick.current) return;

    e.preventDefault();
    e.stopPropagation();
    clearTouchClickBlockSoon();
  };
  const onClickCapture = (e: MouseEvent) => {
    if (!blockNextTouchClick.current) return;

    clearTouchClickBlockTimer();
    blockNextTouchClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };
  const onPointerLeave = (e: PointerEvent) => {
    if (!lockedRevealed && leavingGroup(e.relatedTarget)) setHoverRevealed(false);
  };
  const onBlur = (e: FocusEvent) => {
    if (!lockedRevealed && leavingGroup(e.relatedTarget)) setHoverRevealed(false);
  };

  return (
    <ol className="m-0 list-none p-0" data-experience-timeline={hydrated ? 'hydrated' : 'ssr'}>
      {experience.map((item) => (
        <li
          key={item.org}
          data-joke-group={item.joke ? '' : undefined}
          data-experience-joke-row={item.joke ? '' : undefined}
          data-revealed={item.joke ? String(revealed) : undefined}
          onPointerEnter={item.joke ? show : undefined}
          onPointerDownCapture={item.joke ? onPointerDownCapture : undefined}
          onTouchStartCapture={item.joke ? onTouchStartCapture : undefined}
          onTouchEndCapture={item.joke ? onTouchEndCapture : undefined}
          onClickCapture={item.joke ? onClickCapture : undefined}
          onPointerLeave={item.joke ? onPointerLeave : undefined}
          onFocusCapture={item.joke ? show : undefined}
          onBlurCapture={item.joke ? onBlur : undefined}
          className="relative before:absolute before:left-[17px] before:top-0 before:bottom-0 before:w-px before:bg-[hsl(var(--foreground)/0.12)] first:before:top-[34px] last:before:bottom-auto last:before:h-[34px]"
        >
          {item.joke ? (
            <FogReveal revealed={revealed} className={ROW_FLEX}>
              <RowBody item={item} />
            </FogReveal>
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
