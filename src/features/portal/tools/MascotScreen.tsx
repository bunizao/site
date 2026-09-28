import * as React from 'react';
import { PEEK_NAVBAR_LOGO, PEEK_PREVIEW_TRACKER_LOGO, createPeekLogoFromAssets } from '@/features/logos/data/peek-runtime';
import {
  getPeekAssets,
  getPeekBase,
  getPeekPreviewSections,
  getPeekRuntimeBehaviors,
  getPeekSlotKey,
  getPeekTrackingPoseKeys,
} from '@/features/mascot/peek/catalog';
import type { MascotAsset } from '@/features/mascot/peek/model';
import { PEEK_SLOTS } from '@/features/mascot/peek/slots';
import { PEEK_STICKER_ASSETS } from '@/features/mascot/peek/stickers';
import { cn } from '@/lib/utils';
import { BLEED, GUTTER, LIST, Mono, ROW, Section } from '../activity/table';
import { useSavedScroll, useScrollRestoration } from '../app/scroll';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { LOOK_COLORS, PeekLook, PeekSprite, PeekStill } from './PeekSprite';

/* peek, as the site ships it: which slot plays what, the navbar behaviour,
   the 404 tracking rig, the stickers, and every asset in the catalog. The
   stages keep the mascot's own dark canvas; everything around them is the
   portal's flat look. */

const mascot = getPeekBase();
const assets = getPeekAssets();
const sections = getPeekPreviewSections();
const behaviors = getPeekRuntimeBehaviors();
const NAV_REST = getPeekSlotKey('navbar.brand.default');
const NAV_HOVER = getPeekSlotKey('navbar.brand.hover');
const TRACK_REST = getPeekSlotKey('preview.tracker.default');
const TRACK_POSES = getPeekTrackingPoseKeys('preview');
const TRACK_CHANNEL = 'preview-track';

const COUNTS: Array<[string, number]> = [
  ['assets', assets.length],
  ['slots', PEEK_SLOTS.length],
  ['timelines', assets.filter((asset) => asset.timeline).length],
  ['motions', assets.filter((asset) => asset.kind === 'motion').length],
  ['poses', assets.filter((asset) => asset.kind === 'pose').length],
  ['expressions', assets.filter((asset) => asset.kind === 'expression').length],
  ['costumes', assets.filter((asset) => asset.kind === 'costume').length],
];

/** Catalog labels are Title Case; portal headings are not. */
function sentenceCase(label: string): string {
  return label.charAt(0) + label.slice(1).toLowerCase();
}

const STAGE = 'flex items-center justify-center rounded-lg bg-[hsl(240_6%_4%)] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]';

function Facts({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[13px]">
      {rows.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ */

function Summary() {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-6 gap-y-3 py-3', GUTTER)}>
      <div className={cn(STAGE, 'size-32 shrink-0')}>
        <PeekStill grid={mascot.base} width={mascot.width} height={mascot.height} accent={mascot.accent} size={96} title="peek base grid" />
      </div>
      <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1.5">
        <p className="text-sm">
          <span className="font-medium">{mascot.name}</span>
          <span className="text-muted-foreground">, {mascot.tagline}. </span>
          {mascot.blurb}
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-muted-foreground">
          <span>
            Grid <Mono className="text-foreground">{mascot.width} × {mascot.height}</Mono>
          </span>
          <span>
            Accent <Mono className="text-foreground">{mascot.accent}</Mono>
          </span>
          {COUNTS.map(([label, value]) => (
            <span key={label}>
              <Mono className="text-foreground">{value}</Mono> {label}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

function RuntimeMap() {
  return (
    <Section title="Runtime map" meta={`${behaviors.length} live slots`} headingId="mascot-runtime">
      <ul className={LIST}>
        {behaviors.map((behavior) => (
          <li
            key={behavior.slotId}
            className={cn(
              'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 py-2 text-sm sm:grid-cols-[13rem_minmax(0,1fr)_7rem]',
              BLEED,
              ROW,
            )}
          >
            <Mono className="text-muted-foreground text-xs max-sm:col-span-2">{behavior.slotId}</Mono>
            <span className="min-w-0">
              <span>{behavior.label}</span>
              <span className="text-muted-foreground"> — {behavior.description}</span>
            </span>
            <Mono className="text-end text-xs">{behavior.animation}</Mono>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function BrandBehaviour() {
  return (
    <Section title="Brand behaviour" meta="navbar mark" headingId="mascot-brand">
      <div className={cn('grid gap-x-6 gap-y-4 py-3 sm:grid-cols-2', GUTTER)}>
        <div className="flex items-center gap-4">
          <div className={cn(STAGE, 'aspect-square w-40 shrink-0')}>
            <PeekSprite
              definition={PEEK_NAVBAR_LOGO}
              animation={NAV_REST}
              hoverAnimation={NAV_HOVER}
              size={120}
              title="peek navbar behaviour"
              className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm">Idle at rest; point at or press it to dart</span>
            <Facts
              rows={[
                ['Rest', <Mono key="rest">{NAV_REST}</Mono>],
                ['Hover', <Mono key="hover">{NAV_HOVER}</Mono>],
              ]}
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={cn(STAGE, 'aspect-square w-40 shrink-0')}>
            <PeekStill grid={mascot.base} width={mascot.width} height={mascot.height} accent={mascot.accent} size={120} title="peek source" />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm">Source grid</span>
            <Facts
              rows={[
                ['Tagline', mascot.tagline],
                ['Grid', <Mono key="grid">{`${mascot.width} × ${mascot.height}`}</Mono>],
              ]}
            />
          </div>
        </div>
      </div>
    </Section>
  );
}

/* The 404 rig: five horizontal buckets, one pose each. A finger or pointer
   picks the bucket under it; arrow keys step through them. */
function TrackingStage() {
  const [bucket, setBucket] = React.useState<number | null>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);

  const show = React.useCallback((index: number | null) => {
    setBucket(index);
    if (index === null) window.dispatchEvent(new CustomEvent(`peek:${TRACK_CHANNEL}:revert`));
    else window.dispatchEvent(new CustomEvent(`peek:${TRACK_CHANNEL}:set`, { detail: { animation: TRACK_POSES[index] } }));
  }, []);

  const fromPointer = (event: React.PointerEvent): void => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = Math.min(0.9999, Math.max(0, (event.clientX - rect.left) / rect.width));
    const next = Math.floor(ratio * TRACK_POSES.length);
    if (next !== bucket) show(next);
  };

  return (
    <Section title="Tracking stage" meta="the 404 page rig" headingId="mascot-tracking">
      <div className={cn('flex flex-col gap-2 py-3', GUTTER)}>
        <div
          ref={stageRef}
          role="slider"
          tabIndex={0}
          aria-label="Tracking pose"
          aria-valuemin={0}
          aria-valuemax={TRACK_POSES.length - 1}
          aria-valuenow={bucket ?? Math.floor(TRACK_POSES.length / 2)}
          aria-valuetext={bucket === null ? `Resting: ${TRACK_REST}` : TRACK_POSES[bucket]}
          onPointerEnter={fromPointer}
          onPointerMove={fromPointer}
          onPointerDown={fromPointer}
          onPointerLeave={() => show(null)}
          onPointerCancel={() => show(null)}
          onBlur={() => show(null)}
          onKeyDown={(event) => {
            const from = bucket ?? Math.floor(TRACK_POSES.length / 2);
            let next: number | null = null;
            if (event.key === 'ArrowLeft') next = Math.max(0, from - (bucket === null ? 0 : 1));
            if (event.key === 'ArrowRight') next = Math.min(TRACK_POSES.length - 1, from + (bucket === null ? 0 : 1));
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = TRACK_POSES.length - 1;
            if (event.key === 'Escape') {
              show(null);
              return;
            }
            if (next === null) return;
            event.preventDefault();
            show(next);
          }}
          className={cn(
            STAGE,
            'relative aspect-[2/1] max-h-80 w-full cursor-crosshair touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-5">
            {TRACK_POSES.map((key, index) => (
              <span
                key={key}
                className={cn(
                  'truncate border-e p-1.5 font-mono text-[11px] last:border-e-0',
                  index === bucket ? 'bg-[hsl(var(--portal-accent)/0.1)] text-foreground' : 'text-muted-foreground',
                )}
              >
                {key}
              </span>
            ))}
          </div>
          <PeekSprite
            definition={PEEK_PREVIEW_TRACKER_LOGO}
            animation={TRACK_REST}
            eventChannel={TRACK_CHANNEL}
            size={140}
            title="interactive tracking pose demo"
          />
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-muted-foreground">
          <span>
            Rest <Mono className="text-foreground">{TRACK_REST}</Mono>
          </span>
          <span>
            <Mono className="text-foreground">{TRACK_POSES.length}</Mono> buckets
          </span>
          <span>
            Channel <Mono className="text-foreground">{TRACK_CHANNEL}</Mono>
          </span>
          <span className="pointer-coarse:hidden">Arrow keys step through the poses.</span>
        </p>
      </div>
    </Section>
  );
}

function Stickers() {
  return (
    <Section title="Stickers" meta={`${PEEK_STICKER_ASSETS.length} SVG assets`} headingId="mascot-stickers">
      <ul className={cn('grid gap-x-6 gap-y-6 py-3 sm:grid-cols-2 xl:grid-cols-3', GUTTER)}>
        {PEEK_STICKER_ASSETS.map((sticker) => (
          <li key={sticker.id} className="flex min-w-0 flex-col gap-2">
            <div className="flex h-56 items-center justify-center rounded-lg bg-[#616362] p-4 shadow-[inset_0_0_0_1px_hsl(var(--border))]">
              <img
                src={sticker.src}
                width={sticker.width}
                height={sticker.height}
                alt={`peek ${sticker.label}`}
                loading="lazy"
                decoding="async"
                className="block h-auto max-h-48 w-auto max-w-full object-contain"
              />
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-sm">{sticker.label}</span>
              <Mono className="text-muted-foreground text-xs">
                {sticker.width} × {sticker.height}
              </Mono>
            </div>
            <p className="text-[13px] text-muted-foreground">{sticker.summary}</p>
            <Mono className="truncate text-muted-foreground text-xs">{sticker.src}</Mono>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* Library sprites draw once they come within a screen of the scroller's
   viewport, so arriving costs the few on screen rather than all of them
   (some five thousand SVG cells). The stage keeps its size either way. */
const ScrollRoot = React.createContext<React.RefObject<HTMLDivElement | null> | null>(null);

function Near({ className, style, children }: { className: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const root = React.useContext(ScrollRoot);
  const ref = React.useRef<HTMLDivElement>(null);
  const [near, setNear] = React.useState(false);
  React.useEffect(() => {
    const element = ref.current;
    if (!element || near) return;
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && setNear(true), {
      root: root?.current ?? null,
      rootMargin: '100% 0px',
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [root, near]);
  return (
    <div ref={ref} className={className} style={style}>
      {near && children}
    </div>
  );
}

function LibrarySprite({ item, look }: { item: MascotAsset; look: MascotAsset['grid'] | false }) {
  const definition = React.useMemo(() => (look ? null : createPeekLogoFromAssets([item])), [item, look]);
  if (look) return <PeekLook grid={look} palette={item.palette} size={104} title={`peek ${item.label}`} />;
  return definition && <PeekSprite definition={definition} animation={item.key} loop={item.previewLoop ?? item.loop} size={104} title={`peek ${item.key}`} />;
}

function LibraryItem({ item }: { item: MascotAsset }) {
  const look = (item.kind === 'expression' || item.kind === 'costume') && item.grid;
  const kind = item.motionKind ?? item.kind;
  const facts: Array<[string, React.ReactNode]> = [['Key', <Mono key="key">{item.key}</Mono>]];
  if (item.frames) facts.push(['Frames', <Mono key="frames">{item.frames.length}</Mono>]);
  if (item.timeline) facts.push(['Beats', <Mono key="beats">{item.timeline.length}</Mono>]);
  if (item.fps !== undefined) facts.push(['FPS', <Mono key="fps">{item.fps}</Mono>]);
  if (item.loop !== undefined) facts.push(['Loop', item.loop ? 'yes' : 'once']);

  return (
    <li className="flex min-w-0 flex-col gap-2">
      <Near className={cn(STAGE, 'aspect-square w-full')} style={look ? LOOK_COLORS : undefined}>
        <LibrarySprite item={item} look={look} />
      </Near>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-sm">{item.label}</span>
        <span className="text-muted-foreground text-xs">{kind}</span>
      </div>
      <p className="text-[13px] text-muted-foreground">{item.summary}</p>
      {item.usage && <p className="text-[13px]">{item.usage}</p>}
      <Facts rows={facts} />
      {item.tags.length > 0 && <p className="font-mono text-muted-foreground text-xs">{item.tags.map((tag) => `#${tag}`).join(' ')}</p>}
    </li>
  );
}

export default function MascotScreen() {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  /* The library (most of the page) follows the first frame in a background
     render, so arriving costs the part on screen. A Back that restores a
     scroll position draws it all at once, so the restore lands. */
  const savedTop = useSavedScroll('mascot');
  const [eager] = React.useState(() => (savedTop ?? 0) > 0);
  const library = React.useDeferredValue(true, eager);
  useScrollRestoration(scrollRef, 'mascot', library);

  const jump = (id: string): void => {
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' });
  };

  return (
    <ScrollRoot value={scrollRef}>
      <div className="flex h-svh flex-col">
        <ScreenHeader title="Mascot" />
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 pt-1 pb-10 sm:gap-12">
            <Summary />
            {/* One swipeable row on phones, where wrapped chips would fill the first screen. */}
            <nav
              aria-label="Jump to a section"
              className={cn('-mt-8 flex gap-1 max-sm:overflow-x-auto sm:-mt-10 max-sm:[scrollbar-width:none] sm:flex-wrap', GUTTER)}
            >
              {[
                ['mascot-runtime', 'Runtime'],
                ['mascot-brand', 'Brand'],
                ['mascot-tracking', 'Tracking'],
                ['mascot-stickers', 'Stickers'],
                ...sections.map((section) => [`mascot-lib-${section.id}`, sentenceCase(section.label)]),
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => jump(id)}
                  className="h-7 shrink-0 rounded-md px-2 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:bg-accent pointer-coarse:h-11 pointer-coarse:px-3"
                >
                  {label}
                </button>
              ))}
            </nav>
            <RuntimeMap />
            <BrandBehaviour />
            <TrackingStage />
            <Stickers />
            {library &&
              sections.map((section) => (
                <Section
                  key={section.id}
                  title={sentenceCase(section.label)}
                  meta={`${section.items.length} entries`}
                  headingId={`mascot-lib-${section.id}`}
                >
                  <p className={cn('pt-2 text-[13px] text-muted-foreground', GUTTER)}>{section.description}</p>
                  <ul className={cn('grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-x-5 gap-y-6 py-3', GUTTER)}>
                    {section.items.map((item) => (
                      <LibraryItem key={`${section.id}-${item.id}`} item={item} />
                    ))}
                  </ul>
                </Section>
              ))}
          </div>
        </div>
      </div>
    </ScrollRoot>
  );
}
