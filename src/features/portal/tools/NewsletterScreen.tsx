import * as React from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { Kbd, KbdGroup } from '@/components/coss/kbd';
import { Menu, MenuGroup, MenuGroupLabel, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/components/coss/menu';
import { Skeleton } from '@/components/coss/skeleton';
import { cn } from '@/lib/utils';
import { BLEED, GUTTER, LIST, LoadError, Mono, PRESSABLE, ROW, Segmented, SMALL, Updating } from '../activity/table';
import { useHotkeys } from '../app/hotkeys';
import { setSearch, useLocation } from '../app/router';
import { useScrollRestoration } from '../app/scroll';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { clock } from '../moderation/format';
import { TOUCH_MENU } from '../moderation/ui';
import {
  explained,
  prefetchNotifyPreview,
  useNotifyPreview,
  type EmailKey,
  type NotifyMode,
  type NotifyPreview,
  type NotifySample,
  type PageKey,
} from './data';
import { DEVICE_OPTIONS, DeviceFrame, readDevice, revealRow, step, useSize, type Device } from './ui';

/* Email templates: every notify email and callback page site-api renders,
   one at a time, in a frame at a real width.

   One request brings every template for a digest mode and sample, so moving
   between templates never waits on the network. Light and Dark rewrite the
   template's own `prefers-color-scheme` rules inside the frame, so the
   switch keeps the scroll position and does not depend on the browser
   passing the frame's colour scheme through. */

type TemplateKey = EmailKey | PageKey | 'managePanel';
type Scheme = 'light' | 'dark';

interface Template {
  key: TemplateKey;
  index: string;
  label: string;
  intent: string;
}

const EMAILS: Template[] = [
  { key: 'subscribe', index: 'E1', label: 'Subscribe confirm', intent: 'Double opt-in email' },
  { key: 'welcome', index: 'E2', label: 'Welcome', intent: 'Sent once the address is confirmed' },
  { key: 'blog', index: 'E3', label: 'Blog newsletter', intent: 'One essay, sent by hand' },
  { key: 'mood', index: 'E4', label: 'Mood notification', intent: 'One mood post, per-post subscribers' },
  { key: 'digest', index: 'E5', label: 'Mood digest', intent: 'Batched mood posts for the digest window' },
  { key: 'cancel', index: 'E6', label: 'Unsubscribe notice', intent: 'Receipt after opting out' },
  { key: 'changeEmail', index: 'E7', label: 'Change email confirm', intent: 'Opt-in on the new address' },
  { key: 'emailChanged', index: 'E8', label: 'Address changed notice', intent: 'Receipt to the old address' },
  { key: 'deleteRecord', index: 'E9', label: 'Delete record confirm', intent: 'Second step before erasure' },
];

const PAGES: Template[] = [
  { key: 'confirmSuccess', index: 'P1', label: 'Confirm, success', intent: 'After a confirm link works' },
  { key: 'confirmError', index: 'P2', label: 'Confirm, error', intent: 'Expired or used confirm link' },
  { key: 'unsubscribeSuccess', index: 'P3', label: 'Unsubscribe, success', intent: 'After a one-click unsubscribe' },
  { key: 'unsubscribeError', index: 'P4', label: 'Unsubscribe, error', intent: 'Invalid or failed unsubscribe' },
  { key: 'deleteRecordConfirm', index: 'P5', label: 'Delete record, confirm', intent: 'The button that erases' },
  { key: 'deleteRecordDone', index: 'P6', label: 'Delete record, receipt', intent: 'What was removed' },
  { key: 'managePanel', index: 'P7', label: 'Preferences panel', intent: 'The live page, on a demo record' },
];

const ALL = [...EMAILS, ...PAGES];
const KEYS = ALL.map((template) => template.key);
const EMAIL_SET = new Set<string>(EMAILS.map((template) => template.key));

const MODE_OPTIONS = [
  { value: 'daily' as NotifyMode, label: 'Daily', ariaLabel: 'Daily digest' },
  { value: 'every_5h' as NotifyMode, label: 'Every 5h', ariaLabel: 'Digest every five hours' },
];
const SAMPLE_OPTIONS = [
  { value: 'live' as NotifySample, label: 'Live', ariaLabel: 'Live channel data' },
  { value: 'rich' as NotifySample, label: 'Rich', ariaLabel: 'Rich sample data' },
];
const SCHEME_OPTIONS = [
  { value: 'light' as Scheme, label: 'Light', ariaLabel: 'Light mode' },
  { value: 'dark' as Scheme, label: 'Dark', ariaLabel: 'Dark mode' },
];

const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const readMode = (search: URLSearchParams): NotifyMode => (search.get('mode') === 'every_5h' ? 'every_5h' : 'daily');
const readSample = (search: URLSearchParams): NotifySample => (search.get('sample') === 'rich' ? 'rich' : 'live');

/* Each colour-scheme rule's original condition, so a switch can be undone
   in place however many times it is flipped. */
const originals = new WeakMap<CSSRule, string>();
const SCHEME_FEATURE = /\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)/g;
const HAS_SCHEME = /prefers-color-scheme/;

/** Makes the frame's `prefers-color-scheme` rules answer `scheme`. A
    cross-origin frame cannot be reached; its colour-scheme style still
    tells browsers that pass it through. */
function applyScheme(frame: HTMLIFrameElement | null, scheme: Scheme): void {
  if (!frame) return;
  let doc: Document | null = null;
  try {
    doc = frame.contentDocument;
  } catch {
    return;
  }
  if (!doc) return;
  doc.documentElement.style.colorScheme = scheme;
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (!('media' in rule) || !('cssRules' in rule)) continue;
      const media = (rule as CSSMediaRule).media;
      const original = originals.get(rule) ?? media.mediaText;
      if (!HAS_SCHEME.test(original)) continue;
      originals.set(rule, original);
      // Always-true and never-true stand-ins keep any other condition intact.
      media.mediaText = original.replace(SCHEME_FEATURE, (_, wanted: string) => (wanted === scheme ? '(min-width: 0px)' : '(max-width: -1px)'));
    }
  }
}

function contentOf(preview: NotifyPreview, key: TemplateKey): { srcDoc?: string; src?: string; subject?: string } {
  if (key === 'managePanel') {
    const origin = (preview.siteUrl || location.origin).replace(/\/$/, '');
    return { src: `${origin}/subscribe/manage?demo=1` };
  }
  if (EMAIL_SET.has(key)) return { srcDoc: preview.html[key as EmailKey], subject: preview.subjects[key as EmailKey] };
  return { srcDoc: preview.callbackPages[key as PageKey] };
}

const TemplateRow = React.memo(function TemplateRow({
  template,
  selected,
  onSelect,
}: {
  template: Template;
  selected: boolean;
  onSelect: (key: TemplateKey) => void;
}) {
  return (
    <button
      type="button"
      data-row-id={template.key}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(template.key)}
      className={cn(
        'flex w-full items-center gap-3 text-start text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        ROW,
        BLEED,
        PRESSABLE,
        selected && 'bg-accent',
      )}
    >
      <Mono className="w-6 shrink-0 text-muted-foreground text-xs">{template.index}</Mono>
      <span className="min-w-0 truncate">{template.label}</span>
    </button>
  );
});

function TemplateGroup({ title, templates, current, onSelect }: { title: string; templates: Template[]; current: TemplateKey; onSelect: (key: TemplateKey) => void }) {
  const id = `templates-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id}>
      <div className={cn('flex min-h-11 items-end gap-2 pb-2', GUTTER)}>
        <h2 id={id} className="font-medium text-muted-foreground text-sm">{title}</h2>
        <span className="text-[13px] text-muted-foreground tabular-nums">{templates.length}</span>
      </div>
      <div className={LIST}>
        {templates.map((template) => (
          <TemplateRow key={template.key} template={template} selected={template.key === current} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function TemplateMenu({ current, onSelect }: { current: Template; onSelect: (key: TemplateKey) => void }) {
  return (
    <Menu>
      <MenuTrigger render={<Button size="sm" variant="outline" className={cn(SMALL, 'min-w-0 active:bg-accent')} />}>
        <Mono className="text-muted-foreground text-xs">{current.index}</Mono>
        <span className="truncate">{current.label}</span>
        <ChevronDown aria-hidden />
      </MenuTrigger>
      <MenuPopup align="start" className={TOUCH_MENU}>
        <MenuRadioGroup value={current.key} onValueChange={(next: string) => onSelect(next as TemplateKey)}>
          {[
            { title: 'Emails', templates: EMAILS },
            { title: 'Pages', templates: PAGES },
          ].map((group) => (
            <MenuGroup key={group.title}>
              <MenuGroupLabel>{group.title}</MenuGroupLabel>
              {group.templates.map((template) => (
                <MenuRadioItem key={template.key} value={template.key}>
                  <Mono className="w-6 text-muted-foreground text-xs">{template.index}</Mono>
                  {template.label}
                </MenuRadioItem>
              ))}
            </MenuGroup>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

/** Every template for the URL's mode and sample (see app/lazy-screen.ts). */
export function prefetch(client: QueryClient, search: URLSearchParams): Promise<unknown> {
  return prefetchNotifyPreview(client, { mode: readMode(search), sample: readSample(search), timezone: TIMEZONE });
}

export default function NewsletterScreen() {
  const { search } = useLocation();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const split = useSize(rootRef).width >= 720;

  const key = (KEYS.includes(search.get('t') as TemplateKey) ? search.get('t') : 'subscribe') as TemplateKey;
  const template = ALL.find((entry) => entry.key === key)!;
  const mode = readMode(search);
  const sample = readSample(search);
  const scheme: Scheme = search.get('theme') === 'dark' ? 'dark' : 'light';
  const device = readDevice(search);

  const params = React.useMemo(() => ({ mode, sample, timezone: TIMEZONE }), [mode, sample]);
  const preview = useNotifyPreview(params);
  const data = preview.data;

  const select = React.useCallback((next: TemplateKey | null) => {
    if (next) setSearch({ t: next === 'subscribe' ? null : next });
  }, []);

  useHotkeys({
    j: () => select(step(KEYS, key, 1) as TemplateKey | null),
    k: () => select(step(KEYS, key, -1) as TemplateKey | null),
  });

  React.useLayoutEffect(() => revealRow(listRef.current, key), [key]);
  useScrollRestoration(listRef, 'newsletter', true);

  // The scheme follows the switch in the frame it is pressed.
  React.useLayoutEffect(() => applyScheme(frameRef.current, scheme), [scheme]);

  const content = data ? contentOf(data, key) : null;
  const empty = content && !content.src && !content.srcDoc;

  const toolbar = (
    <div className={cn('flex shrink-0 flex-wrap items-center gap-2 border-b py-2', GUTTER)}>
      {!split && <TemplateMenu current={template} onSelect={select} />}
      <Segmented<NotifyMode> label="Digest schedule" value={mode} options={MODE_OPTIONS} onChange={(next) => setSearch({ mode: next === 'daily' ? null : next })} />
      <Segmented<NotifySample> label="Sample data" value={sample} options={SAMPLE_OPTIONS} onChange={(next) => setSearch({ sample: next === 'live' ? null : next })} />
      <Segmented<Device> label="Preview width" value={device} options={DEVICE_OPTIONS} onChange={(next) => setSearch({ width: next === 'phone' ? 'phone' : null })} />
      <Segmented<Scheme> label="Colour scheme" value={scheme} options={SCHEME_OPTIONS} onChange={(next) => setSearch({ theme: next === 'dark' ? 'dark' : null })} />
      <span className="ms-auto flex items-center gap-2">
        <span className="max-sm:hidden">
          <Updating active={preview.isFetching && Boolean(data)} />
        </span>
        <Button
          size="sm"
          variant="outline"
          className={cn(SMALL, 'active:bg-accent max-sm:w-8 max-sm:px-0 max-sm:pointer-coarse:w-11')}
          onClick={() => void preview.refetch()}
          aria-label="Render the templates again from live data"
        >
          <RefreshCw aria-hidden className={cn(preview.isFetching && 'max-sm:motion-safe:animate-spin')} />
          <span className="max-sm:hidden">Refresh</span>
        </Button>
      </span>
    </div>
  );

  let frame: React.ReactNode;
  if (preview.isPending) {
    frame = (
      <div aria-hidden className="flex min-h-0 flex-1 justify-center p-4">
        <Skeleton className={cn('h-full w-full', device === 'phone' ? 'max-w-[390px] rounded-[20px]' : 'max-w-[600px]')} />
      </div>
    );
  } else if (preview.isError && !data) {
    frame = (
      <div className="min-h-0 flex-1 bg-background">
        <LoadError what="the templates" error={explained(preview.error)} onRetry={() => void preview.refetch()} retrying={preview.isFetching} />
      </div>
    );
  } else if (empty) {
    frame = (
      <div className={cn('flex flex-1 items-center justify-center bg-background text-muted-foreground text-sm', GUTTER)}>
        site-api returned this template empty. Refresh, or check the notify templates in site-api.
      </div>
    );
  } else if (content) {
    frame = (
      <DeviceFrame
        frameRef={frameRef}
        device={device}
        desktopMin={680}
        title={`${template.index} ${template.label}`}
        srcDoc={content.srcDoc}
        src={content.src}
        sandbox={EMAIL_SET.has(key) ? 'allow-same-origin' : 'allow-same-origin allow-scripts allow-forms'}
        style={{ colorScheme: scheme, background: scheme === 'dark' ? '#0a0a0a' : '#ffffff' }}
        onLoad={() => applyScheme(frameRef.current, scheme)}
      />
    );
  }

  return (
    <div ref={rootRef} className="flex h-svh flex-col">
      <ScreenHeader title="Email templates" />
      {toolbar}
      <div className="flex min-h-0 flex-1">
        {split && (
          <div ref={listRef} className="flex w-60 shrink-0 flex-col overflow-y-auto overscroll-contain border-e">
            <TemplateGroup title="Emails" templates={EMAILS} current={key} onSelect={select} />
            <TemplateGroup title="Pages" templates={PAGES} current={key} onSelect={select} />
            <div className={cn('mt-auto flex flex-col gap-1 py-3 text-muted-foreground text-xs', GUTTER)}>
              <p className="flex items-center gap-1.5 pointer-coarse:hidden">
                <KbdGroup>
                  <Kbd>J</Kbd>
                  <Kbd>K</Kbd>
                </KbdGroup>
                move between templates
              </p>
              {data && (
                <p>
                  Rendered <Mono>{clock(data.generatedAt)}</Mono> for {data.source.channelTitle || 'the channel'}, {data.timezone}
                </p>
              )}
            </div>
          </div>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[hsl(240_6%_4%)]">
          <div className={cn('flex min-h-10 shrink-0 items-center gap-2 border-b bg-background py-2 text-sm', GUTTER)}>
            {content?.subject !== undefined ? (
              <>
                <span className="shrink-0 text-muted-foreground">Subject</span>
                <span className="min-w-0 truncate">{content.subject}</span>
              </>
            ) : (
              <>
                <Mono className="shrink-0 text-muted-foreground text-xs">{template.index}</Mono>
                <span className="min-w-0 truncate text-muted-foreground">{template.intent}</span>
              </>
            )}
          </div>
          {frame}
        </div>
      </div>
    </div>
  );
}
