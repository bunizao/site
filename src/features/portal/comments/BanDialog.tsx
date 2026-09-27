import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  AdminBanInput,
  AdminBanKeyType,
  AdminBanPreview,
  AdminBanResult,
  AdminCommentActor,
  AdminSourceKeyType,
} from '@bunizao/contracts';
import { ShieldAlert, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/coss/alert';
import { Button } from '@/components/coss/button';
import { Checkbox } from '@/components/coss/checkbox';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/coss/dialog';
import { Label } from '@/components/coss/label';
import { Switch } from '@/components/coss/switch';
import { Textarea } from '@/components/coss/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/coss/toggle-group';
import { toastManager } from '@/components/coss/toast';
import { apiSend, describeError } from '../app/api';
import { KEY_KINDS, actorKeys, shortHandle } from './model';

/* Two steps, because a ban on a shared key can reach strangers: choose the
   keys, then read what they match before anything is written. Session and a
   verified address start ticked; every shared key needs a deliberate tick. */

const SHARED_WARNING: Partial<Record<AdminBanKeyType, string>> = {
  email: 'An unconfirmed address can be typed by anybody.',
  ip: 'Other readers on the same network share this address.',
  fp: 'Unrelated readers can share this network and browser signature.',
  client_fp: 'Device fingerprints collide across devices. A match is not one person.',
  domain: 'Blocks every comment linking to this domain, legitimate ones included.',
  ip24: 'Blocks the whole subnet: offices, carrier NATs, campuses.',
  asn: 'Blocks an entire network operator.',
  email_domain: 'Blocks every address at this domain.',
};

const EXPIRY = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'never', label: 'Never' },
];

export type BanTarget =
  | { kind: 'actor'; actor: AdminCommentActor }
  | { kind: 'source'; type: AdminSourceKeyType; value: string; ban: AdminBanKeyType; emailDomainPublishedComments?: number | null };

interface Choice {
  id: string;
  ban: AdminBanKeyType;
  label: string;
  value: string;
  banned: boolean;
}

function choicesFor(target: BanTarget): Choice[] {
  if (target.kind === 'source') {
    const label = Object.values(KEY_KINDS).find((kind) => kind.source === target.type)?.label ?? target.type;
    return [{ id: `${target.ban}:${target.value}`, ban: target.ban, label, value: target.value, banned: false }];
  }
  return actorKeys(target.actor)
    .filter((key) => key.ban !== null)
    .map((key) => ({ id: `${key.ban}:${key.value}`, ban: key.ban!, label: key.label, value: key.value, banned: key.banned }));
}

export function BanDialog({ target, open, onOpenChange }: {
  target: BanTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-lg">
        {target && <BanForm key={JSON.stringify(target.kind === 'actor' ? target.actor.keys : target)} target={target} onDone={() => onOpenChange(false)} />}
      </DialogPopup>
    </Dialog>
  );
}

function BanForm({ target, onDone }: { target: BanTarget; onDone: () => void }) {
  const client = useQueryClient();
  const actor = target.kind === 'actor' ? target.actor : null;
  const verified = actor?.authAtWrite === 'verified';
  const choices = React.useMemo(() => choicesFor(target), [target]);
  const published = target.kind === 'source' ? target.emailDomainPublishedComments : actor?.emailDomainPublishedComments;
  const domainLocked = published === null || published === undefined || published > 10;

  const [ticked, setTicked] = React.useState<Set<string>>(() => new Set(
    choices
      .filter((choice) => target.kind === 'source' || choice.ban === 'session' || (choice.ban === 'email' && verified))
      .map((choice) => choice.id),
  ));
  const [note, setNote] = React.useState('');
  const [expiry, setExpiry] = React.useState('30');
  const [purge, setPurge] = React.useState(false);
  const [revoke, setRevoke] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [review, setReview] = React.useState<{ input: AdminBanInput; impact: AdminBanPreview } | null>(null);

  const selected = choices.filter((choice) => ticked.has(choice.id) && !(choice.ban === 'email_domain' && domainLocked));

  async function preview(): Promise<void> {
    setBusy(true);
    setError(null);
    const input: AdminBanInput = {
      keys: selected.map((choice) => ({ type: choice.ban, value: choice.value })),
      note: note.trim() || undefined,
      expiresAt: expiry === 'never' ? null : new Date(Date.now() + Number(expiry) * 86_400_000).toISOString(),
      purge,
      revokeReaderId: revoke && actor ? actor.readerId : null,
    };
    try {
      const impact = await apiSend<AdminBanPreview>('POST', 'admin/bans/preview', { keys: input.keys, revokeReaderId: input.revokeReaderId });
      setReview({ input, impact });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function apply(): Promise<void> {
    if (!review) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiSend<AdminBanResult>('POST', 'admin/bans', review.input);
      void client.invalidateQueries({ queryKey: ['comments'] });
      void client.invalidateQueries({ queryKey: ['bans'] });
      const purged = result.purged.comments + result.purged.reactions;
      toastManager.add({
        type: 'success',
        title: `Banned ${result.bans.length} ${result.bans.length === 1 ? 'key' : 'keys'}`,
        description: purged > 0
          ? `Removed ${result.purged.comments} comments and ${result.purged.reactions} reactions. Restore them from Bans → History.`
          : 'Their next comments will be held silently.',
      });
      onDone();
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  const overLimit = Boolean(review?.input.purge && !review.impact.purgeAllowed);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{review ? 'Review the impact' : 'Ban this source'}</DialogTitle>
        <DialogDescription>
          {review
            ? `What these keys matched in the last ${review.impact.windowDays} days. Shared keys can include unrelated readers.`
            : 'Their comments are held and their reactions go nowhere. Nothing tells them they are banned.'}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        {!review ? (
          <div className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-2 font-medium text-sm">Keys to ban</legend>
              {choices.length === 0 && <p className="text-muted-foreground text-sm">This row carries no key a ban can hold.</p>}
              {choices.map((choice) => {
                const locked = choice.ban === 'email_domain' && domainLocked;
                const warning = choice.ban === 'email' && verified ? null : SHARED_WARNING[choice.ban];
                return (
                  <label
                    key={choice.id}
                    className="flex cursor-pointer gap-3 rounded-lg px-2 py-2 hover:bg-accent/50 has-disabled:cursor-not-allowed has-disabled:opacity-64"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={ticked.has(choice.id)}
                      disabled={locked || busy}
                      onCheckedChange={(value) => setTicked((current) => {
                        const next = new Set(current);
                        if (value) next.add(choice.id);
                        else next.delete(choice.id);
                        return next;
                      })}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{choice.label}</span>
                        <code className="truncate font-code text-muted-foreground text-xs">{shortHandle(choice.value)}</code>
                        {choice.banned && <span className="text-destructive-foreground text-xs">Already banned</span>}
                      </span>
                      {warning && <span className="text-muted-foreground text-xs">{warning}</span>}
                      {choice.ban === 'email_domain' && (
                        <span className="text-muted-foreground text-xs">
                          {published === null || published === undefined
                            ? 'Unavailable: the published-comment count for this domain did not load.'
                            : `${published} published comments here in 90 days.${locked ? ' Domain bans are off above 10.' : ''}`}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <div className="flex flex-col gap-2">
              <Label id="ban-expiry-label">Expires after</Label>
              <ToggleGroup
                aria-labelledby="ban-expiry-label"
                value={[expiry]}
                onValueChange={(value) => value[0] && setExpiry(value[0])}
                variant="outline"
                size="sm"
              >
                {EXPIRY.map((choice) => (
                  <ToggleGroupItem key={choice.value} value={choice.value}>{choice.label}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ban-note">Note to yourself</Label>
              <Textarea
                id="ban-note"
                rows={2}
                value={note}
                disabled={busy}
                placeholder="What this was, for when you read the ban list later"
                onChange={(event) => setNote(event.target.value)}
              />
            </div>

            <label className="flex items-start justify-between gap-4 text-sm">
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">Remove their last 90 days</span>
                <span className="text-muted-foreground text-xs">Soft-deletes their comments and removes their reactions. Restorable for 30 days.</span>
              </span>
              <Switch checked={purge} disabled={busy} onCheckedChange={setPurge} />
            </label>

            {actor?.readerId && verified && (
              <label className="flex items-start justify-between gap-4 text-sm">
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">Ban their reader account too</span>
                  <span className="text-muted-foreground text-xs">They wrote this signed in. This blocks the account, not just this device.</span>
                </span>
                <Switch checked={revoke} disabled={busy} onCheckedChange={setRevoke} />
              </label>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-sm">
              {([
                ['Accounts', review.impact.accounts],
                ['Sessions', review.impact.sessions],
                ['Reactions', review.impact.reactions],
                ['Comments', review.impact.comments.total],
                ['Published', review.impact.comments.published],
                ['Held', review.impact.comments.held],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5 bg-card px-3 py-2.5">
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="font-medium text-lg tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <ul className="flex flex-col gap-1.5 text-muted-foreground text-sm">
              <li>Keys: {review.input.keys.map((key) => `${key.type} ${shortHandle(key.value)}`).join(', ')}</li>
              <li>{review.input.expiresAt ? `Expires ${new Date(review.input.expiresAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}` : 'Never expires'}</li>
              <li>
                {review.input.purge
                  ? `Removes ${review.impact.purge.comments} comments and ${review.impact.purge.reactions} reactions`
                  : 'Existing comments and reactions stay where they are'}
              </li>
              {review.input.revokeReaderId && <li>Also bans the reader account</li>}
            </ul>
            {review.impact.comments.published > 3 && (
              <Alert variant="warning">
                <TriangleAlert />
                <AlertTitle>This reaches {review.impact.comments.published} published comments</AlertTitle>
                <AlertDescription>That is a lot for one person. Check the keys are not shared before applying.</AlertDescription>
              </Alert>
            )}
            {overLimit && (
              <Alert variant="error">
                <ShieldAlert />
                <AlertTitle>Too much to remove at once</AlertTitle>
                <AlertDescription>
                  The limit is {review.impact.purgeLimit} records. Go back and untick a shared key, or turn removal off.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
        {error && (
          <Alert variant="error" className="mt-4">
            <ShieldAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </DialogPanel>
      <DialogFooter>
        {review && (
          <Button variant="ghost" disabled={busy} onClick={() => { setReview(null); setError(null); }}>
            Back
          </Button>
        )}
        <Button
          variant={review ? 'destructive' : 'default'}
          loading={busy}
          disabled={selected.length === 0 || overLimit}
          onClick={() => void (review ? apply() : preview())}
        >
          {review ? `Ban ${review.input.keys.length} ${review.input.keys.length === 1 ? 'key' : 'keys'}` : 'Check impact'}
        </Button>
      </DialogFooter>
    </>
  );
}
