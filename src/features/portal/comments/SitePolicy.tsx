import * as React from 'react';
import type { AdminCommentSiteMode, AdminCommentSitePolicy } from '@bunizao/contracts';
import { Button } from '@/components/coss/button';
import { Switch } from '@/components/coss/switch';
import { cn } from '@/lib/utils';
import { Dot, SMALL, STATUS_LINE, statusLinePx } from '../activity/table';
import { Segmented } from '../moderation/segmented';
import { sinceText, useSetSitePolicy, useSitePolicy } from './site-policy';

/* The site-wide switches as controls (Home, Post modes) and as the
   Comments header's lines. Data and copy live in site-policy.ts. */

type SiteChoice = AdminCommentSiteMode | 'open';

const SITE_CHOICES: Array<{ value: SiteChoice; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'readonly', label: 'Read-only' },
  { value: 'off', label: 'Off' },
];

/** Open · Read-only · Off for every post. Open is no site-wide rule. */
export function SiteModeSwitch({ policy, className }: { policy: AdminCommentSitePolicy; className?: string }) {
  const set = useSetSitePolicy();
  return (
    <Segmented<SiteChoice>
      label="Comments everywhere"
      value={policy.mode ?? 'open'}
      options={SITE_CHOICES}
      onChange={(choice) => void set({ mode: choice === 'open' ? null : choice })}
      className={className}
    />
  );
}

/** Labelled for its ON state; the row around it names it too. */
export function RequireEmailSwitch({ policy, describedBy }: { policy: AdminCommentSitePolicy; describedBy?: string }) {
  const set = useSetSitePolicy();
  return (
    <Switch
      aria-label="Require a confirmed email"
      aria-describedby={describedBy}
      checked={policy.requireEmail}
      onCheckedChange={(checked) => void set({ requireEmail: checked })}
    />
  );
}


const since = (iso: string | null, what: string): string => (iso ? `since ${sinceText(iso)} · ${what}` : what);

interface Line {
  key: string;
  label: string;
  detail: string;
  action: string;
  run: () => void;
}

/** The Comments header's lines, one per switch that is on, each with its
    way back, in the lockdown line's treatment. Their arrival or departure
    mid-session moves the list's scroll offset by their height, so the rows
    on screen stay where they were. */
export function SitePolicyLines({ scrollRef }: { scrollRef: React.RefObject<HTMLElement | null> }) {
  const policy = useSitePolicy().data?.policy;
  const set = useSetSitePolicy();

  const lines: Line[] = [];
  if (policy?.mode) {
    const off = policy.mode === 'off';
    lines.push({
      key: 'mode',
      label: off ? 'Comments off everywhere' : 'Read-only everywhere',
      detail: since(policy.modeSince, off ? 'comment sections are hidden' : 'nobody can add a comment'),
      action: 'Reopen',
      run: () => void set({ mode: null }),
    });
  }
  if (policy?.requireEmail) {
    lines.push({
      key: 'email',
      label: 'Email required everywhere',
      detail: since(policy.requireEmailSince, 'anonymous comments wait for an email'),
      action: 'Stop requiring',
      run: () => void set({ requireEmail: false }),
    });
  }

  const count = lines.length;
  const wasCount = React.useRef(count);
  React.useLayoutEffect(() => {
    if (wasCount.current === count) return;
    const delta = count - wasCount.current;
    wasCount.current = count;
    const node = scrollRef.current;
    if (!node || node.scrollTop <= 0) return;
    node.scrollTop += delta * statusLinePx();
  }, [count, scrollRef]);

  return lines.map((line) => (
    <div key={line.key} role="status" className={STATUS_LINE}>
      <span className="flex shrink-0 items-center gap-2">
        <Dot tone="attention" />
        <span className="font-medium">{line.label}</span>
      </span>
      {/* A phone has room for the label and the button only. */}
      <span className="min-w-0 flex-1 truncate text-muted-foreground max-sm:invisible">{line.detail}</span>
      <Button size="sm" variant="outline" className={cn(SMALL, 'shrink-0 pointer-coarse:h-9')} onClick={line.run}>
        {line.action}
      </Button>
    </div>
  ));
}
