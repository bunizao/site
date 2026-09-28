import * as React from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminBanInput,
  AdminBanKeyType,
  AdminBanPreview,
  AdminBanResult,
  AdminCommentActor,
  AdminSourceKeyType,
} from '@bunizao/contracts';
import { Button } from '@/components/coss/button';
import { Checkbox } from '@/components/coss/checkbox';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/coss/dialog';
import { Input } from '@/components/coss/input';
import { Label } from '@/components/coss/label';
import { Skeleton } from '@/components/coss/skeleton';
import { Switch } from '@/components/coss/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/coss/toggle-group';
import { toastManager } from '@/components/coss/toast';
import { cn } from '@/lib/utils';
import { apiSend, describeError } from '../app/api';
import { forgetUndo, registerUndo } from '../app/undo';
import { actorKeys, impactHold, namesOnePerson, shortHandle, sourceLabel } from './model';

/* One step: the keys that name one person arrive ticked (the session, and
   the address when it was verified at writing), the impact below them
   updates as ticks change, and the ban button already has focus, so B then
   Enter bans the obvious keys at once. A key other readers can share (a
   subnet, a network, a domain, a device fingerprint) is never ticked for
   you, pivots included: it takes a deliberate tick, and Ban waits until the
   impact of exactly the ticked keys is on screen. So does any removal. Undo
   in the receipt lifts the bans and restores anything removed. */

export const SHARED_WARNING: Partial<Record<AdminBanKeyType, string>> = {
  email: 'An unconfirmed address can be typed by anybody.',
  ip: 'Other readers on the same network share this address.',
  fp: 'Unrelated readers can share this network and browser signature.',
  client_fp: 'Device fingerprints collide across devices. A match is not one person.',
  domain: 'Blocks every comment linking to this domain, legitimate ones included.',
  ip24: 'Blocks the whole subnet: offices, carrier NATs, campuses.',
  asn: 'Blocks an entire network operator.',
  email_domain: 'Blocks every address at this domain.',
};

export const EXPIRY = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'never', label: 'Never' },
];

export type BanTarget =
  | { kind: 'actor'; actor: AdminCommentActor }
  | { kind: 'source'; type: AdminSourceKeyType; value: string; ban: AdminBanKeyType; display?: string | null; emailDomainPublishedComments?: number | null };

interface Choice {
  id: string;
  ban: AdminBanKeyType;
  label: string;
  value: string;
  display: string;
  banned: boolean;
}

function choicesFor(target: BanTarget): Choice[] {
  if (target.kind === 'source') {
    return [{
      id: `${target.ban}:${target.value}`,
      ban: target.ban,
      label: sourceLabel(target.type),
      value: target.value,
      display: target.display ?? shortHandle(target.value),
      banned: false,
    }];
  }
  const actor = target.actor;
  return actorKeys(actor)
    .filter((key) => key.ban !== null && !(key.id === 'clientFpStable' && actor.keys.clientFp))
    .map((key) => ({
      id: `${key.ban}:${key.value}`,
      ban: key.ban!,
      label: key.label,
      value: key.value,
      display: key.id === 'ip' && actor.ip ? actor.ip : key.id === 'email' && actor.email ? actor.email : shortHandle(key.value),
      banned: key.banned,
    }));
}

/** Memoized: the comment log re-renders on every j, and a closed dialog should not. */
export const BanDialog = React.memo(function BanDialog({ target, open, onOpenChange }: {
  target: BanTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-lg" initialFocus={confirmRef}>
        {target && (
          <BanForm
            key={JSON.stringify(target.kind === 'actor' ? target.actor.keys : target)}
            target={target}
            confirmRef={confirmRef}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogPopup>
    </Dialog>
  );
});

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function useBanPreview(keys: AdminBanInput['keys'], revokeReaderId: string | null) {
  return useQuery({
    queryKey: ['bans', 'preview', keys, revokeReaderId],
    queryFn: () => apiSend<AdminBanPreview>('POST', 'admin/bans/preview', { keys, revokeReaderId }),
    enabled: keys.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

function Impact({ keys, preview, purge }: {
  keys: AdminBanInput['keys'];
  preview: ReturnType<typeof useBanPreview>;
  purge: boolean;
}) {
  // Fixed height, so ticking a key never moves the buttons below.
  return (
    <div className="flex h-18 flex-col justify-center gap-1 rounded-lg bg-muted px-3 text-[13px] leading-5" aria-live="polite">
      {keys.length === 0 ? (
        <p className="text-muted-foreground">Tick at least one key.</p>
      ) : preview.isPending ? (
        <>
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </>
      ) : preview.isError ? (
        <p className="text-muted-foreground">
          The impact check failed: {describeError(preview.error)}{' '}
          <button type="button" className="text-foreground underline underline-offset-2" onClick={() => void preview.refetch()}>
            Check again
          </button>
        </p>
      ) : (
        <>
          <p className={cn('text-foreground', preview.isFetching && 'text-muted-foreground')}>
            Matches {plural(preview.data.comments.total, 'comment')} ({preview.data.comments.published} published, {preview.data.comments.held} held)
            {' '}and {plural(preview.data.reactions, 'reaction')} from {plural(preview.data.sessions, 'session')}
            {preview.data.accounts > 0 ? ` and ${plural(preview.data.accounts, 'account')}` : ''} in {preview.data.windowDays} days.
          </p>
          <p className="text-muted-foreground">
            {purge
              ? preview.data.purgeAllowed
                ? `Removes ${plural(preview.data.purge.comments, 'comment')} and ${plural(preview.data.purge.reactions, 'reaction')}, restorable for 30 days.`
                : `Too much to remove at once: the limit is ${preview.data.purgeLimit}. Untick a shared key or turn removal off.`
              : preview.data.comments.published > 3
                ? `${preview.data.comments.published} published comments is a lot for one person. Check no key is shared.`
                : 'Existing comments stay. New ones are held silently.'}
          </p>
        </>
      )}
    </div>
  );
}

function BanForm({ target, confirmRef, onDone }: {
  target: BanTarget;
  confirmRef: React.RefObject<HTMLButtonElement | null>;
  onDone: () => void;
}) {
  const client = useQueryClient();
  const actor = target.kind === 'actor' ? target.actor : null;
  const verified = actor?.authAtWrite === 'verified';
  const choices = React.useMemo(() => choicesFor(target), [target]);
  const published = target.kind === 'source' ? target.emailDomainPublishedComments : actor?.emailDomainPublishedComments;
  const domainLocked = published === null || published === undefined || published > 10;

  const [ticked, setTicked] = React.useState<Set<string>>(() => new Set(
    choices
      .filter((choice) => !choice.banned && namesOnePerson(choice.ban, verified))
      .map((choice) => choice.id),
  ));
  const [note, setNote] = React.useState('');
  // Seven days, as site-api gives a ban that names no expiry.
  const [expiry, setExpiry] = React.useState('7');
  const [purge, setPurge] = React.useState(false);
  const [revoke, setRevoke] = React.useState(false);

  const selected = choices.filter((choice) => ticked.has(choice.id) && !(choice.ban === 'email_domain' && domainLocked));
  const keys = React.useMemo(
    () => selected.map((choice) => ({ type: choice.ban, value: choice.value })),
    // `selected` is rebuilt every render; its ids are the identity.
    [selected.map((choice) => choice.id).join('|')],
  );
  const revokeReaderId = revoke && actor ? actor.readerId : null;
  const preview = useBanPreview(keys, revokeReaderId);
  // A shared key or a removal waits for the impact of exactly these keys,
  // not the last keys' impact still on screen. A shared key pressed blind
  // may ban a whole subnet; a removal pressed early would read "Banned" for
  // a write site-api may then refuse.
  const hold = impactHold(selected.map((choice) => choice.ban), verified, purge);
  const impactUnknown = hold !== null && (preview.data === undefined || preview.isPlaceholderData);
  const overLimit = purge && preview.data !== undefined && !preview.data.purgeAllowed;
  const blocked = keys.length === 0
    ? 'Tick at least one key.'
    : impactUnknown
      ? preview.isError
        ? `The impact check failed. Check again or ${hold === 'shared' ? 'untick the shared keys' : 'turn removal off'}.`
        : `Checking what the ${purge ? 'removal' : 'ban'} reaches.`
      : overLimit ? 'Too much to remove at once.' : null;

  function apply(): void {
    if (blocked) return;
    const input: AdminBanInput = {
      keys,
      note: note.trim() || undefined,
      expiresAt: expiry === 'never' ? null : new Date(Date.now() + Number(expiry) * 86_400_000).toISOString(),
      purge,
      revokeReaderId,
    };
    onDone();
    const request = apiSend<AdminBanResult>('POST', 'admin/bans', input);
    let undone = false;
    const toastId: string = toastManager.add({
      type: 'success',
      title: `Banned ${plural(keys.length, 'key')}`,
      description: purge ? 'Their last 90 days are being removed.' : 'Their next comments are held silently.',
      timeout: 8000,
      actionProps: {
        children: 'Undo',
        onClick: () => undo(),
      },
      onRemove: () => forgetUndo(toastId),
    });
    const undo = (): void => {
      if (undone) return;
      undone = true;
      void request
        .then(async (result) => {
          await Promise.all(result.bans.map((ban) =>
            apiSend('DELETE', `admin/bans/${encodeURIComponent(ban.keyType)}/${encodeURIComponent(ban.keyValue)}`)));
          if (result.operation && result.purged.comments + result.purged.reactions > 0) {
            await apiSend('POST', `admin/bans/operations/${encodeURIComponent(result.operation.id)}/restore`);
          }
          toastManager.add({
            type: 'success',
            title: 'Ban lifted',
            description: input.revokeReaderId ? 'The reader account stays banned. Unban it from Bans.' : undefined,
            timeout: 4000,
          });
        })
        .catch((error) => toastManager.add({ type: 'error', title: 'The ban was not lifted', description: `${describeError(error)} Lift it from Bans.` }))
        .finally(() => {
          void client.invalidateQueries({ queryKey: ['comments'] });
          void client.invalidateQueries({ queryKey: ['bans'] });
        });
    };
    registerUndo(toastId, undo);
    request.then(
      () => {
        void client.invalidateQueries({ queryKey: ['comments'] });
        void client.invalidateQueries({ queryKey: ['bans'] });
      },
      (error) => {
        toastManager.close(toastId);
        toastManager.add({ type: 'error', title: 'The ban was not saved', description: `${describeError(error)} Press B to open it again.` });
      },
    );
  }

  const title = target.kind === 'source' ? `Ban this ${sourceLabel(target.type).toLowerCase()}` : 'Ban this writer';

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Their comments are held and their reactions go nowhere. Nothing tells them.</DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <fieldset className="flex flex-col">
          <legend className="sr-only">Keys to ban</legend>
          {choices.length === 0 && <p className="text-muted-foreground text-sm">This comment carries no key a ban can hold.</p>}
          {choices.map((choice) => {
            const locked = choice.ban === 'email_domain' && domainLocked;
            const warning = choice.ban === 'email' && verified
              ? null
              : choice.ban === 'email_domain'
                ? published === null || published === undefined
                  ? 'Unavailable: the published-comment count for this domain did not load.'
                  : `${published} published comments here in 90 days.${locked ? ' Domain bans are off above 10.' : ''}`
                : SHARED_WARNING[choice.ban];
            return (
              <label
                key={choice.id}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50 has-disabled:cursor-not-allowed"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={ticked.has(choice.id)}
                  disabled={locked || choice.banned}
                  onCheckedChange={(value) => setTicked((current) => {
                    const next = new Set(current);
                    if (value) next.add(choice.id);
                    else next.delete(choice.id);
                    return next;
                  })}
                />
                <span className="flex min-w-0 flex-1 flex-col text-[13px] leading-5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-medium">{choice.label}</span>
                    <code className="truncate font-mono text-muted-foreground text-xs" title={choice.value}>{choice.display}</code>
                    {choice.banned && <span className="shrink-0 text-[hsl(var(--portal-danger))] text-xs">Already banned</span>}
                  </span>
                  {warning && <span className="text-muted-foreground text-xs">{warning}</span>}
                </span>
              </label>
            );
          })}
        </fieldset>

        <Impact keys={keys} preview={preview} purge={purge} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Label id="ban-expiry-label" className="text-[13px]">Expires after</Label>
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

        <Input
          aria-label="Note to yourself"
          value={note}
          placeholder="Note to yourself, for the ban list"
          onChange={(event) => setNote(event.target.value)}
        />

        <label className="flex min-h-11 items-center justify-between gap-4 text-[13px]">
          <span className="flex flex-col">
            <span className="font-medium">Remove their last 90 days</span>
            <span className="text-muted-foreground text-xs">Soft-deletes their comments and removes their reactions.</span>
          </span>
          <Switch checked={purge} onCheckedChange={setPurge} />
        </label>

        {actor?.readerId && verified && (
          <label className="flex min-h-11 items-center justify-between gap-4 text-[13px]">
            <span className="flex flex-col">
              <span className="font-medium">Ban their reader account too</span>
              <span className="text-muted-foreground text-xs">They wrote this signed in. This blocks the account, not just this device.</span>
            </span>
            <Switch checked={revoke} onCheckedChange={setRevoke} />
          </label>
        )}
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          ref={confirmRef}
          type="submit"
          variant="destructive"
          aria-disabled={blocked ? true : undefined}
          title={blocked ?? undefined}
          className="aria-disabled:opacity-64"
        >
          Ban {plural(keys.length, 'key')}
        </Button>
      </DialogFooter>
    </form>
  );
}
