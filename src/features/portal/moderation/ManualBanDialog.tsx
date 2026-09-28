import * as React from 'react';
import type { AdminBan, AdminBanKeyType, AdminBanPreview } from '@bunizao/contracts';
import { Button } from '@/components/coss/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/coss/dialog';
import { Input } from '@/components/coss/input';
import { Kbd } from '@/components/coss/kbd';
import { Label } from '@/components/coss/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/coss/toggle-group';
import { cn } from '@/lib/utils';
import { apiSend } from '../app/api';
import { namesOnePerson } from '../comments/model';
import { describeBanError, type BanDraft } from './data';
import { BAN_TYPES, BAN_TYPE_LABELS, RAW_BAN_TYPES, expiryText, formatCount, plural } from './format';
import { StatusDot } from './ui';

/* Ban a key by hand: one form, no second step. What the key reaches is
   looked up while you type and shown under the field, so reading the impact
   costs no extra click, and a refusal the server would give (a protected
   email domain) shows up before you press Ban. A key other readers can
   share waits for that impact, as in the comment ban dialog; a failed
   check does not block it. Pressing Ban closes the dialog at once; the
   row is already in the list, with undo in the toast. */

const EXPIRY: Array<{ value: string; label: string; days: number | null }> = [
  { value: '7', label: '7 days', days: 7 },
  { value: '30', label: '30 days', days: 30 },
  { value: '90', label: '90 days', days: 90 },
  { value: 'never', label: 'Never', days: null },
];

const PLACEHOLDER: Record<AdminBanKeyType, string> = {
  session: 'Session hash from a comment',
  email: 'Email hash from a comment',
  client_fp: 'Device fingerprint hash',
  ip: 'IP hash from a comment',
  fp: 'Network signature hash',
  ip24: 'Subnet hash from a comment',
  asn: '14061 or AS14061',
  domain: 'example.com',
  email_domain: 'mailinator.com',
};

export type Normalized = { value: string; hint: string | null } | { error: string };

/** The value as site-api stores it, or why it cannot be one. */
export function normalizeKey(type: AdminBanKeyType, raw: string): Normalized {
  const text = raw.trim();
  if (!text) return { error: 'Enter a value.' };
  if (text.length > 512) return { error: 'That is longer than any key. Paste it again.' };
  if (type === 'asn') {
    const match = /^(?:as)?\s*(\d{1,10})$/i.exec(text);
    return match ? { value: match[1], hint: null } : { error: 'A network is its ASN, a number such as 14061.' };
  }
  if (type === 'domain') {
    let host = text.toLowerCase();
    try {
      if (/^[a-z][a-z0-9+.-]*:\/\//.test(host)) host = new URL(host).hostname;
    } catch {
      return { error: 'That link does not parse. Paste just the domain, like example.com.' };
    }
    host = host.split('/')[0].replace(/\.$/, '').replace(/^www\./, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return { error: 'A domain looks like example.com.' };
    return {
      value: host,
      hint: host.split('.').length > 2
        ? 'Links match by registrable domain, so blog.example.com is stored as example.com. Ban the parent if this does not match.'
        : null,
    };
  }
  if (type === 'email_domain') {
    const domain = text.toLowerCase().split('@').pop()!.trim();
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return { error: 'An email domain looks like mailinator.com.' };
    return { value: domain, hint: null };
  }
  if (/\s/.test(text)) return { error: 'A hash has no spaces. Copy it from a comment’s key list.' };
  if (type === 'email' && text.includes('@')) {
    return { error: 'Addresses are stored hashed. Open one of their comments and ban from there, or paste the hash.' };
  }
  return { value: text, hint: null };
}

type Impact =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; preview: AdminBanPreview }
  | { state: 'refused'; message: string }
  | { state: 'failed' };

/** What the key reaches, fetched once typing pauses. An answer counts only
    for the key it was asked about, so a new key reads as loading from its
    first render, never as the last key's impact. */
function useImpact(type: AdminBanKeyType, value: string | null): Impact {
  const key = value ? `${type}:${value}` : null;
  const [answer, setAnswer] = React.useState<{ key: string; impact: Impact } | null>(null);
  React.useEffect(() => {
    if (!key) return;
    let live = true;
    const timer = setTimeout(() => {
      apiSend<AdminBanPreview>('POST', 'admin/bans/preview', { keys: [{ type, value }], revokeReaderId: null }).then(
        (preview) => live && setAnswer({ key, impact: { state: 'ready', preview } }),
        (error: unknown) => {
          if (!live) return;
          const code = (error as { code?: string | null }).code;
          const refused = code === 'protected_email_domain' || code === 'invalid_key';
          setAnswer({ key, impact: refused ? { state: 'refused', message: describeBanError(error) } : { state: 'failed' } });
        },
      );
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key]);
  if (!key) return { state: 'idle' };
  return answer?.key === key ? answer.impact : { state: 'loading' };
}

export function ManualBanDialog({ open, onOpenChange, initial, existing, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A draft to start from, when retrying a refused ban. */
  initial: BanDraft | null;
  existing: (type: AdminBanKeyType, value: string) => AdminBan | undefined;
  onSubmit: (draft: BanDraft) => void;
}) {
  const onChangeRef = React.useRef(onOpenChange);
  onChangeRef.current = onOpenChange;
  const cancel = React.useCallback(() => onChangeRef.current(false), []);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="duration-150 motion-reduce:transition-none sm:max-w-md">
        {open && <BanForm initial={initial} existing={existing} onSubmit={onSubmit} onCancel={cancel} />}
      </DialogPopup>
    </Dialog>
  );
}

// Memo: the popup re-renders on each step of opening; the form need not.
const BanForm = React.memo(function BanForm({ initial, existing, onSubmit, onCancel }: {
  initial: BanDraft | null;
  existing: (type: AdminBanKeyType, value: string) => AdminBan | undefined;
  onSubmit: (draft: BanDraft) => void;
  onCancel: () => void;
}) {
  const [type, setType] = React.useState<AdminBanKeyType>(initial?.type ?? 'session');
  const [raw, setRaw] = React.useState(initial?.value ?? '');
  const [note, setNote] = React.useState(initial?.note ?? '');
  // Seven days, as site-api gives a ban that names no expiry.
  const [expiry, setExpiry] = React.useState(
    initial ? (initial.days === null ? 'never' : String(initial.days)) : '7',
  );
  const [touched, setTouched] = React.useState(Boolean(initial));

  const normalized = normalizeKey(type, raw);
  const value = 'value' in normalized ? normalized.value : null;
  const impact = useImpact(type, value);
  const current = value ? existing(type, value) : undefined;
  const refused = impact.state === 'refused';
  // A pasted email hash counts as one person here: the dialog cannot know
  // whether it was verified, and it bans that one address only.
  const held = impact.state === 'loading' && !namesOnePerson(type, true);
  const valueError = 'error' in normalized && touched ? normalized.error : null;

  const submit = (event: React.SubmitEvent): void => {
    event.preventDefault();
    setTouched(true);
    if (!value || refused || held) return;
    onSubmit({ type, value, note, days: EXPIRY.find((choice) => choice.value === expiry)?.days ?? 7 });
  };

  return (
    <form onSubmit={submit} className="contents">
      <DialogHeader>
        <DialogTitle>Ban a key</DialogTitle>
        <DialogDescription>Comments that match are held silently and reactions are dropped. Nothing tells the writer.</DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label id="manual-ban-type">Key</Label>
          <ToggleGroup
            aria-labelledby="manual-ban-type"
            value={[type]}
            onValueChange={(next) => next[0] && setType(next[0] as AdminBanKeyType)}
            variant="outline"
            size="sm"
            className="grid w-full grid-cols-2 gap-1 *:w-full sm:grid-cols-3"
          >
            {BAN_TYPES.map((kind) => (
              <ToggleGroupItem key={kind} value={kind} className="justify-start rounded-md!">
                {BAN_TYPE_LABELS[kind]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-muted-foreground text-xs">
            {RAW_BAN_TYPES.has(type)
              ? 'Stored as written.'
              : 'Stored as a hash. Copy it from a comment’s key list or an insights row.'}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="manual-ban-value">Value</Label>
          <Input
            id="manual-ban-value"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="font-mono pointer-coarse:*:h-10.5!"
            placeholder={PLACEHOLDER[type]}
            value={raw}
            aria-invalid={Boolean(valueError) || refused}
            aria-describedby="manual-ban-impact"
            onChange={(event) => setRaw(event.target.value)}
            onBlur={() => raw && setTouched(true)}
          />
          <div id="manual-ban-impact" aria-live="polite" className="min-h-10 text-xs">
            <ImpactLine
              valueError={valueError}
              hint={'hint' in normalized ? normalized.hint : null}
              normalized={value && value !== raw.trim() ? value : null}
              impact={impact}
              held={held}
              current={current}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label id="manual-ban-expiry">Expires after</Label>
          <ToggleGroup
            aria-labelledby="manual-ban-expiry"
            value={[expiry]}
            onValueChange={(next) => next[0] && setExpiry(next[0])}
            variant="outline"
            size="sm"
          >
            {EXPIRY.map((choice) => (
              <ToggleGroupItem key={choice.value} value={choice.value}>{choice.label}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="manual-ban-note">Note to yourself</Label>
          <Input
            id="manual-ban-note"
            className="pointer-coarse:*:h-10.5!"
            autoComplete="off"
            placeholder="What this was, for when you read the list later"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="destructive" disabled={refused || held}>
          {current ? 'Update ban' : 'Ban'}
          <Kbd className="max-sm:hidden bg-transparent text-current">↵</Kbd>
        </Button>
      </DialogFooter>
    </form>
  );
});

function ImpactLine({ valueError, hint, normalized, impact, held, current }: {
  valueError: string | null;
  hint: string | null;
  normalized: string | null;
  impact: Impact;
  held: boolean;
  current: AdminBan | undefined;
}) {
  if (valueError) return <StatusDot tone="danger" className="whitespace-normal">{valueError}</StatusDot>;
  const lines: React.ReactNode[] = [];
  if (normalized) lines.push(<span key="n">Saved as <code className="font-mono">{normalized}</code>.</span>);
  if (current) {
    lines.push(
      <span key="c">
        Already banned, {current.expiresAt ? `ending ${expiryText(current.expiresAt)}` : 'with no end date'}. Saving replaces its note and expiry.
      </span>,
    );
  }
  if (impact.state === 'loading') {
    lines.push(
      <span key="i" className="text-muted-foreground">
        {held ? 'Checking what this matches. Ban waits: others can share this key.' : 'Checking what this matches…'}
      </span>,
    );
  }
  if (impact.state === 'failed') lines.push(<span key="i" className="text-muted-foreground">Could not check what this matches. You can still ban it.</span>);
  if (impact.state === 'refused') lines.push(<StatusDot key="i" tone="danger" className="whitespace-normal">{impact.message}</StatusDot>);
  if (impact.state === 'ready') {
    const { comments, reactions, sessions } = impact.preview;
    const reach = comments.total + reactions;
    lines.push(
      <StatusDot key="i" tone={comments.published > 3 ? 'warning' : 'neutral'} className="whitespace-normal">
        {reach === 0
          ? 'Matches nothing in the last 90 days.'
          : `Matches ${plural(comments.total, 'comment')} (${formatCount(comments.published)} published) and ${plural(reactions, 'reaction')} from ${plural(sessions, 'session')} in 90 days.`}
      </StatusDot>,
    );
  }
  if (hint) lines.push(<span key="h" className="text-muted-foreground">{hint}</span>);
  return <div className={cn('flex flex-col gap-1 text-muted-foreground')}>{lines}</div>;
}
