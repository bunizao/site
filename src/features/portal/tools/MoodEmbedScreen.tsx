import * as React from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { Input } from '@/components/coss/input';
import { cn } from '@/lib/utils';
import { Dot, GUTTER, Segmented, SMALL, Updating } from '../activity/table';
import { setSearch, useLocation } from '../app/router';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { CopyButton, useSize } from './ui';

/* The public mood embed with every query parameter it takes. Each control
   writes the portal URL, the iframe follows it, and the copied URL is the
   exact one previewed. */

// The embed route SSRs the mood archive, which needs the site-api binding.
// Native Node SSR in `astro dev` has none, so a local /mood/embed renders
// nothing; in dev the iframe loads production instead. The copied URL stays
// on this origin either way.
const EMBED_ORIGIN = import.meta.env.DEV ? 'https://buxx.me' : '';

type Backdrop = 'auto' | 'dark' | 'light' | 'checker';

const DEFAULTS = { theme: 'auto', density: 'regular', font: 'mono', frame: 'true', link: 'true', count: '3', id: '', refresh: '0' };
type EmbedKey = keyof typeof DEFAULTS;
type EmbedState = Record<EmbedKey, string>;

const SEGMENTS: Array<{ key: EmbedKey; label: string; options: Array<{ value: string; label: string; ariaLabel?: string }> }> = [
  {
    key: 'theme',
    label: 'Theme',
    options: [
      { value: 'auto', label: 'Auto', ariaLabel: 'Theme follows the reader' },
      { value: 'light', label: 'Light', ariaLabel: 'Light theme' },
      { value: 'dark', label: 'Dark', ariaLabel: 'Dark theme' },
    ],
  },
  {
    key: 'density',
    label: 'Density',
    options: [
      { value: 'regular', label: 'Regular' },
      { value: 'compact', label: 'Compact' },
    ],
  },
  {
    key: 'font',
    label: 'Font',
    options: [
      { value: 'mono', label: 'Mono' },
      { value: 'system', label: 'System' },
    ],
  },
  {
    key: 'frame',
    label: 'Frame',
    options: [
      { value: 'true', label: 'On', ariaLabel: 'Frame on' },
      { value: 'false', label: 'Off', ariaLabel: 'Frame off' },
    ],
  },
  {
    key: 'link',
    label: 'View all link',
    options: [
      { value: 'true', label: 'On', ariaLabel: 'View all link on' },
      { value: 'false', label: 'Off', ariaLabel: 'View all link off' },
    ],
  },
];

const BACKDROP_OPTIONS = [
  { value: 'auto' as Backdrop, label: 'Auto', ariaLabel: 'Default backdrop' },
  { value: 'dark' as Backdrop, label: 'Dark', ariaLabel: 'Dark backdrop' },
  { value: 'light' as Backdrop, label: 'Light', ariaLabel: 'Light backdrop' },
  { value: 'checker' as Backdrop, label: 'Checker', ariaLabel: 'Checkerboard backdrop' },
];

const BACKDROP_CLASS: Record<Backdrop, string> = {
  auto: '[background:linear-gradient(180deg,hsl(0_0%_100%/0.02),hsl(0_0%_100%/0.06)),hsl(240_6%_4%)]',
  dark: 'bg-[hsl(240_6%_4%)]',
  light: 'bg-[hsl(0_0%_98%)]',
  checker:
    'bg-[hsl(0_0%_96%)] [background-image:linear-gradient(45deg,hsl(0_0%_88%)_25%,transparent_25%),linear-gradient(-45deg,hsl(0_0%_88%)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(0_0%_88%)_75%),linear-gradient(-45deg,transparent_75%,hsl(0_0%_88%)_75%)] [background-position:0_0,0_8px,8px_-8px,-8px_0] [background-size:16px_16px]',
};

function readState(search: URLSearchParams): EmbedState {
  const state = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as EmbedKey[]) {
    const value = search.get(key);
    if (value !== null) state[key] = value;
  }
  return state;
}

/** The embed path for `state`: only what differs from the embed's own
    defaults, plus the origin the embed reports its height to. */
function embedPath(state: EmbedState): string {
  const params = new URLSearchParams();
  const id = state.id.trim();
  if (id) params.set('id', id);
  else params.set('count', String(Math.max(1, Math.min(10, Number.parseInt(state.count, 10) || 1))));
  for (const key of ['theme', 'density', 'font', 'frame', 'link'] as const) {
    if (state[key] !== DEFAULTS[key]) params.set(key, state[key]);
  }
  const refresh = Math.max(0, Math.min(3600, Number.parseInt(state.refresh, 10) || 0));
  if (refresh > 0) params.set('refresh', String(refresh));
  params.set('origin', location.origin);
  return `/mood/embed?${params}`;
}

const MIN_HEIGHT = 120;
const START_HEIGHT = 320;
const SLOW_MS = 10_000;

/** A text field that answers every keystroke and writes the URL once typing
    pauses; the iframe reloads once per pause, not per key. */
function ParamInput({
  name,
  label,
  hint,
  value,
  ...input
}: { name: EmbedKey; label: string; hint: string; value: string } & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'name'>) {
  const [text, setText] = React.useState(value);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const write = (next: string): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSearch({ [name]: next.trim() === DEFAULTS[name] ? null : next.trim() });
  };
  const hintId = `embed-${name}-hint`;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <Input
        {...input}
        size="sm"
        value={text}
        aria-describedby={hintId}
        className="font-mono tabular-nums pointer-coarse:h-11 pointer-coarse:**:[input]:h-full"
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => write(next), 350);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') write(text);
        }}
        onBlur={() => {
          if (timer.current) write(text);
        }}
      />
      <span id={hintId} className="text-muted-foreground text-xs">
        {hint}
      </span>
    </label>
  );
}

function Controls({ state, backdrop, changed }: { state: EmbedState; backdrop: Backdrop; changed: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-x-4 gap-y-3">
        {SEGMENTS.map((segment) => (
          <div key={segment.key} className="flex flex-col gap-1.5">
            <span className="text-[13px] text-muted-foreground" aria-hidden>
              {segment.label}
            </span>
            <Segmented
              label={segment.label}
              value={state[segment.key]}
              options={segment.options}
              onChange={(value) => setSearch({ [segment.key]: value === DEFAULTS[segment.key] ? null : value })}
            />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-x-4 gap-y-3">
        <ParamInput
          name="count"
          label="Count"
          hint={state.id.trim() ? 'Ignored while a post id is set.' : '1 to 10 posts.'}
          value={state.count}
          type="number"
          min={1}
          max={10}
          inputMode="numeric"
        />
        <ParamInput name="id" label="Post id" hint="Pins the embed to one post." value={state.id} placeholder="e.g. 3503" autoComplete="off" spellCheck={false} />
        <ParamInput
          name="refresh"
          label="Refresh, seconds"
          hint="0 is off; the embed clamps to 30 to 3600."
          value={state.refresh}
          type="number"
          min={0}
          max={3600}
          step={30}
          inputMode="numeric"
        />
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted-foreground" aria-hidden>
            Backdrop, preview only
          </span>
          <Segmented
            label="Backdrop, preview only"
            value={backdrop}
            options={BACKDROP_OPTIONS}
            onChange={(value) => setSearch({ backdrop: value === 'auto' ? null : value })}
          />
        </div>
        {changed && (
          <Button
            size="sm"
            variant="ghost"
            className={cn(SMALL, 'active:bg-accent')}
            onClick={() => setSearch(Object.fromEntries([...Object.keys(DEFAULTS), 'backdrop'].map((key) => [key, null])))}
          >
            Reset to defaults
          </Button>
        )}
      </div>
    </div>
  );
}

type LoadState = { phase: 'loading' } | { phase: 'loaded'; height: number | null } | { phase: 'slow' };

export default function MoodEmbedScreen() {
  const { search } = useLocation();
  const state = readState(search);
  const backdropParam = search.get('backdrop');
  const backdrop: Backdrop = backdropParam === 'dark' || backdropParam === 'light' || backdropParam === 'checker' ? backdropParam : 'auto';
  const path = embedPath(state);
  const changed = [...search.keys()].some((key) => key in DEFAULTS || key === 'backdrop');

  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const split = useSize(rootRef).width >= 900;
  const [reloads, setReloads] = React.useState(0);
  const [height, setHeight] = React.useState(START_HEIGHT);
  const [load, setLoad] = React.useState<LoadState>({ phase: 'loading' });

  const src = EMBED_ORIGIN + path;

  // A new URL or a forced reload starts a new load; the old document stays
  // on screen until the new one commits.
  React.useEffect(() => {
    setLoad({ phase: 'loading' });
    const slow = setTimeout(() => setLoad((current) => (current.phase === 'loading' ? { phase: 'slow' } : current)), SLOW_MS);
    return () => clearTimeout(slow);
  }, [src, reloads]);

  React.useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: string; height?: unknown } | null;
      if (!data || data.type !== 'mood-embed-resize') return;
      const next = Number(data.height);
      if (!Number.isFinite(next)) return;
      setHeight(Math.max(MIN_HEIGHT, Math.ceil(next)));
      setLoad({ phase: 'loaded', height: Math.ceil(next) });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const absolute = (): string => new URL(path, location.origin).toString();

  let status: React.ReactNode;
  if (load.phase === 'slow') {
    status = (
      <span role="alert" className="flex flex-wrap items-center gap-x-2">
        <Dot tone="danger" />
        <span className="font-medium">No answer in 10 seconds.</span>
        <span className="text-muted-foreground">
          {EMBED_ORIGIN ? 'The preview loads buxx.me; check the connection, then reload.' : 'Check that /mood/embed renders, then reload.'}
        </span>
      </span>
    );
  } else if (load.phase === 'loaded') {
    status = (
      <span className="flex items-center gap-2">
        {/* Loaded is the expected state: a neutral dot, as on every status line. */}
        <Dot tone="neutral" />
        <span>
          Loaded
          {load.height !== null && (
            <span className="text-muted-foreground">
              , reports <span className="tabular-nums">{load.height}</span> px tall
            </span>
          )}
        </span>
      </span>
    );
  } else {
    status = <span className="text-muted-foreground">Loading the embed</span>;
  }

  return (
    <div className="flex h-svh flex-col">
      <ScreenHeader title="Mood embed" />
      <div ref={rootRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* One tree for both layouts, so crossing the breakpoint (an iPad
            turning) restyles the iframe instead of reloading it. */}
        <div className={split ? 'grid grid-cols-[20rem_minmax(0,1fr)] items-start' : 'flex flex-col'}>
          <div className={cn('py-4', GUTTER, split ? 'sticky top-0 border-e' : 'border-b')}>
            <Controls state={state} backdrop={backdrop} changed={changed} />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className={cn('flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 border-b py-1.5', GUTTER)}>
              <code
                className="min-w-0 flex-1 truncate font-mono text-muted-foreground text-xs max-sm:order-last max-sm:basis-full max-sm:whitespace-normal max-sm:[overflow-wrap:anywhere]"
                title={path}
              >
                {path}
              </code>
              <Updating active={load.phase === 'loading'} label="Loading" />
              <Button size="icon-sm" variant="ghost" className="active:bg-accent pointer-coarse:size-11" aria-label="Force reload the embed" onClick={() => setReloads((count) => count + 1)}>
                <RefreshCw aria-hidden />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                className="active:bg-accent pointer-coarse:size-11"
                render={<a href={src} target="_blank" rel="noreferrer" aria-label="Open the embed in a new tab" />}
              >
                <ExternalLink aria-hidden />
              </Button>
              <CopyButton text={absolute} label="Copy URL" />
            </div>
            <div className={cn('p-4', BACKDROP_CLASS[backdrop])}>
              <iframe
                key={reloads}
                ref={frameRef}
                title="Mood embed preview"
                src={src}
                onLoad={() => setLoad((current) => (current.phase === 'loaded' ? current : { phase: 'loaded', height: null }))}
                style={{ height }}
                className="block w-full border-0 bg-transparent [color-scheme:dark_light]"
              />
            </div>
            <p className={cn('flex min-h-9 items-center py-1.5 text-[13px]', GUTTER)} aria-live="polite">
              {status}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
