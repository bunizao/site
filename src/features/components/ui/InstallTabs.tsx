import * as React from 'react';
import { CopyCommand } from './CopyCommand';

type Manager = 'pnpm' | 'npm' | 'yarn' | 'bun';
const MANAGERS: Manager[] = ['pnpm', 'npm', 'yarn', 'bun'];

export type InstallSpec =
  | { type: 'registry'; url: string }
  | { type: 'npm'; pkg: string };

function commandFor(spec: InstallSpec, manager: Manager): string {
  if (spec.type === 'npm') {
    const map: Record<Manager, string> = {
      pnpm: `pnpm add ${spec.pkg}`,
      npm: `npm install ${spec.pkg}`,
      yarn: `yarn add ${spec.pkg}`,
      bun: `bun add ${spec.pkg}`,
    };
    return map[manager];
  }
  const map: Record<Manager, string> = {
    pnpm: `pnpm dlx shadcn@latest add ${spec.url}`,
    npm: `npx shadcn@latest add ${spec.url}`,
    yarn: `yarn dlx shadcn@latest add ${spec.url}`,
    bun: `bunx --bun shadcn@latest add ${spec.url}`,
  };
  return map[manager];
}

/**
 * Package-manager tabs. The active label is a second, inked copy of the tab
 * row clipped to the active tab's rect — so switching tabs slides the ink
 * across for a seamless color transition rather than a hard swap.
 */
export function InstallTabs({ spec }: { spec: InstallSpec }) {
  const [active, setActive] = React.useState<Manager>('pnpm');
  const trackRef = React.useRef<HTMLDivElement>(null);
  const btnRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [clip, setClip] = React.useState({ left: 0, right: 0, width: 0 });

  const measure = React.useCallback(() => {
    const track = trackRef.current;
    const btn = btnRefs.current[MANAGERS.indexOf(active)];
    if (!track || !btn) return;
    const trackW = track.clientWidth;
    const left = btn.offsetLeft;
    const right = trackW - (btn.offsetLeft + btn.offsetWidth);
    setClip({ left, right, width: btn.offsetWidth });
  }, [active]);

  React.useLayoutEffect(() => {
    measure();
  }, [measure]);

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, [measure]);

  const labels = (inked: boolean) =>
    MANAGERS.map((m, i) => (
      <button
        key={m}
        type="button"
        ref={inked ? undefined : (el) => { btnRefs.current[i] = el; }}
        className="install-tab"
        tabIndex={inked ? -1 : 0}
        aria-hidden={inked ? true : undefined}
        aria-selected={!inked && m === active}
        role={inked ? undefined : 'tab'}
        onClick={inked ? undefined : () => setActive(m)}
      >
        {m}
      </button>
    ));

  return (
    <div className="install-tabs">
      <div className="install-tabs-track" ref={trackRef} role="tablist" aria-label="Package manager">
        <div className="install-tabs-layer install-tabs-layer--base">{labels(false)}</div>
        <div
          className="install-tabs-layer install-tabs-layer--ink"
          style={{ clipPath: `inset(0 ${clip.right}px 0 ${clip.left}px)` }}
        >
          {labels(true)}
        </div>
        <span
          className="install-tabs-underline"
          aria-hidden="true"
          style={{ transform: `translateX(${clip.left}px)`, width: `${clip.width}px` }}
        />
      </div>
      <CopyCommand command={commandFor(spec, active)} />
    </div>
  );
}

export default InstallTabs;
