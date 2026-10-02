import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { cn } from '@/lib/utils';
import { Dot, GUTTER, Segmented, SMALL } from '../activity/table';
import { apiGet } from '../app/api';
import { setSearch, useLocation } from '../app/router';
import { useScrollRestoration } from '../app/scroll';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { CopyButton } from './ui';

/* Every SVG endpoint and static SVG the site ships, rendered live. Theme
   changes the `?theme=` each themed endpoint gets; Frame only changes what
   the image sits on, so a transparent edge or a baked-in background shows. */

type Theme = 'dark' | 'light';
type Frame = 'auto' | 'dark' | 'light' | 'checker';

interface Entry {
  id: string;
  name: string;
  intent: string;
  path: string;
  themed: boolean;
  notes?: string;
  /** The size the SVG is drawn at: its own viewBox, which the docs list
      (docs/api/svg.md). The image keeps this aspect ratio at any width,
      and the box is reserved before it loads, so nothing moves. */
  width: number;
  height: number;
}

const ENTRIES: Entry[] = [
  { id: 'status', name: 'Status badge', intent: 'Live status pill embedded in READMEs', path: '/api/status.svg', themed: true, width: 200, height: 40 },
  {
    id: 'site-badge',
    name: 'Site badge',
    intent: 'Marketing badge for the site itself',
    path: '/api/site-badge.svg',
    themed: true,
    notes: 'Also accepts ?style=default|outline',
    width: 130,
    height: 32,
  },
  { id: 'tech-stack', name: 'Tech stack panel', intent: 'Long-form tech stack panel', path: '/api/tech-stack.svg', themed: true, width: 800, height: 60 },
  {
    id: 'activity-panel',
    name: 'Activity panel',
    intent: 'Recent commit activity summary',
    path: '/api/activity-panel.svg',
    themed: true,
    notes: 'Accepts days, projects, commits, added, removed, net, lph. Needs a signed URL.',
    width: 330,
    height: 142,
  },
  {
    id: 'project',
    name: 'Project card',
    intent: 'Repo card by project id (default tutubetterrules)',
    path: '/api/project.svg',
    themed: true,
    notes: 'Accepts ?project=<id>',
    width: 400,
    height: 160,
  },
  // 1000 by 1000 as drawn; shown at an icon's size.
  { id: 'telegram-logo', name: 'Telegram logo', intent: 'Static brand asset under /public', path: '/telegram-logo.svg', themed: false, width: 96, height: 96 },
];

/** Wider than half the gallery: gets a row of its own, at full size. */
const WIDE = 560;

const THEME_OPTIONS = [
  { value: 'dark' as Theme, label: 'Dark', ariaLabel: 'Dark theme' },
  { value: 'light' as Theme, label: 'Light', ariaLabel: 'Light theme' },
];

const FRAME_OPTIONS = [
  { value: 'auto' as Frame, label: 'Auto', ariaLabel: 'Frame follows the theme' },
  { value: 'dark' as Frame, label: 'Dark', ariaLabel: 'Dark frame' },
  { value: 'light' as Frame, label: 'Light', ariaLabel: 'Light frame' },
  { value: 'checker' as Frame, label: 'Checker', ariaLabel: 'Checkerboard frame' },
];

const CHECKER =
  'bg-[hsl(0_0%_96%)] [background-image:linear-gradient(45deg,hsl(0_0%_88%)_25%,transparent_25%),linear-gradient(-45deg,hsl(0_0%_88%)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(0_0%_88%)_75%),linear-gradient(-45deg,transparent_75%,hsl(0_0%_88%)_75%)] [background-position:0_0,0_8px,8px_-8px,-8px_0] [background-size:16px_16px]';

const FRAME_CLASS: Record<Exclude<Frame, 'auto'>, string> = {
  dark: 'bg-[hsl(240_6%_4%)]',
  light: 'bg-[hsl(0_0%_98%)]',
  checker: CHECKER,
};

interface PanelSrc {
  signed: boolean;
  expiresAt: string;
  dark: string;
  light: string;
}

/** The activity panel needs a URL signed with a server secret; the portal
    API signs one for an hour. */
function usePanelSrc() {
  return useQuery({
    queryKey: ['tools', 'activity-panel-src'],
    queryFn: ({ signal }) => apiGet<PanelSrc>('activity-panel-src', undefined, signal),
    // Refresh well before the signature runs out.
    staleTime: 50 * 60_000,
    refetchInterval: 50 * 60_000,
  });
}

function srcFor(entry: Entry, theme: Theme, panel: PanelSrc | undefined): string | null {
  if (entry.id === 'activity-panel') return panel ? panel[theme] : null;
  return entry.themed ? `${entry.path}?theme=${theme}` : entry.path;
}

function Preview({ entry, src, frame, unsigned }: { entry: Entry; src: string | null; frame: Exclude<Frame, 'auto'>; unsigned: boolean }) {
  const [failed, setFailed] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const url = src && attempt > 0 ? `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}` : src;

  // A new theme is a new image; forget the old failure.
  const [seen, setSeen] = React.useState(src);
  if (src !== seen) {
    setSeen(src);
    setFailed(null);
  }

  return (
    <div
      className={cn('relative flex min-h-24 items-center justify-center overflow-hidden rounded-lg p-4 shadow-[inset_0_0_0_1px_hsl(var(--border))]', FRAME_CLASS[frame])}
    >
      {url && failed !== url && (
        // Drawn at its own size, scaled down whole on a narrow screen: the
        // attributes give the ratio, so the height follows the width.
        <img
          key={url}
          src={url}
          alt={entry.name}
          width={entry.width}
          height={entry.height}
          loading="lazy"
          decoding="async"
          className="block h-auto max-w-full"
          onError={() => setFailed(url)}
        />
      )}
      {url && failed === url && (
        <div role="alert" className="flex max-w-md flex-col items-center gap-2 rounded-md bg-background/90 px-3 py-2 text-center text-sm">
          <span className="flex items-center gap-2 font-medium">
            <Dot tone="danger" />
            Did not render
          </span>
          <span className="text-muted-foreground text-[13px]">
            {unsigned
              ? 'This environment has no ACTIVITY_PANEL_SIGNING_SECRET, so the panel refuses the unsigned URL. Set the secret to preview it here.'
              : 'The endpoint answered with an error or no SVG. Open it in a new tab to see the response.'}
          </span>
          {/* A missing secret stays missing; only a passing failure is worth a retry. */}
          {!unsigned && (
            <Button size="sm" variant="outline" className={cn(SMALL, 'active:bg-accent')} onClick={() => setAttempt((count) => count + 1)}>
              Try again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Item({ entry, theme, frame, panel }: { entry: Entry; theme: Theme; frame: Exclude<Frame, 'auto'>; panel: ReturnType<typeof usePanelSrc> }) {
  const src = srcFor(entry, theme, panel.data);
  const absolute = (): string => new URL(src ?? entry.path, location.origin).toString();
  return (
    <li className={cn('flex min-w-0 flex-col gap-2 pt-3 pb-5', GUTTER, entry.width > WIDE && 'xl:col-span-2')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-medium text-sm">{entry.name}</h2>
          <p className="text-[13px] text-muted-foreground">{entry.intent}</p>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          className="active:bg-accent pointer-coarse:size-11"
          render={<a href={src ?? entry.path} target="_blank" rel="noreferrer" aria-label={`Open ${entry.name} in a new tab`} />}
        >
          <ExternalLink aria-hidden />
        </Button>
        <CopyButton text={absolute} label="Copy URL" />
      </div>
      {entry.id === 'activity-panel' && panel.isError ? (
        <div role="alert" className="flex min-h-24 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <Dot tone="danger" />
          <span className="font-medium">Could not sign the panel URL.</span>
          <span className="text-muted-foreground">The portal API did not answer. Try again; the other cards do not depend on it.</span>
          <Button size="sm" variant="outline" className={cn(SMALL, 'active:bg-accent')} onClick={() => void panel.refetch()} loading={panel.isFetching}>
            Try again
          </Button>
        </div>
      ) : (
        <Preview entry={entry} src={src} frame={frame} unsigned={entry.id === 'activity-panel' && panel.data?.signed === false} />
      )}
      <code className="block overflow-x-auto whitespace-nowrap font-mono text-muted-foreground text-xs tabular-nums">{src ?? entry.path}</code>
      {entry.notes && <p className="text-muted-foreground text-xs">{entry.notes}</p>}
    </li>
  );
}

export default function SvgScreen() {
  const { search } = useLocation();
  const theme: Theme = search.get('theme') === 'light' ? 'light' : 'dark';
  const frameParam = search.get('frame');
  const frame: Frame = frameParam === 'dark' || frameParam === 'light' || frameParam === 'checker' ? frameParam : 'auto';
  const shown = frame === 'auto' ? theme : frame;
  const panel = usePanelSrc();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  useScrollRestoration(scrollRef, 'svg', true);

  return (
    <div className="flex h-svh flex-col">
      <ScreenHeader title="SVG gallery" />
      <div className={cn('flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b py-2', GUTTER)}>
        <span className="flex items-center gap-2">
          <span aria-hidden className="text-[13px] text-muted-foreground">
            Theme
          </span>
          <Segmented label="Theme" value={theme} options={THEME_OPTIONS} onChange={(next) => setSearch({ theme: next === 'dark' ? null : next })} />
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="text-[13px] text-muted-foreground">
            Frame
          </span>
          <Segmented label="Frame" value={frame} options={FRAME_OPTIONS} onChange={(next) => setSearch({ frame: next === 'auto' ? null : next })} />
        </span>
        <span className="ms-auto text-muted-foreground text-xs tabular-nums max-sm:hidden">{ENTRIES.length} assets</span>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ul className="mx-auto grid w-full max-w-6xl gap-x-2 gap-y-4 pt-1 pb-10 xl:grid-cols-2">
          {ENTRIES.map((entry) => (
            <Item key={entry.id} entry={entry} theme={theme} frame={shown} panel={panel} />
          ))}
        </ul>
      </div>
    </div>
  );
}
